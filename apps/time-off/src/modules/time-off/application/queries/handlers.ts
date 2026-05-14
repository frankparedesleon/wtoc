import { IQuery, IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { Inject, Logger, NotFoundException } from "@nestjs/common";
import {
  ITimeOffRequestRepository,
  ILeaveBalanceRepository,
  TIME_OFF_REQUEST_REPOSITORY,
  LEAVE_BALANCE_REPOSITORY,
} from "../../domain/repositories";
import { RequestStatus, TimeOffRequest } from "../../domain/entities/time-off-request.entity";
import { LeaveBalance } from "../../domain/entities/leave-balance.entity";
import {
  HcmAdapter,
  HcmUnavailableException,
} from "../../infrastructure/hcm-adapter/hcm.adapter";

function mapRequest(r: TimeOffRequest) {
  return {
    id: r.id,
    employeeId: r.employeeId.value,
    locationId: r.locationId.value,
    startDate: r.dateRange.startISO,
    endDate: r.dateRange.endISO,
    daysRequested: r.daysRequested,
    status: r.status,
    idempotencyKey: r.idempotencyKey,
    createdAt: r.createdAt.toISO(),
    updatedAt: r.updatedAt.toISO(),
    rejectionReason: r.rejectionReason,
    cancellationReason: r.cancellationReason,
    managerId: r.managerId,
  };
}

function mapBalance(b: LeaveBalance) {
  return {
    employeeId: b.employeeId.value,
    locationId: b.locationId.value,
    available: b.available.value,
    used: b.used.value,
    lastSyncedAt: b.lastSyncedAt.toISO(),
    version: b.version,
  };
}

// ── GET BALANCE ──────────────────────────────────────────────────────────────
export class GetBalanceQuery implements IQuery {
  constructor(
    public readonly employeeId: string,
    public readonly locationId: string,
  ) {}
}

@QueryHandler(GetBalanceQuery)
export class GetBalanceHandler implements IQueryHandler<GetBalanceQuery> {
  private readonly logger = new Logger(GetBalanceHandler.name);

  constructor(
    @Inject(LEAVE_BALANCE_REPOSITORY)
    private readonly balanceRepo: ILeaveBalanceRepository,
    private readonly hcmAdapter: HcmAdapter,
  ) {}

  async execute(query: GetBalanceQuery) {
    const { employeeId, locationId } = query;
    let balance = await this.balanceRepo.findByEmployeeAndLocation(
      employeeId,
      locationId,
    );

    if (!balance) {
      throw new NotFoundException({
        statusCode: 404,
        error: "BALANCE_NOT_FOUND",
        message: `No balance found for employee ${employeeId} at location ${locationId}`,
      });
    }

    if (balance.isStale()) {
      try {
        const hcmData = await this.hcmAdapter.getBalance(employeeId, locationId);
        balance.syncFromHcm(hcmData.available, hcmData.used);
        await this.balanceRepo.save(balance);
      } catch (err) {
        if (err instanceof HcmUnavailableException) {
          this.logger.warn("HCM unavailable, returning cached balance", {
            employeeId,
            locationId,
          });
        } else {
          throw err;
        }
      }
    }

    return mapBalance(balance);
  }
}

// ── GET REQUESTS ─────────────────────────────────────────────────────────────
export class GetRequestsQuery implements IQuery {
  constructor(
    public readonly filters?: {
      employeeId?: string;
      locationId?: string;
      status?: RequestStatus;
      startDate?: string;
      endDate?: string;
    },
  ) {}
}

@QueryHandler(GetRequestsQuery)
export class GetRequestsHandler implements IQueryHandler<GetRequestsQuery> {
  constructor(
    @Inject(TIME_OFF_REQUEST_REPOSITORY)
    private readonly requestRepo: ITimeOffRequestRepository,
  ) {}

  async execute(query: GetRequestsQuery) {
    const requests = await this.requestRepo.findAll(query.filters);
    return requests.map(mapRequest);
  }
}

// ── GET REQUEST BY ID ────────────────────────────────────────────────────────
export class GetRequestByIdQuery implements IQuery {
  constructor(public readonly id: string) {}
}

@QueryHandler(GetRequestByIdQuery)
export class GetRequestByIdHandler
  implements IQueryHandler<GetRequestByIdQuery>
{
  constructor(
    @Inject(TIME_OFF_REQUEST_REPOSITORY)
    private readonly requestRepo: ITimeOffRequestRepository,
  ) {}

  async execute(query: GetRequestByIdQuery) {
    const request = await this.requestRepo.findById(query.id);
    if (!request) {
      throw new NotFoundException({
        statusCode: 404,
        error: "REQUEST_NOT_FOUND",
        message: `Request ${query.id} not found`,
      });
    }
    return mapRequest(request);
  }
}
