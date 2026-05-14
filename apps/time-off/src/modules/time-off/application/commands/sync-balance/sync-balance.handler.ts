import { ICommand, ICommandHandler, CommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger, NotFoundException } from '@nestjs/common';
import {
  ILeaveBalanceRepository,
  LEAVE_BALANCE_REPOSITORY,
} from '../../../domain/repositories';
import { HcmAdapter } from '../../../infrastructure/hcm-adapter/hcm.adapter';

export class SyncBalanceCommand implements ICommand {
  constructor(
    public readonly employeeId: string,
    public readonly locationId: string,
  ) {}
}

@CommandHandler(SyncBalanceCommand)
export class SyncBalanceHandler implements ICommandHandler<SyncBalanceCommand> {
  private readonly logger = new Logger(SyncBalanceHandler.name);

  constructor(
    @Inject(LEAVE_BALANCE_REPOSITORY)
    private readonly balanceRepo: ILeaveBalanceRepository,
    private readonly hcmAdapter: HcmAdapter,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: SyncBalanceCommand) {
    const { employeeId, locationId } = command;

    const balance = await this.balanceRepo.findByEmployeeAndLocation(employeeId, locationId);
    if (!balance) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'BALANCE_NOT_FOUND',
        message: `No balance found for ${employeeId} at ${locationId}`,
      });
    }

    const hcmData = await this.hcmAdapter.getBalance(employeeId, locationId);

    const previousAvailable = balance.available.value;
    if (previousAvailable !== hcmData.available) {
      this.logger.warn('Balance discrepancy detected', {
        employeeId,
        locationId,
        local: previousAvailable,
        hcm: hcmData.available,
      });
    }

    balance.syncFromHcm(hcmData.available, hcmData.used);
    await this.balanceRepo.save(balance);

    this.eventBus.publishAll(balance.domainEvents);
    balance.clearDomainEvents();

    return balance;
  }
}
