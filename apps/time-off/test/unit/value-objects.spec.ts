import { EmployeeId } from '../../src/modules/time-off/domain/value-objects/employee-id.vo';
import { LocationId } from '../../src/modules/time-off/domain/value-objects/location-id.vo';
import { BalanceAmount } from '../../src/modules/time-off/domain/value-objects/balance-amount.vo';
import { DateRange } from '../../src/modules/time-off/domain/value-objects/date-range.vo';
import { DateTime } from 'luxon';

describe('EmployeeId', () => {
  it('creates valid EmployeeId', () => {
    const id = new EmployeeId('emp-001');
    expect(id.value).toBe('emp-001');
  });

  it('throws on empty string', () => {
    expect(() => new EmployeeId('')).toThrow('EmployeeId cannot be empty');
  });

  it('throws on whitespace-only string', () => {
    expect(() => new EmployeeId('   ')).toThrow('EmployeeId cannot be empty');
  });

  it('trims whitespace', () => {
    const id = new EmployeeId('  emp-001  ');
    expect(id.value).toBe('emp-001');
  });

  it('equals returns true for same value', () => {
    expect(new EmployeeId('emp-001').equals(new EmployeeId('emp-001'))).toBe(true);
  });

  it('equals returns false for different value', () => {
    expect(new EmployeeId('emp-001').equals(new EmployeeId('emp-002'))).toBe(false);
  });
});

describe('LocationId', () => {
  it('creates valid LocationId', () => {
    expect(new LocationId('loc-nyc').value).toBe('loc-nyc');
  });

  it('throws on empty string', () => {
    expect(() => new LocationId('')).toThrow('LocationId cannot be empty');
  });
});

describe('BalanceAmount', () => {
  it('creates valid BalanceAmount', () => {
    expect(new BalanceAmount(10).value).toBe(10);
  });

  it('allows zero', () => {
    expect(new BalanceAmount(0).value).toBe(0);
  });

  it('throws on negative value (E13)', () => {
    expect(() => new BalanceAmount(-1)).toThrow('BalanceAmount cannot be negative');
  });

  it('subtract returns new BalanceAmount', () => {
    const b = new BalanceAmount(10).subtract(3);
    expect(b.value).toBe(7);
  });

  it('subtract to zero is valid', () => {
    expect(new BalanceAmount(5).subtract(5).value).toBe(0);
  });

  it('subtract below zero throws', () => {
    expect(() => new BalanceAmount(3).subtract(5)).toThrow('BalanceAmount cannot be negative');
  });

  it('add returns new BalanceAmount', () => {
    expect(new BalanceAmount(5).add(3).value).toBe(8);
  });

  it('isGreaterThanOrEqual returns true', () => {
    expect(new BalanceAmount(10).isGreaterThanOrEqual(10)).toBe(true);
    expect(new BalanceAmount(10).isGreaterThanOrEqual(5)).toBe(true);
  });

  it('isGreaterThanOrEqual returns false', () => {
    expect(new BalanceAmount(3).isGreaterThanOrEqual(5)).toBe(false);
  });
});

describe('DateRange', () => {
  const tomorrow = DateTime.now().plus({ days: 1 }).toISODate()!;
  const dayAfter = DateTime.now().plus({ days: 2 }).toISODate()!;
  const today = DateTime.now().toISODate()!;

  it('creates valid range', () => {
    const dr = new DateRange(tomorrow, dayAfter);
    expect(dr.getDays()).toBe(2);
  });

  it('single day range is valid (E12)', () => {
    const dr = new DateRange(tomorrow, tomorrow);
    expect(dr.getDays()).toBe(1);
  });

  it('throws when startDate > endDate (E11)', () => {
    expect(() => new DateRange(dayAfter, tomorrow)).toThrow(
      'startDate',
    );
  });

  it('throws on invalid date string', () => {
    expect(() => new DateRange('not-a-date', tomorrow)).toThrow('Invalid startDate');
  });

  it('throws when range is entirely in the past (E15)', () => {
    const past1 = DateTime.now().minus({ days: 5 }).toISODate()!;
    const past2 = DateTime.now().minus({ days: 2 }).toISODate()!;
    expect(() => new DateRange(past1, past2)).toThrow('past');
  });

  it('exposes ISO dates', () => {
    const dr = new DateRange(tomorrow, dayAfter);
    expect(dr.startISO).toBe(tomorrow);
    expect(dr.endISO).toBe(dayAfter);
  });
});
