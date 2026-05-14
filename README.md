# Time-Off Microservice

**GitHub Repository:** https://github.com/frankparedesleon/wtoc

Backend microservice for managing employee time-off requests and syncing leave balances with an external HCM system (Workday/SAP). Built with NestJS, TypeScript, SQLite, and DDD/CQRS patterns.

## Architecture

```
apps/
├── time-off/     # Main microservice (NestJS + TypeORM + CQRS)
└── mock-hcm/     # Mock HCM server for testing (NestJS)
```

### Design Patterns

- **DDD**: Value Objects, Domain Entities, Domain Events, Repository contracts
- **CQRS**: Commands (write) and Queries (read) separated via `@nestjs/cqrs`
- **Adapter pattern**: HCM communication isolated behind `HcmAdapter`
- **Idempotency**: `Idempotency-Key` header required on all mutating endpoints
- **Circuit Breaker**: protects against HCM unavailability (5 failures → OPEN → HALF-OPEN after 30s)
- **Optimistic Locking**: `version` field on `LeaveBalance` prevents double-booking

---

## Key Design Decisions

| Decision                       | Rationale                                                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DDD + CQRS over simple MVC     | Commands orchestrate multiple steps (validate, reserve, call HCM, confirm). Queries are simple projections. CQRS makes this explicit.                                                      |
| SQLite + Repository Pattern    | Specified in the challenge. Repository Pattern ensures switching to MongoDB requires only infrastructure changes — zero domain changes.                                                    |
| Two-phase commit over Saga     | Handles all failure scenarios within scope. Full Saga requires persisted state and idempotent compensating operations — natural next step if HCM evolves to expose compensation endpoints. |
| Circuit Breaker over fail-fast | HCM unavailability should not block employees. Requests queue as PENDING and are confirmed when HCM recovers.                                                                              |
| Snapshot tests over Pact       | Mock HCM is owned by the same team. Pact adds value when the HCM is owned by a separate team with independent deployments.                                                                 |

---

## Quick Start (Docker — Recommended)

### Prerequisites

- Docker & Docker Compose

```bash
# Start both services (mock HCM + microservice)
docker compose up

# Stop services
docker compose down
```

---

## API Documentation

Swagger UI available at `http://localhost:3000/api/docs` when the service is running.

See screenshot: `docs/swagger.png`

---

## Local Development

### Prerequisites

- Node.js >= 20

```bash
# 1. Install dependencies
cd apps/time-off && npm install
cd ../mock-hcm && npm install --prefix . --no-workspaces && cd ../..

# 2. Start mock HCM — Terminal 1
cd apps/mock-hcm && npm run start:dev

# 3. Start microservice — Terminal 2
cd apps/time-off && npm run start:dev

# Swagger docs: http://localhost:3000/api/docs
```

---

## Running Tests

```bash
cd apps/time-off

# Unit tests (no external dependencies)
npm run test

# Integration tests (SQLite in-memory, no Docker needed)
npm run test:integration

# E2E tests (requires mock HCM running on port 3001)
# Start mock HCM first: cd apps/mock-hcm && npm run start:dev
npm run test:e2e

# All tests with coverage report
npm run test:cov
```

### Test Results

| Level       | Tests  | Status |
| ----------- | ------ | ------ |
| Unit        | 54     | ✅     |
| Integration | 14     | ✅     |
| E2E         | 10     | ✅     |
| **Total**   | **78** | **✅** |

**Coverage: 94.48% lines** (threshold: 80%)

---

## API Endpoints

All `POST`, `PATCH`, `DELETE` endpoints require the `Idempotency-Key` header.

### Time-Off Requests

| Method | Path                             | Description                                                        |
| ------ | -------------------------------- | ------------------------------------------------------------------ |
| POST   | `/time-off/requests`             | Submit a new request                                               |
| GET    | `/time-off/requests`             | List requests (filterable by employeeId, locationId, status, date) |
| GET    | `/time-off/requests/:id`         | Get request by ID                                                  |
| PATCH  | `/time-off/requests/:id/approve` | Manager approves                                                   |
| PATCH  | `/time-off/requests/:id/reject`  | Manager rejects                                                    |
| DELETE | `/time-off/requests/:id`         | Employee cancels                                                   |

### Leave Balances

| Method | Path                                         | Description                                              |
| ------ | -------------------------------------------- | -------------------------------------------------------- |
| GET    | `/time-off/balances/:employeeId/:locationId` | Get current balance                                      |
| POST   | `/time-off/balances/sync`                    | Real-time sync with HCM for a specific employee/location |
| POST   | `/time-off/balances/batch-sync`              | Receive full balance corpus from HCM (webhook)           |

---

## Mock HCM Server

Runs on port 3001. Simulates a real HCM system (Workday/SAP) for testing.

### HCM API Endpoints

| Method | Path                                    | Description      |
| ------ | --------------------------------------- | ---------------- |
| GET    | `/hcm/balances/:employeeId/:locationId` | Get balance      |
| POST   | `/hcm/balances/:employeeId/:locationId` | Update balance   |
| GET    | `/hcm/balances/batch`                   | Get all balances |

### Test Control Endpoints

| Method | Path                            | Description                              |
| ------ | ------------------------------- | ---------------------------------------- |
| POST   | `/hcm/test/set-balance`         | Seed a specific balance                  |
| POST   | `/hcm/test/set-mode`            | Set failure mode                         |
| POST   | `/hcm/test/trigger-anniversary` | Simulate work anniversary bonus          |
| GET    | `/hcm/test/last-request`        | Get last request body received           |
| POST   | `/hcm/test/reset`               | Reset all balances and modes to defaults |

### Failure Modes

| Mode               | Behavior                                          |
| ------------------ | ------------------------------------------------- |
| `normal`           | All requests succeed (default)                    |
| `timeout`          | 10s delay — triggers client timeout               |
| `error-500`        | Returns HTTP 500 — simulates HCM outage           |
| `invalid-shape`    | Missing required fields — tests defensive parsing |
| `negative-balance` | Returns `available: -5` — tests sanitization      |

---

## API Documentation

![Swagger UI](docs/swagger.png)

---

## Key Design Decisions

See `docs/TRD_TimeOff_Microservice.docx` for the full Technical Requirements Document including challenges, proposed solution, and alternatives considered.

See `docs/TestSuite_TimeOff_Microservice.docx` for the complete test suite specification with 57 documented scenarios.
