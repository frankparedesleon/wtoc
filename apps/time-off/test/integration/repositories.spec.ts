import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { TimeOffRequestRepository } from '../../src/modules/time-off/infrastructure/persistence/repositories/time-off-request.repository';
import { LeaveBalanceRepository } from '../../src/modules/time-off/infrastructure/persistence/repositories/leave-balance.repository';
import { TimeOffRequestOrmEntity } from '../../src/modules/time-off/infrastructure/persistence/typeorm/entities/time-off-request.orm-entity';
import { LeaveBalanceOrmEntity } from '../../src/modules/time-off/infrastructure/persistence/typeorm/entities/leave-balance.orm-entity';
import { TimeOffRequest, RequestStatus } from '../../src/modules/time-off/domain/entities/time-off-request.entity';
import { LeaveBalance } from '../../src/modules/time-off/domain/entities/leave-balance.entity';
import { DateTime } from 'luxon';

const tomorrow = DateTime.now().plus({ days: 1 }).toISODate()!;
const dayAfter  = DateTime.now().plus({ days: 2 }).toISODate()!;

describe('TimeOffRequestRepository — Integration', () => {
  let module: TestingModule;
  let repo: TimeOffRequestRepository;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqljs',
          synchronize: true,
          dropSchema: true,
          entities: [TimeOffRequestOrmEntity],
        } as any),
        TypeOrmModule.forFeature([TimeOffRequestOrmEntity]),
      ],
      providers: [TimeOffRequestRepository],
    }).compile();
    repo = module.get(TimeOffRequestRepository);
  });

  afterAll(() => module?.close());

  it('saves and retrieves a request by id', async () => {
    const r = TimeOffRequest.create({
      id: uuidv4(), employeeId: 'emp-001', locationId: 'loc-nyc',
      startDate: tomorrow, endDate: dayAfter, idempotencyKey: `key-${uuidv4()}`,
    });
    await repo.save(r);
    const found = await repo.findById(r.id);
    expect(found).not.toBeNull();
    expect(found!.employeeId.value).toBe('emp-001');
  });

  it('returns null for non-existent id (E19)', async () => {
    expect(await repo.findById('nonexistent-id')).toBeNull();
  });

  it('finds pending requests by employee and location', async () => {
    const r = TimeOffRequest.create({
      id: uuidv4(), employeeId: 'emp-pending', locationId: 'loc-nyc',
      startDate: tomorrow, endDate: dayAfter, idempotencyKey: `key-${uuidv4()}`,
    });
    await repo.save(r);
    const pending = await repo.findPendingByBalance('emp-pending', 'loc-nyc');
    expect(pending.length).toBeGreaterThan(0);
    expect(pending[0].status).toBe(RequestStatus.PENDING);
  });

  it('filters by status in findAll (E47)', async () => {
    const r = TimeOffRequest.create({
      id: uuidv4(), employeeId: 'emp-filter', locationId: 'loc-nyc',
      startDate: tomorrow, endDate: dayAfter, idempotencyKey: `key-${uuidv4()}`,
    });
    r.confirmWithHcm();
    r.approve('mgr-001');
    await repo.save(r);
    const results = await repo.findAll({ status: RequestStatus.APPROVED, employeeId: 'emp-filter' });
    expect(results.every((r) => r.status === RequestStatus.APPROVED)).toBe(true);
  });
});

describe('LeaveBalanceRepository — Integration (E52)', () => {
  let module: TestingModule;
  let repo: LeaveBalanceRepository;
  let ormRepo: Repository<LeaveBalanceOrmEntity>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqljs',
          synchronize: true,
          dropSchema: true,
          entities: [LeaveBalanceOrmEntity],
        } as any),
        TypeOrmModule.forFeature([LeaveBalanceOrmEntity]),
      ],
      providers: [LeaveBalanceRepository],
    }).compile();
    repo = module.get(LeaveBalanceRepository);
    ormRepo = module.get(getRepositoryToken(LeaveBalanceOrmEntity));
  });

  afterAll(() => module?.close());
  afterEach(async () => { try { await ormRepo.clear(); } catch {} });

  it('saves and finds a balance', async () => {
    const b = LeaveBalance.create({ id: uuidv4(), employeeId: 'emp-001', locationId: 'loc-nyc', available: 10 });
    await repo.save(b);
    const found = await repo.findByEmployeeAndLocation('emp-001', 'loc-nyc');
    expect(found).not.toBeNull();
    expect(found!.available.value).toBe(10);
  });

  it('upsert creates balance if not exists', async () => {
    const b = LeaveBalance.create({ id: uuidv4(), employeeId: 'emp-new', locationId: 'loc-nyc', available: 20 });
    await repo.upsert(b);
    const found = await repo.findByEmployeeAndLocation('emp-new', 'loc-nyc');
    expect(found).not.toBeNull();
    expect(found!.available.value).toBe(20);
  });

  it('upsert is idempotent — same dimensions produce one record (E52)', async () => {
    const b1 = LeaveBalance.create({ id: uuidv4(), employeeId: 'emp-upsert', locationId: 'loc-nyc', available: 10 });
    const b2 = LeaveBalance.create({ id: uuidv4(), employeeId: 'emp-upsert', locationId: 'loc-nyc', available: 10 });
    await repo.upsert(b1);
    await repo.upsert(b2);
    const all = await repo.findAll();
    const matching = all.filter((b) => b.employeeId.value === 'emp-upsert' && b.locationId.value === 'loc-nyc');
    expect(matching).toHaveLength(1);
  });

  it('returns null when balance not found', async () => {
    expect(await repo.findByEmployeeAndLocation('unknown', 'unknown')).toBeNull();
  });
});
