import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CqrsModule } from '@nestjs/cqrs';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { TimeOffRequestOrmEntity } from './modules/time-off/infrastructure/persistence/typeorm/entities/time-off-request.orm-entity';
import { LeaveBalanceOrmEntity } from './modules/time-off/infrastructure/persistence/typeorm/entities/leave-balance.orm-entity';
import { IdempotencyRecordOrmEntity } from './modules/time-off/infrastructure/persistence/typeorm/entities/idempotency-record.orm-entity';
import { TimeOffRequestRepository } from './modules/time-off/infrastructure/persistence/repositories/time-off-request.repository';
import { LeaveBalanceRepository } from './modules/time-off/infrastructure/persistence/repositories/leave-balance.repository';
import { HcmAdapter } from './modules/time-off/infrastructure/hcm-adapter/hcm.adapter';
import { IdempotencyService } from './modules/time-off/infrastructure/idempotency/idempotency.service';
import { IdempotencyMiddleware } from './modules/time-off/infrastructure/idempotency/idempotency.middleware';
import { CreateTimeOffRequestHandler } from './modules/time-off/application/commands/create-request/create-time-off-request.handler';
import { ApproveTimeOffRequestHandler } from './modules/time-off/application/commands/approve-request/approve-time-off-request.handler';
import { RejectTimeOffRequestHandler, CancelTimeOffRequestHandler } from './modules/time-off/application/commands/reject-request/reject-cancel.handler';
import { SyncBalanceHandler } from './modules/time-off/application/commands/sync-balance/sync-balance.handler';
import { BatchSyncHandler } from './modules/time-off/application/commands/batch-sync/batch-sync.handler';
import { GetBalanceHandler, GetRequestsHandler, GetRequestByIdHandler } from './modules/time-off/application/queries/handlers';
import { TimeOffRequestsController, BalancesController } from './modules/time-off/presentation/controllers/time-off.controller';
import { TIME_OFF_REQUEST_REPOSITORY, LEAVE_BALANCE_REPOSITORY } from './modules/time-off/domain/repositories';

const CommandHandlers = [
  CreateTimeOffRequestHandler,
  ApproveTimeOffRequestHandler,
  RejectTimeOffRequestHandler,
  CancelTimeOffRequestHandler,
  SyncBalanceHandler,
  BatchSyncHandler,
];

const QueryHandlers = [
  GetBalanceHandler,
  GetRequestsHandler,
  GetRequestByIdHandler,
];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CqrsModule,
    HttpModule,
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: process.env.DB_PATH || 'data/time-off.db',
      entities: [TimeOffRequestOrmEntity, LeaveBalanceOrmEntity, IdempotencyRecordOrmEntity],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV === 'development',
    }),
    TypeOrmModule.forFeature([
      TimeOffRequestOrmEntity,
      LeaveBalanceOrmEntity,
      IdempotencyRecordOrmEntity,
    ]),
  ],
  controllers: [TimeOffRequestsController, BalancesController],
  providers: [
    ...CommandHandlers,
    ...QueryHandlers,
    HcmAdapter,
    IdempotencyService,
    {
      provide: TIME_OFF_REQUEST_REPOSITORY,
      useClass: TimeOffRequestRepository,
    },
    {
      provide: LEAVE_BALANCE_REPOSITORY,
      useClass: LeaveBalanceRepository,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(IdempotencyMiddleware)
      .forRoutes({ path: 'time-off/*', method: RequestMethod.ALL });
  }
}
