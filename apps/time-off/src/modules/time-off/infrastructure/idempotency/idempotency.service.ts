import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { createHash } from 'crypto';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IdempotencyRecordOrmEntity } from '../persistence/typeorm/entities/idempotency-record.orm-entity';

export interface StoredResponse {
  status: number;
  body: unknown;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  private readonly TTL_HOURS = parseInt(process.env.IDEMPOTENCY_TTL_HOURS || '24', 10);

  constructor(
    @InjectRepository(IdempotencyRecordOrmEntity)
    private readonly repo: Repository<IdempotencyRecordOrmEntity>,
  ) {}

  static hashRequest(method: string, path: string, body: unknown): string {
    return createHash('sha256')
      .update(`${method}:${path}:${JSON.stringify(body ?? {})}`)
      .digest('hex');
  }

  async findByKey(key: string): Promise<IdempotencyRecordOrmEntity | null> {
    const record = await this.repo.findOne({ where: { key } });
    if (!record) return null;
    if (new Date() > record.expiresAt) {
      await this.repo.delete({ key });
      return null;
    }
    return record;
  }

  async store(
    key: string,
    requestHash: string,
    response: StoredResponse,
  ): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.TTL_HOURS * 60 * 60 * 1000);
    const record = this.repo.create({
      key,
      requestHash,
      responseBody: JSON.stringify(response.body),
      responseStatus: response.status,
      processedAt: now,
      expiresAt,
    });
    await this.repo.save(record);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredKeys(): Promise<void> {
    const result = await this.repo.delete({ expiresAt: LessThan(new Date()) });
    if ((result.affected ?? 0) > 0) {
      this.logger.log(`Cleaned up ${result.affected} expired idempotency keys`);
    }
  }
}
