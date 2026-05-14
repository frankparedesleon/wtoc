import { DateTime } from 'luxon';
import { TimeOffRequest, RequestStatus } from '../../../domain/entities/time-off-request.entity';
import { TimeOffRequestOrmEntity } from '../typeorm/entities/time-off-request.orm-entity';

export class TimeOffRequestMapper {
  static toDomain(orm: TimeOffRequestOrmEntity): TimeOffRequest {
    return TimeOffRequest.reconstitute({
      id: orm.id,
      employeeId: orm.employeeId,
      locationId: orm.locationId,
      startDate: orm.startDate,
      endDate: orm.endDate,
      daysRequested: orm.daysRequested,
      idempotencyKey: orm.idempotencyKey,
      status: orm.status as RequestStatus,
      createdAt: DateTime.fromJSDate(orm.createdAt),
      updatedAt: DateTime.fromJSDate(orm.updatedAt),
      rejectionReason: orm.rejectionReason,
      cancellationReason: orm.cancellationReason,
      managerId: orm.managerId,
    });
  }

  static toOrm(domain: TimeOffRequest): TimeOffRequestOrmEntity {
    const orm = new TimeOffRequestOrmEntity();
    orm.id = domain.id;
    orm.employeeId = domain.employeeId.value;
    orm.locationId = domain.locationId.value;
    orm.startDate = domain.dateRange.startISO;
    orm.endDate = domain.dateRange.endISO;
    orm.daysRequested = domain.daysRequested;
    orm.status = domain.status;
    orm.idempotencyKey = domain.idempotencyKey;
    orm.rejectionReason = domain.rejectionReason;
    orm.cancellationReason = domain.cancellationReason;
    orm.managerId = domain.managerId;
    return orm;
  }
}
