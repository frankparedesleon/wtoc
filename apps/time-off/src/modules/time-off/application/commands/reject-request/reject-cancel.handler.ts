import { ICommand, ICommandHandler, CommandHandler, EventBus } from '@nestjs/cqrs';
import { Inject, NotFoundException, ConflictException } from '@nestjs/common';
import {
  ITimeOffRequestRepository,
  ILeaveBalanceRepository,
  TIME_OFF_REQUEST_REPOSITORY,
  LEAVE_BALANCE_REPOSITORY,
} from '../../../domain/repositories';
import { RequestStatus } from '../../../domain/entities/time-off-request.entity';

// ── REJECT ──────────────────────────────────────────────────────────────────
export class RejectTimeOffRequestCommand implements ICommand {
  constructor(public readonly requestId: string, public readonly reason: string) {}
}

@CommandHandler(RejectTimeOffRequestCommand)
export class RejectTimeOffRequestHandler implements ICommandHandler<RejectTimeOffRequestCommand> {
  constructor(
    @Inject(TIME_OFF_REQUEST_REPOSITORY) private readonly requestRepo: ITimeOffRequestRepository,
    @Inject(LEAVE_BALANCE_REPOSITORY) private readonly balanceRepo: ILeaveBalanceRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: RejectTimeOffRequestCommand) {
    const request = await this.requestRepo.findById(command.requestId);
    if (!request) throw new NotFoundException({ statusCode: 404, error: 'REQUEST_NOT_FOUND', message: `Request ${command.requestId} not found` });
    if (request.status === RequestStatus.APPROVED || request.status === RequestStatus.CANCELLED) {
      throw new ConflictException({ statusCode: 409, error: 'INVALID_STATE_TRANSITION', message: `Cannot reject request in status: ${request.status}` });
    }

    const balance = await this.balanceRepo.findByEmployeeAndLocation(request.employeeId.value, request.locationId.value);
    if (balance) {
      balance.releaseLock(request.daysRequested);
      await this.balanceRepo.save(balance);
    }

    request.reject(command.reason);
    await this.requestRepo.save(request);
    this.eventBus.publishAll(request.domainEvents);
    request.clearDomainEvents();
    return request;
  }
}

// ── CANCEL ──────────────────────────────────────────────────────────────────
export class CancelTimeOffRequestCommand implements ICommand {
  constructor(public readonly requestId: string) {}
}

@CommandHandler(CancelTimeOffRequestCommand)
export class CancelTimeOffRequestHandler implements ICommandHandler<CancelTimeOffRequestCommand> {
  constructor(
    @Inject(TIME_OFF_REQUEST_REPOSITORY) private readonly requestRepo: ITimeOffRequestRepository,
    @Inject(LEAVE_BALANCE_REPOSITORY) private readonly balanceRepo: ILeaveBalanceRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CancelTimeOffRequestCommand) {
    const request = await this.requestRepo.findById(command.requestId);
    if (!request) throw new NotFoundException({ statusCode: 404, error: 'REQUEST_NOT_FOUND', message: `Request ${command.requestId} not found` });
    if (request.status === RequestStatus.APPROVED || request.status === RequestStatus.REJECTED) {
      throw new ConflictException({ statusCode: 409, error: 'INVALID_STATE_TRANSITION', message: `Cannot cancel request in status: ${request.status}` });
    }

    const balance = await this.balanceRepo.findByEmployeeAndLocation(request.employeeId.value, request.locationId.value);
    if (balance) {
      balance.releaseLock(request.daysRequested);
      await this.balanceRepo.save(balance);
    }

    request.cancel();
    await this.requestRepo.save(request);
    this.eventBus.publishAll(request.domainEvents);
    request.clearDomainEvents();
    return request;
  }
}
