import { ICommand, ICommandHandler, CommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, Logger, UnprocessableEntityException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ITimeOffRequestRepository,
  ILeaveBalanceRepository,
  TIME_OFF_REQUEST_REPOSITORY,
  LEAVE_BALANCE_REPOSITORY,
} from '../../../domain/repositories';
import { TimeOffRequest } from '../../../domain/entities/time-off-request.entity';
import { HcmAdapter, HcmRejectionException, HcmUnavailableException } from '../../../infrastructure/hcm-adapter/hcm.adapter';

export class CreateTimeOffRequestCommand implements ICommand {
  constructor(
    public readonly employeeId: string,
    public readonly locationId: string,
    public readonly startDate: string,
    public readonly endDate: string,
    public readonly idempotencyKey: string,
    public readonly reason?: string,
  ) {}
}

@CommandHandler(CreateTimeOffRequestCommand)
export class CreateTimeOffRequestHandler
  implements ICommandHandler<CreateTimeOffRequestCommand>
{
  private readonly logger = new Logger(CreateTimeOffRequestHandler.name);

  constructor(
    @Inject(TIME_OFF_REQUEST_REPOSITORY)
    private readonly requestRepo: ITimeOffRequestRepository,
    @Inject(LEAVE_BALANCE_REPOSITORY)
    private readonly balanceRepo: ILeaveBalanceRepository,
    private readonly hcmAdapter: HcmAdapter,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateTimeOffRequestCommand): Promise<TimeOffRequest> {
    const { employeeId, locationId, startDate, endDate, idempotencyKey } = command;

    // Check known dimensions
    let balance = await this.balanceRepo.findByEmployeeAndLocation(employeeId, locationId);
    if (!balance) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'UNKNOWN_DIMENSIONS',
        message: `No balance record found for employee ${employeeId} at location ${locationId}`,
      });
    }

    // Re-fetch from HCM if stale
    if (balance.isStale()) {
      try {
        const hcmData = await this.hcmAdapter.getBalance(employeeId, locationId);
        balance.syncFromHcm(hcmData.available, hcmData.used);
        await this.balanceRepo.save(balance);
      } catch (err) {
        if (err instanceof HcmUnavailableException) {
          this.logger.warn('HCM unavailable during balance refresh, using cached balance');
        } else {
          throw err;
        }
      }
    }

    // Create domain entity (validates DateRange invariants)
    const request = TimeOffRequest.create({
      id: uuidv4(),
      employeeId,
      locationId,
      startDate,
      endDate,
      idempotencyKey,
    });

    // Local defensive check
    if (!balance.hasSufficientBalance(request.daysRequested)) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'INSUFFICIENT_BALANCE',
        message: `Employee ${employeeId} has ${balance.available.value} available days at ${locationId}, requested ${request.daysRequested}`,
      });
    }

    // Soft lock
    balance.softLock(request.daysRequested);
    await this.balanceRepo.save(balance);
    await this.requestRepo.save(request);

    // Confirm with HCM
    try {
      await this.hcmAdapter.postBalance(employeeId, locationId, {
        deductDays: request.daysRequested,
      });
      request.confirmWithHcm();
      await this.requestRepo.save(request);
    } catch (err) {
      if (err instanceof HcmRejectionException) {
        balance.releaseLock(request.daysRequested);
        await this.balanceRepo.save(balance);
        request.reject(err.code);
        await this.requestRepo.save(request);
        throw new UnprocessableEntityException({
          statusCode: 422,
          error: 'HCM_REJECTION',
          message: err.message,
        });
      }
      if (err instanceof HcmUnavailableException) {
        // Leave as PENDING with requiresHcmConfirmation implicit by status
        this.logger.warn('HCM unavailable, request queued as PENDING', { requestId: request.id });
      } else {
        throw err;
      }
    }

    this.eventBus.publishAll(request.domainEvents);
    request.clearDomainEvents();

    return request;
  }
}
