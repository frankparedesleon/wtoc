import {
  Injectable,
  NestMiddleware,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { IdempotencyService } from './idempotency.service';

const IDEMPOTENCY_METHODS = ['POST', 'PATCH', 'DELETE'];

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!IDEMPOTENCY_METHODS.includes(req.method)) {
      return next();
    }

    const key = req.headers['idempotency-key'] as string;
    if (!key) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required for mutating requests',
      });
    }

    const requestHash = IdempotencyService.hashRequest(req.method, req.path, req.body);
    const existing = await this.idempotencyService.findByKey(key);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'IDEMPOTENCY_KEY_REUSE',
          message: 'Idempotency-Key has been used with a different request payload',
        });
      }
      const body = JSON.parse(existing.responseBody);
      res.status(existing.responseStatus).json(body);
      return;
    }

    // Intercept response to store it
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      const status = res.statusCode;
      this.idempotencyService.store(key, requestHash, { status, body }).catch(() => {});
      return originalJson(body);
    };

    next();
  }
}
