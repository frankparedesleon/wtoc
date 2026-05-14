import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ITimeOffRequestRepository } from '../../../domain/repositories';
import { TimeOffRequest, RequestStatus } from '../../../domain/entities/time-off-request.entity';
import { TimeOffRequestOrmEntity } from '../typeorm/entities/time-off-request.orm-entity';
import { TimeOffRequestMapper } from '../mappers/time-off-request.mapper';

@Injectable()
export class TimeOffRequestRepository implements ITimeOffRequestRepository {
  constructor(
    @InjectRepository(TimeOffRequestOrmEntity)
    private readonly repo: Repository<TimeOffRequestOrmEntity>,
  ) {}

  async save(request: TimeOffRequest): Promise<void> {
    const orm = TimeOffRequestMapper.toOrm(request);
    await this.repo.save(orm);
  }

  async findById(id: string): Promise<TimeOffRequest | null> {
    const orm = await this.repo.findOne({ where: { id } });
    return orm ? TimeOffRequestMapper.toDomain(orm) : null;
  }

  async findByIdempotencyKey(key: string): Promise<TimeOffRequest | null> {
    const orm = await this.repo.findOne({ where: { idempotencyKey: key } });
    return orm ? TimeOffRequestMapper.toDomain(orm) : null;
  }

  async findByEmployeeAndLocation(
    employeeId: string,
    locationId: string,
  ): Promise<TimeOffRequest[]> {
    const orms = await this.repo.find({ where: { employeeId, locationId } });
    return orms.map(TimeOffRequestMapper.toDomain);
  }

  async findPendingByBalance(
    employeeId: string,
    locationId: string,
  ): Promise<TimeOffRequest[]> {
    const orms = await this.repo
      .createQueryBuilder('r')
      .where('r.employeeId = :employeeId', { employeeId })
      .andWhere('r.locationId = :locationId', { locationId })
      .andWhere('r.status IN (:...statuses)', {
        statuses: [RequestStatus.PENDING, RequestStatus.AWAITING_APPROVAL],
      })
      .orderBy('r.createdAt', 'ASC')
      .getMany();
    return orms.map(TimeOffRequestMapper.toDomain);
  }

  async findAll(filters?: {
    employeeId?: string;
    locationId?: string;
    status?: RequestStatus;
    startDate?: string;
    endDate?: string;
  }): Promise<TimeOffRequest[]> {
    const qb = this.repo.createQueryBuilder('r');
    if (filters?.employeeId) qb.andWhere('r.employeeId = :employeeId', { employeeId: filters.employeeId });
    if (filters?.locationId) qb.andWhere('r.locationId = :locationId', { locationId: filters.locationId });
    if (filters?.status) qb.andWhere('r.status = :status', { status: filters.status });
    if (filters?.startDate) qb.andWhere('r.startDate >= :startDate', { startDate: filters.startDate });
    if (filters?.endDate) qb.andWhere('r.endDate <= :endDate', { endDate: filters.endDate });
    qb.orderBy('r.createdAt', 'DESC');
    const orms = await qb.getMany();
    return orms.map(TimeOffRequestMapper.toDomain);
  }
}
