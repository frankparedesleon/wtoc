import { ICommand, ICommandHandler, CommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ITimeOffRequestRepository,
  ILeaveBalanceRepository,
  TIME_OFF_REQUEST_REPOSITORY,
  LEAVE_BALANCE_REPOSITORY,
} from '../../../domain/repositories';
import { LeaveBalance } from '../../../domain/entities/leave-balance.entity';
import { LeaveBalanceStale } from '../../../domain/events';
import { Cron } from '@nestjs/schedule';
import { HcmAdapter } from '../../../infrastructure/hcm-adapter/hcm.adapter';

export interface BatchSyncItem {
  employeeId: string;
  locationId: string;
  available: number;
  used: number;
}

export class BatchSyncCommand implements ICommand {
  constructor(public readonly items: BatchSyncItem[]) {}
}

@CommandHandler(BatchSyncCommand)
export class BatchSyncHandler implements ICommandHandler<BatchSyncCommand> {
  private readonly logger = new Logger(BatchSyncHandler.name);

  constructor(
    @Inject(TIME_OFF_REQUEST_REPOSITORY)
    private readonly requestRepo: ITimeOffRequestRepository,
    @Inject(LEAVE_BALANCE_REPOSITORY)
    private readonly balanceRepo: ILeaveBalanceRepository,
    private readonly hcmAdapter: HcmAdapter,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: BatchSyncCommand): Promise<void> {
    if (!command.items || command.items.length === 0) return;

    for (const item of command.items) {
      await this.processBalanceItem(item);
    }
  }

  private async processBalanceItem(item: BatchSyncItem): Promise<void> {
    let balance = await this.balanceRepo.findByEmployeeAndLocation(
      item.employeeId,
      item.locationId,
    );

    const previousAvailable = balance?.available.value ?? null;

    if (!balance) {
      balance = LeaveBalance.create({
        id: uuidv4(),
        employeeId: item.employeeId,
        locationId: item.locationId,
        available: Math.max(0, item.available),
        used: Math.max(0, item.used ?? 0),
      });
      await this.balanceRepo.upsert(balance);
      return;
    }

    balance.syncFromHcm(item.available, item.used);
    await this.balanceRepo.upsert(balance);

    this.eventBus.publishAll(balance.domainEvents);
    balance.clearDomainEvents();

    // Reconcile if balance decreased
    if (previousAvailable !== null && item.available < previousAvailable) {
      await this.reconcilePendingRequests(item.employeeId, item.locationId, item.available);
    }
  }

  private async reconcilePendingRequests(
    employeeId: string,
    locationId: string,
    newAvailable: number,
  ): Promise<void> {
    const pendingRequests = await this.requestRepo.findPendingByBalance(employeeId, locationId);
    if (pendingRequests.length === 0) return;

    let remaining = newAvailable;
    const cancelledIds: string[] = [];

    // FIFO: oldest first — already sorted by createdAt ASC
    for (const request of pendingRequests) {
      if (remaining >= request.daysRequested) {
        remaining -= request.daysRequested;
      } else {
        request.cancel('BATCH_RECONCILIATION');
        await this.requestRepo.save(request);
        cancelledIds.push(request.id);
        this.logger.warn(`Cancelled request ${request.id} due to batch reconciliation`, {
          employeeId,
          locationId,
          newBalance: newAvailable,
        });
      }
    }

    if (cancelledIds.length > 0) {
      this.eventBus.publish(new LeaveBalanceStale(employeeId, locationId, cancelledIds, newAvailable));
    }
  }

  @Cron(process.env.BATCH_SYNC_CRON || '0 */6 * * *')
  async scheduledBatchSync(): Promise<void> {
    this.logger.log('Running scheduled batch sync with HCM');
    try {
      const items = await this.hcmAdapter.getBatch();
      await this.execute(new BatchSyncCommand(items));
    } catch (err) {
      this.logger.error('Scheduled batch sync failed', err);
    }
  }
}
