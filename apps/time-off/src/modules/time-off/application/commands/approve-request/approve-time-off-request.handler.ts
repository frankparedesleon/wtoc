import {
  ICommand,
  ICommandHandler,
  CommandHandler,
  EventBus,
} from "@nestjs/cqrs";
import {
  Inject,
  Logger,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  ITimeOffRequestRepository,
  ILeaveBalanceRepository,
  TIME_OFF_REQUEST_REPOSITORY,
  LEAVE_BALANCE_REPOSITORY,
} from "../../../domain/repositories";
import { RequestStatus } from "../../../domain/entities/time-off-request.entity";
import { HcmAdapter } from "../../../infrastructure/hcm-adapter/hcm.adapter";

export class ApproveTimeOffRequestCommand implements ICommand {
  constructor(
    public readonly requestId: string,
    public readonly managerId: string,
  ) {}
}

@CommandHandler(ApproveTimeOffRequestCommand)
export class ApproveTimeOffRequestHandler implements ICommandHandler<ApproveTimeOffRequestCommand> {
  private readonly logger = new Logger(ApproveTimeOffRequestHandler.name);

  constructor(
    @Inject(TIME_OFF_REQUEST_REPOSITORY)
    private readonly requestRepo: ITimeOffRequestRepository,
    @Inject(LEAVE_BALANCE_REPOSITORY)
    private readonly balanceRepo: ILeaveBalanceRepository,
    private readonly hcmAdapter: HcmAdapter,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: ApproveTimeOffRequestCommand) {
    const { requestId, managerId } = command;

    const request = await this.requestRepo.findById(requestId);
    if (!request) {
      throw new NotFoundException({
        statusCode: 404,
        error: "REQUEST_NOT_FOUND",
        message: `Request ${requestId} not found`,
      });
    }

    // Idempotent: already approved
    if (request.status === RequestStatus.APPROVED) {
      return {
        id: request.id,
        employeeId: request.employeeId.value,
        locationId: request.locationId.value,
        startDate: request.dateRange.startISO,
        endDate: request.dateRange.endISO,
        daysRequested: request.daysRequested,
        status: request.status,
        idempotencyKey: request.idempotencyKey,
        createdAt: request.createdAt.toISO(),
        updatedAt: request.updatedAt.toISO(),
        rejectionReason: request.rejectionReason,
        cancellationReason: request.cancellationReason,
        managerId: request.managerId,
      };
    }

    if (
      request.status === RequestStatus.REJECTED ||
      request.status === RequestStatus.CANCELLED
    ) {
      throw new ConflictException({
        statusCode: 409,
        error: "INVALID_STATE_TRANSITION",
        message: `Cannot approve request in status: ${request.status}`,
      });
    }

    // Re-validate balance before approval
    const balance = await this.balanceRepo.findByEmployeeAndLocation(
      request.employeeId.value,
      request.locationId.value,
    );

    if (!balance || !balance.hasSufficientBalance(request.daysRequested)) {
      throw new UnprocessableEntityException({
        statusCode: 409,
        error: "INSUFFICIENT_BALANCE_FOR_APPROVAL",
        message: `Balance insufficient to approve ${request.daysRequested} days`,
      });
    }

    request.approve(managerId);
    balance.confirmDeduction(request.daysRequested);

    await this.requestRepo.save(request);
    await this.balanceRepo.save(balance);

    // Notify HCM of final approval deduction
    try {
      await this.hcmAdapter.postBalance(
        request.employeeId.value,
        request.locationId.value,
        {
          deductDays: request.daysRequested,
        },
      );
    } catch (err) {
      this.logger.warn("HCM sync failed on approval, local deduction applied", {
        requestId,
      });
    }

    this.eventBus.publishAll(request.domainEvents);
    request.clearDomainEvents();

    return {
      id: request.id,
      employeeId: request.employeeId.value,
      locationId: request.locationId.value,
      startDate: request.dateRange.startISO,
      endDate: request.dateRange.endISO,
      daysRequested: request.daysRequested,
      status: request.status,
      idempotencyKey: request.idempotencyKey,
      createdAt: request.createdAt.toISO(),
      updatedAt: request.updatedAt.toISO(),
      rejectionReason: request.rejectionReason,
      cancellationReason: request.cancellationReason,
      managerId: request.managerId,
    };
  }
}
