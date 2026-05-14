import { DateTime } from 'luxon';
import { LeaveBalance } from '../../../domain/entities/leave-balance.entity';
import { LeaveBalanceOrmEntity } from '../typeorm/entities/leave-balance.orm-entity';

export class LeaveBalanceMapper {
  static toDomain(orm: LeaveBalanceOrmEntity): LeaveBalance {
    return LeaveBalance.reconstitute({
      id: orm.id,
      employeeId: orm.employeeId,
      locationId: orm.locationId,
      available: orm.available,
      used: orm.used,
      lastSyncedAt: DateTime.fromJSDate(orm.lastSyncedAt),
      version: orm.version,
    });
  }

  static toOrm(domain: LeaveBalance): LeaveBalanceOrmEntity {
    const orm = new LeaveBalanceOrmEntity();
    orm.id = domain.id;
    orm.employeeId = domain.employeeId.value;
    orm.locationId = domain.locationId.value;
    orm.available = domain.available.value;
    orm.used = domain.used.value;
    orm.lastSyncedAt = domain.lastSyncedAt.toJSDate();
    orm.version = domain.version;
    return orm;
  }
}
