import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyService } from '../../src/modules/time-off/infrastructure/idempotency/idempotency.service';
import { IdempotencyRecordOrmEntity } from '../../src/modules/time-off/infrastructure/persistence/typeorm/entities/idempotency-record.orm-entity';

describe('IdempotencyService — Integration (E22, E23, E55)', () => {
  let module: TestingModule;
  let service: IdempotencyService;
  let repo: Repository<IdempotencyRecordOrmEntity>;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqljs',
          synchronize: true,
          dropSchema: true,
          entities: [IdempotencyRecordOrmEntity],
        } as any),
        TypeOrmModule.forFeature([IdempotencyRecordOrmEntity]),
      ],
      providers: [IdempotencyService],
    }).compile();
    service = module.get(IdempotencyService);
    repo = module.get(getRepositoryToken(IdempotencyRecordOrmEntity));
  });

  afterAll(async () => module?.close());
  afterEach(async () => { try { await repo.clear(); } catch {} });

  it('stores and retrieves an idempotency record', async () => {
    await service.store('key-001', 'hash-abc', { status: 201, body: { id: 'req-001' } });
    const record = await service.findByKey('key-001');
    expect(record).not.toBeNull();
    expect(record!.responseStatus).toBe(201);
    expect(JSON.parse(record!.responseBody)).toEqual({ id: 'req-001' });
  });

  it('returns null for non-existent key', async () => {
    expect(await service.findByKey('nonexistent')).toBeNull();
  });

  it('returns null for expired key and deletes it (E23)', async () => {
    const expired = repo.create({
      key: 'key-expired', requestHash: 'hash-old', responseBody: '{}', responseStatus: 200,
      processedAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 1000),
    });
    await repo.save(expired);
    expect(await service.findByKey('key-expired')).toBeNull();
    expect(await repo.findOne({ where: { key: 'key-expired' } })).toBeNull();
  });

  it('cleanup job removes expired keys, keeps valid ones (E55)', async () => {
    await repo.save([
      repo.create({ key: 'exp-a', requestHash: 'h1', responseBody: '{}', responseStatus: 200, processedAt: new Date(), expiresAt: new Date(Date.now() - 1000) }),
      repo.create({ key: 'exp-c', requestHash: 'h2', responseBody: '{}', responseStatus: 200, processedAt: new Date(), expiresAt: new Date(Date.now() - 2000) }),
      repo.create({ key: 'valid-b', requestHash: 'h3', responseBody: '{}', responseStatus: 201, processedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000) }),
    ]);
    await service.cleanupExpiredKeys();
    const remaining = await repo.find();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].key).toBe('valid-b');
  });

  it('hashRequest is deterministic', () => {
    const h1 = IdempotencyService.hashRequest('POST', '/time-off/requests', { employeeId: 'emp-001' });
    const h2 = IdempotencyService.hashRequest('POST', '/time-off/requests', { employeeId: 'emp-001' });
    expect(h1).toBe(h2);
  });

  it('hashRequest differs for different bodies', () => {
    const h1 = IdempotencyService.hashRequest('POST', '/time-off/requests', { employeeId: 'emp-001' });
    const h2 = IdempotencyService.hashRequest('POST', '/time-off/requests', { employeeId: 'emp-002' });
    expect(h1).not.toBe(h2);
  });
});
