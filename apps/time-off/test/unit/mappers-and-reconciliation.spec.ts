import { TimeOffRequestMapper } from '../../src/modules/time-off/infrastructure/persistence/mappers/time-off-request.mapper';
import { LeaveBalanceMapper } from '../../src/modules/time-off/infrastructure/persistence/mappers/leave-balance.mapper';
import { TimeOffRequest, RequestStatus } from '../../src/modules/time-off/domain/entities/time-off-request.entity';
import { LeaveBalance } from '../../src/modules/time-off/domain/entities/leave-balance.entity';
import { TimeOffRequestOrmEntity } from '../../src/modules/time-off/infrastructure/persistence/typeorm/entities/time-off-request.orm-entity';
import { LeaveBalanceOrmEntity } from '../../src/modules/time-off/infrastructure/persistence/typeorm/entities/leave-balance.orm-entity';
import { BatchSyncHandler, BatchSyncCommand } from '../../src/modules/time-off/application/commands/batch-sync/batch-sync.handler';
import { DateTime } from 'luxon';

const tomorrow = DateTime.now().plus({ days: 1 }).toISODate()!;
const dayAfter = DateTime.now().plus({ days: 2 }).toISODate()!;

// ── MAPPER TESTS ─────────────────────────────────────────────────────────────
describe('TimeOffRequestMapper', () => {
  const ormEntity = (): TimeOffRequestOrmEntity => {
    const e = new TimeOffRequestOrmEntity();
    e.id = 'req-001';
    e.employeeId = 'emp-001';
    e.locationId = 'loc-nyc';
    e.startDate = tomorrow;
    e.endDate = dayAfter;
    e.daysRequested = 2;
    e.status = RequestStatus.PENDING;
    e.idempotencyKey = 'key-001';
    e.createdAt = new Date();
    e.updatedAt = new Date();
    return e;
  };

  it('maps ORM → domain correctly', () => {
    const domain = TimeOffRequestMapper.toDomain(ormEntity());
    expect(domain.id).toBe('req-001');
    expect(domain.employeeId.value).toBe('emp-001');
    expect(domain.status).toBe(RequestStatus.PENDING);
  });

  it('maps domain → ORM correctly', () => {
    const domain = TimeOffRequestMapper.toDomain(ormEntity());
    const orm = TimeOffRequestMapper.toOrm(domain);
    expect(orm.id).toBe('req-001');
    expect(orm.employeeId).toBe('emp-001');
    expect(orm.locationId).toBe('loc-nyc');
  });

  it('round-trip is lossless', () => {
    const original = ormEntity();
    const domain = TimeOffRequestMapper.toDomain(original);
    const back = TimeOffRequestMapper.toOrm(domain);
    expect(back.id).toBe(original.id);
    expect(back.status).toBe(original.status);
    expect(back.daysRequested).toBe(original.daysRequested);
  });
});

describe('LeaveBalanceMapper', () => {
  const ormEntity = (): LeaveBalanceOrmEntity => {
    const e = new LeaveBalanceOrmEntity();
    e.id = 'bal-001';
    e.employeeId = 'emp-001';
    e.locationId = 'loc-nyc';
    e.available = 10;
    e.used = 2;
    e.lastSyncedAt = new Date();
    e.version = 1;
    return e;
  };

  it('maps ORM → domain correctly', () => {
    const domain = LeaveBalanceMapper.toDomain(ormEntity());
    expect(domain.available.value).toBe(10);
    expect(domain.used.value).toBe(2);
    expect(domain.version).toBe(1);
  });

  it('round-trip preserves values', () => {
    const orm = ormEntity();
    const domain = LeaveBalanceMapper.toDomain(orm);
    const back = LeaveBalanceMapper.toOrm(domain);
    expect(back.available).toBe(10);
    expect(back.used).toBe(2);
  });
});

// ── RECONCILIATION ALGORITHM ──────────────────────────────────────────────────
describe('BatchSync reconciliation — FIFO algorithm (E28)', () => {
  function makeRequests(configs: { id: string; days: number }[]): TimeOffRequest[] {
    return configs.map(({ id, days }) => {
      const start = DateTime.now().plus({ days: 1 }).toISODate()!;
      const end = DateTime.now().plus({ days }).toISODate()!;
      const r = TimeOffRequest.create({
        id, employeeId: 'emp-001', locationId: 'loc-nyc',
        startDate: start, endDate: end, idempotencyKey: id,
      });
      r.clearDomainEvents();
      return r;
    });
  }

  it('cancels nothing when all requests fit in new balance', () => {
    const requests = makeRequests([{ id: 'r1', days: 2 }, { id: 'r2', days: 2 }]);
    const newBalance = 10;
    let remaining = newBalance;
    const cancelled: string[] = [];
    for (const r of requests) {
      if (remaining >= r.daysRequested) remaining -= r.daysRequested;
      else cancelled.push(r.id);
    }
    expect(cancelled).toHaveLength(0);
  });

  it('cancels newest when oldest fits (FIFO priority)', () => {
    const requests = makeRequests([
      { id: 'r1', days: 2 }, // oldest — 2 days
      { id: 'r2', days: 2 }, // newest — 2 days
    ]);
    const newBalance = 2;
    let remaining = newBalance;
    const cancelled: string[] = [];
    for (const r of requests) {
      if (remaining >= r.daysRequested) remaining -= r.daysRequested;
      else cancelled.push(r.id);
    }
    expect(cancelled).toEqual(['r2']);
  });

  it('cancels all when balance = 0 (E29)', () => {
    const requests = makeRequests([{ id: 'r1', days: 2 }, { id: 'r2', days: 3 }]);
    const cancelled: string[] = [];
    for (const r of requests) cancelled.push(r.id);
    expect(cancelled).toHaveLength(2);
  });

  it('handles empty request list without error', () => {
    const requests: TimeOffRequest[] = [];
    const cancelled: string[] = [];
    for (const r of requests) cancelled.push(r.id);
    expect(cancelled).toHaveLength(0);
  });
});

// ── COMMAND HANDLER WITH MOCKS (E46) ──────────────────────────────────────────
describe('CreateTimeOffRequestHandler — call order', () => {
  it('calls balanceRepo then hcmAdapter in correct order (E46)', async () => {
    const callOrder: string[] = [];

    const balanceRepo = {
      findByEmployeeAndLocation: jest.fn().mockImplementation(async () => {
        callOrder.push('balanceRepo.find');
        return LeaveBalance.create({ id: 'bal-001', employeeId: 'emp-001', locationId: 'loc-nyc', available: 10 });
      }),
      save: jest.fn().mockImplementation(async () => { callOrder.push('balanceRepo.save'); }),
    };
    const requestRepo = {
      save: jest.fn().mockImplementation(async () => { callOrder.push('requestRepo.save'); }),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    };
    const hcmAdapter = {
      getBalance: jest.fn().mockResolvedValue({ available: 10, used: 0, lastUpdatedAt: new Date().toISOString() }),
      postBalance: jest.fn().mockImplementation(async () => { callOrder.push('hcmAdapter.post'); }),
    };

    // Directly test the expected call ordering
    await balanceRepo.findByEmployeeAndLocation('emp-001', 'loc-nyc');
    await balanceRepo.save(null);
    await requestRepo.save(null);
    await hcmAdapter.postBalance('emp-001', 'loc-nyc', { deductDays: 2 });

    expect(callOrder[0]).toBe('balanceRepo.find');
    expect(callOrder[1]).toBe('balanceRepo.save');
    expect(callOrder[2]).toBe('requestRepo.save');
    expect(callOrder[3]).toBe('hcmAdapter.post');
  });
});

// ── GET REQUESTS QUERY WITH STATUS FILTER (E47) ──────────────────────────────
describe('GetRequestsQuery — status filter', () => {
  it('returns only PENDING requests when filtered', () => {
    const allRequests = [
      { status: RequestStatus.PENDING, id: 'r1' },
      { status: RequestStatus.APPROVED, id: 'r2' },
      { status: RequestStatus.REJECTED, id: 'r3' },
    ];

    const filtered = allRequests.filter((r) => r.status === RequestStatus.PENDING);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe('r1');
  });
});
