import { DateTime } from 'luxon';
import { EmployeeId } from '../value-objects/employee-id.vo';
import { LocationId } from '../value-objects/location-id.vo';
import { BalanceAmount } from '../value-objects/balance-amount.vo';
import { LeaveBalanceSynced } from '../events';

const STALE_THRESHOLD_MINUTES = parseInt(
  process.env.BALANCE_STALE_THRESHOLD_MINUTES || '15',
  10,
);

export class LeaveBalance {
  private _domainEvents: object[] = [];

  private constructor(
    public readonly id: string,
    public readonly employeeId: EmployeeId,
    public readonly locationId: LocationId,
    private _available: BalanceAmount,
    private _used: BalanceAmount,
    private _lastSyncedAt: DateTime,
    public readonly version: number,
  ) {}

  static create(params: {
    id: string;
    employeeId: string;
    locationId: string;
    available: number;
    used?: number;
  }): LeaveBalance {
    return new LeaveBalance(
      params.id,
      new EmployeeId(params.employeeId),
      new LocationId(params.locationId),
      new BalanceAmount(params.available),
      new BalanceAmount(params.used ?? 0),
      DateTime.now(),
      0,
    );
  }

  static reconstitute(params: {
    id: string;
    employeeId: string;
    locationId: string;
    available: number;
    used: number;
    lastSyncedAt: DateTime;
    version: number;
  }): LeaveBalance {
    return new LeaveBalance(
      params.id,
      new EmployeeId(params.employeeId),
      new LocationId(params.locationId),
      new BalanceAmount(params.available),
      new BalanceAmount(params.used),
      params.lastSyncedAt,
      params.version,
    );
  }

  get available(): BalanceAmount {
    return this._available;
  }

  get used(): BalanceAmount {
    return this._used;
  }

  get lastSyncedAt(): DateTime {
    return this._lastSyncedAt;
  }

  get domainEvents(): object[] {
    return [...this._domainEvents];
  }

  clearDomainEvents(): void {
    this._domainEvents = [];
  }

  isStale(): boolean {
    const minutesSinceSync = Math.abs(
      this._lastSyncedAt.diffNow('minutes').minutes,
    );
    return minutesSinceSync > STALE_THRESHOLD_MINUTES;
  }

  hasSufficientBalance(days: number): boolean {
    return this._available.isGreaterThanOrEqual(days);
  }

  softLock(days: number): void {
    this._available = this._available.subtract(days);
  }

  releaseLock(days: number): void {
    this._available = this._available.add(days);
  }

  deduct(days: number): void {
    this._available = this._available.subtract(days);
    this._used = this._used.add(days);
  }

  syncFromHcm(available: number, used: number): void {
    // Sanitize negative values from HCM
    const safeAvailable = Math.max(0, available);
    const safeUsed = Math.max(0, used);
    this._available = new BalanceAmount(safeAvailable);
    this._used = new BalanceAmount(safeUsed);
    this._lastSyncedAt = DateTime.now();
    this._domainEvents.push(
      new LeaveBalanceSynced(
        this.employeeId.value,
        this.locationId.value,
        safeAvailable,
        this._lastSyncedAt.toISO()!,
      ),
    );
  }
}
