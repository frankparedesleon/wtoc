import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException,
  HttpStatus, Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const traceId = (request.headers['x-trace-id'] as string) ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse() as any;
      error = body.error ?? 'HTTP_ERROR';
      message = body.message ?? exception.message;
    } else if (exception instanceof QueryFailedError) {
      if ((exception as any).code === 'SQLITE_CONSTRAINT') {
        status = HttpStatus.CONFLICT;
        error = 'CONCURRENT_MODIFICATION';
        message = 'Concurrent modification detected, please retry';
      }
    } else if (exception instanceof Error) {
      if (exception.message?.includes('OptimisticLock')) {
        status = HttpStatus.CONFLICT;
        error = 'CONCURRENT_MODIFICATION';
        message = 'Concurrent modification detected, please retry';
      }
    }

    this.logger.error(`${status} ${error}: ${message}`, {
      traceId,
      path: request.url,
      method: request.method,
    });

    response.status(status).json({
      statusCode: status,
      error,
      message,
      traceId,
      timestamp: new Date().toISOString(),
    });
  }
}
