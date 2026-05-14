import { DateTime } from 'luxon';
import { EmployeeId } from '../value-objects/employee-id.vo';
import { LocationId } from '../value-objects/location-id.vo';
import { DateRange } from '../value-objects/date-range.vo';
import {
  TimeOffRequestCreated,
  TimeOffRequestApproved,
  TimeOffRequestRejected,
  TimeOffRequestCancelled,
} from '../events';

export enum RequestStatus {
  PENDING = 'PENDING',
  AWAITING_APPROVAL = 'AWAITING_APPROVAL',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export class TimeOffRequest {
  private _domainEvents: object[] = [];

  private constructor(
    public readonly id: string,
    public readonly employeeId: EmployeeId,
    public readonly locationId: LocationId,
    public readonly dateRange: DateRange,
    public readonly daysRequested: number,
    public readonly idempotencyKey: string,
    private _status: RequestStatus,
    public readonly createdAt: DateTime,
    private _updatedAt: DateTime,
    private _rejectionReason?: string,
    private _cancellationReason?: string,
    private _managerId?: string,
  ) {}

  static create(params: {
    id: string;
    employeeId: string;
    locationId: string;
    startDate: string;
    endDate: string;
    idempotencyKey: string;
  }): TimeOffRequest {
    const dateRange = new DateRange(params.startDate, params.endDate);
    const days = dateRange.getDays();

    if (days <= 0) {
      throw new Error('daysRequested must be greater than 0');
    }

    const now = DateTime.now();
    const request = new TimeOffRequest(
      params.id,
      new EmployeeId(params.employeeId),
      new LocationId(params.locationId),
      dateRange,
      days,
      params.idempotencyKey,
      RequestStatus.PENDING,
      now,
      now,
    );

    request._domainEvents.push(
      new TimeOffRequestCreated(
        params.id,
        params.employeeId,
        params.locationId,
        days,
        params.startDate,
        params.endDate,
      ),
    );

    return request;
  }

  static reconstitute(params: {
    id: string;
    employeeId: string;
    locationId: string;
    startDate: string;
    endDate: string;
    daysRequested: number;
    idempotencyKey: string;
    status: RequestStatus;
    createdAt: DateTime;
    updatedAt: DateTime;
    rejectionReason?: string;
    cancellationReason?: string;
    managerId?: string;
  }): TimeOffRequest {
    return new TimeOffRequest(
      params.id,
      new EmployeeId(params.employeeId),
      new LocationId(params.locationId),
      new DateRange(params.startDate, params.endDate),
      params.daysRequested,
      params.idempotencyKey,
      params.status,
      params.createdAt,
      params.updatedAt,
      params.rejectionReason,
      params.cancellationReason,
      params.managerId,
    );
  }

  get status(): RequestStatus {
    return this._status;
  }

  get updatedAt(): DateTime {
    return this._updatedAt;
  }

  get rejectionReason(): string | undefined {
    return this._rejectionReason;
  }

  get cancellationReason(): string | undefined {
    return this._cancellationReason;
  }

  get managerId(): string | undefined {
    return this._managerId;
  }

  get domainEvents(): object[] {
    return [...this._domainEvents];
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }

  confirmWithHcm(): void {
    if (this._status !== RequestStatus.PENDING) {
      throw new Error(`Cannot confirm request in status: ${this._status}`);
    }
    this._status = RequestStatus.AWAITING_APPROVAL;
    this._updatedAt = DateTime.now();
  }

  approve(managerId: string): void {
    if (this._status === RequestStatus.APPROVED) return; // idempotent
    if (this._status !== RequestStatus.AWAITING_APPROVAL && this._status !== RequestStatus.PENDING) {
      throw new Error(`Cannot approve request in status: ${this._status}`);
    }
    this._status = RequestStatus.APPROVED;
    this._managerId = managerId;
    this._updatedAt = DateTime.now();
    this._domainEvents.push(
      new TimeOffRequestApproved(
        this.id,
        this.employeeId.value,
        this.locationId.value,
        managerId,
        this._updatedAt.toISO()!,
      ),
    );
  }

  reject(reason: string): void {
    if (
      this._status !== RequestStatus.PENDING &&
      this._status !== RequestStatus.AWAITING_APPROVAL
    ) {
      throw new Error(`Cannot reject request in status: ${this._status}`);
    }
    this._status = RequestStatus.REJECTED;
    this._rejectionReason = reason;
    this._updatedAt = DateTime.now();
    this._domainEvents.push(
      new TimeOffRequestRejected(this.id, this.employeeId.value, reason),
    );
  }

  cancel(reason = 'EMPLOYEE_CANCELLED'): void {
    if (this._status !== RequestStatus.PENDING && this._status !== RequestStatus.AWAITING_APPROVAL) {
      throw new Error(`Cannot cancel request in status: ${this._status}`);
    }
    this._status = RequestStatus.CANCELLED;
    this._cancellationReason = reason;
    this._updatedAt = DateTime.now();
    this._domainEvents.push(
      new TimeOffRequestCancelled(
        this.id,
        this.employeeId.value,
        this._updatedAt.toISO()!,
      ),
    );
  }
}
