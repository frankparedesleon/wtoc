import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../../src/app.module";
import { GlobalExceptionFilter } from "../../src/shared/filters/global-exception.filter";
import { v4 as uuidv4 } from "uuid";
import { DateTime } from "luxon";
import axios from "axios";

const MOCK_HCM_URL = process.env.MOCK_HCM_URL || "http://localhost:3001";
const tomorrow = DateTime.now().plus({ days: 1 }).toISODate()!;
const dayAfter = DateTime.now().plus({ days: 3 }).toISODate()!;

async function resetMockHcm() {
  await axios.post(`${MOCK_HCM_URL}/hcm/test/reset`);
}

async function setBalance(
  employeeId: string,
  locationId: string,
  available: number,
) {
  await axios.post(`${MOCK_HCM_URL}/hcm/test/set-balance`, {
    employeeId,
    locationId,
    available,
  });
}

async function seedEmployee(
  app: INestApplication,
  employeeId: string,
  locationId: string,
  available: number,
) {
  await setBalance(employeeId, locationId, available);
  await request(app.getHttpServer())
    .post("/time-off/balances/batch-sync")
    .set("Idempotency-Key", uuidv4())
    .send({ items: [{ employeeId, locationId, available, used: 0 }] })
    .expect(200);
}

describe("Time-Off Microservice — E2E", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
  });

  afterAll(async () => app.close());

  beforeEach(async () => {
    try {
      await resetMockHcm();
    } catch {}
  });

  // ── E01: Happy path ────────────────────────────────────────────────────────
  describe("E01 — Happy path: sufficient balance", () => {
    it("creates request and returns 201", async () => {
      await seedEmployee(app, "emp-001", "loc-nyc", 10);

      const res = await request(app.getHttpServer())
        .post("/time-off/requests")
        .set("Idempotency-Key", uuidv4())
        .send({
          employeeId: "emp-001",
          locationId: "loc-nyc",
          startDate: tomorrow,
          endDate: dayAfter,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.employeeId).toBeDefined();
    });
  });

  // ── E02: Insufficient balance (local check) ────────────────────────────────
  describe("E02 — Insufficient balance rejected locally", () => {
    it("returns 422 INSUFFICIENT_BALANCE without calling HCM", async () => {
      await seedEmployee(app, "emp-e02", "loc-nyc", 2);

      const res = await request(app.getHttpServer())
        .post("/time-off/requests")
        .set("Idempotency-Key", uuidv4())
        .send({
          employeeId: "emp-e02",
          locationId: "loc-nyc",
          startDate: tomorrow,
          endDate: dayAfter,
        })
        .expect(422);

      expect(res.body.error).toBe("INSUFFICIENT_BALANCE");
    });
  });

  // ── E04: Idempotency ───────────────────────────────────────────────────────
  describe("E04 — Idempotent retry returns same response", () => {
    it("second request with same key returns identical response", async () => {
      await seedEmployee(app, "emp-e04", "loc-nyc", 10);

      const key = `key-e04-${uuidv4()}`;
      const payload = {
        employeeId: "emp-e04",
        locationId: "loc-nyc",
        startDate: tomorrow,
        endDate: dayAfter,
      };

      const first = await request(app.getHttpServer())
        .post("/time-off/requests")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post("/time-off/requests")
        .set("Idempotency-Key", key)
        .send(payload)
        .expect(201);

      expect(first.body.id).toBe(second.body.id);
    });
  });

  // ── E09: Unknown dimensions ────────────────────────────────────────────────
  describe("E09 — Unknown dimensions rejected before HCM", () => {
    it("returns 422 UNKNOWN_DIMENSIONS", async () => {
      const res = await request(app.getHttpServer())
        .post("/time-off/requests")
        .set("Idempotency-Key", uuidv4())
        .send({
          employeeId: "emp-unknown-999",
          locationId: "loc-unknown-999",
          startDate: tomorrow,
          endDate: dayAfter,
        })
        .expect(422);

      expect(res.body.error).toBe("UNKNOWN_DIMENSIONS");
    });
  });

  // ── E22: Missing Idempotency-Key ───────────────────────────────────────────
  describe("E22 — Missing Idempotency-Key returns 400", () => {
    it("returns 400 MISSING_IDEMPOTENCY_KEY", async () => {
      const res = await request(app.getHttpServer())
        .post("/time-off/requests")
        .send({
          employeeId: "emp-001",
          locationId: "loc-nyc",
          startDate: tomorrow,
          endDate: dayAfter,
        })
        .expect(400);

      expect(res.body.error).toBe("MISSING_IDEMPOTENCY_KEY");
    });
  });

  // ── E21: Key reuse with different payload ──────────────────────────────────
  describe("E21 — Idempotency-Key reused with different payload", () => {
    it("returns 422 IDEMPOTENCY_KEY_REUSE", async () => {
      await seedEmployee(app, "emp-e21a", "loc-nyc", 10);
      await seedEmployee(app, "emp-e21b", "loc-nyc", 10);

      const key = `key-reuse-${uuidv4()}`;

      await request(app.getHttpServer())
        .post("/time-off/requests")
        .set("Idempotency-Key", key)
        .send({
          employeeId: "emp-e21a",
          locationId: "loc-nyc",
          startDate: tomorrow,
          endDate: dayAfter,
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post("/time-off/requests")
        .set("Idempotency-Key", key)
        .send({
          employeeId: "emp-e21b",
          locationId: "loc-nyc",
          startDate: tomorrow,
          endDate: dayAfter,
        })
        .expect(422);

      expect(res.body.error).toBe("IDEMPOTENCY_KEY_REUSE");
    });
  });

  // ── E16: Invalid state transition ──────────────────────────────────────────
  describe("E16 — Cannot approve a REJECTED request", () => {
    it("returns 409 INVALID_STATE_TRANSITION", async () => {
      await seedEmployee(app, "emp-e16", "loc-nyc", 10);

      const createRes = await request(app.getHttpServer())
        .post("/time-off/requests")
        .set("Idempotency-Key", uuidv4())
        .send({
          employeeId: "emp-e16",
          locationId: "loc-nyc",
          startDate: tomorrow,
          endDate: dayAfter,
        })
        .expect(201);

      const reqId = createRes.body.id;

      await request(app.getHttpServer())
        .patch(`/time-off/requests/${reqId}/reject`)
        .set("Idempotency-Key", uuidv4())
        .send({ reason: "MANAGER_DENIED" })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/time-off/requests/${reqId}/approve`)
        .set("Idempotency-Key", uuidv4())
        .send({ managerId: "mgr-001" })
        .expect(409);

      expect(res.body.error).toBe("INVALID_STATE_TRANSITION");
    });
  });

  // ── E19: Cancel non-existent request ──────────────────────────────────────
  describe("E19 — Cancel non-existent request returns 404", () => {
    it("returns 404 REQUEST_NOT_FOUND", async () => {
      const res = await request(app.getHttpServer())
        .delete(`/time-off/requests/non-existent-id`)
        .set("Idempotency-Key", uuidv4())
        .expect(404);

      expect(res.body.error).toBe("REQUEST_NOT_FOUND");
    });
  });

  // ── E05: Batch sync cancels over-balance PENDING requests ─────────────────
  describe("E05 — Batch sync reduces balance → PENDING request cancelled (FIFO)", () => {
    it("oldest request survives, newest gets cancelled", async () => {
      const empId = `emp-e05-${uuidv4().substring(0, 8)}`;
      await seedEmployee(app, empId, "loc-nyc", 10);

      const r1 = await request(app.getHttpServer())
        .post("/time-off/requests")
        .set("Idempotency-Key", uuidv4())
        .send({
          employeeId: empId,
          locationId: "loc-nyc",
          startDate: tomorrow,
          endDate: tomorrow,
        })
        .expect(201);

      const r2 = await request(app.getHttpServer())
        .post("/time-off/requests")
        .set("Idempotency-Key", uuidv4())
        .send({
          employeeId: empId,
          locationId: "loc-nyc",
          startDate: DateTime.now().plus({ days: 5 }).toISODate()!,
          endDate: DateTime.now().plus({ days: 9 }).toISODate()!,
        })
        .expect(201);

      // Reduce balance via batch sync
      await setBalance(empId, "loc-nyc", 1);
      await request(app.getHttpServer())
        .post("/time-off/balances/batch-sync")
        .set("Idempotency-Key", uuidv4())
        .send({
          items: [{ employeeId: empId, locationId: "loc-nyc", available: 1, used: 0 }],
        })
        .expect(200);

      const r1Status = await request(app.getHttpServer()).get(
        `/time-off/requests/${r1.body.id}`,
      );
      const r2Status = await request(app.getHttpServer()).get(
        `/time-off/requests/${r2.body.id}`,
      );

      expect(["PENDING", "AWAITING_APPROVAL"]).toContain(r1Status.body.status);
      expect(r2Status.body.status).toBe("CANCELLED");
    });
  });

  // ── E06: Work anniversary increases balance ────────────────────────────────
  describe("E06 — Work anniversary increases balance, sync reflects change", () => {
    it("after anniversary and sync, balance increases", async () => {
      const empId = `emp-e06-${uuidv4().substring(0, 8)}`;
      await seedEmployee(app, empId, "loc-nyc", 5);

      await axios.post(`${MOCK_HCM_URL}/hcm/test/trigger-anniversary`, {
        employeeId: empId,
        bonusDays: 5,
      });

      await request(app.getHttpServer())
        .post("/time-off/balances/sync")
        .set("Idempotency-Key", uuidv4())
        .send({ employeeId: empId, locationId: "loc-nyc" })
        .expect(200);

      const balRes = await request(app.getHttpServer()).get(
        `/time-off/balances/${empId}/loc-nyc`,
      );

      expect(balRes.body.available).toBeGreaterThanOrEqual(10);
    });
  });
});
