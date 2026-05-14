# Time-Off Microservice

Backend microservice for managing employee time-off requests and syncing leave balances with an external HCM system (Workday/SAP). Built with NestJS, TypeScript, SQLite, and DDD/CQRS patterns.

## Architecture

```
apps/
├── time-off/          # Main microservice (NestJS + TypeORM + CQRS)
└── mock-hcm/          # Mock HCM server for testing (NestJS)
```

### Design Patterns
- **DDD**: Value Objects, Domain Entities, Domain Events, Repository contracts
- **CQRS**: Commands (write) and Queries (read) separated via `@nestjs/cqrs`
- **Adapter pattern**: HCM communication isolated behind `HcmAdapter`
- **Idempotency**: `Idempotency-Key` header required on all mutating endpoints
- **Circuit Breaker**: protects against HCM unavailability (5 failures → OPEN → HALF-OPEN after 30s)
- **Optimistic Locking**: `version` field on `LeaveBalance` prevents double-booking

## Getting Started

### Prerequisites
- Node.js >= 20
- Docker & Docker Compose

### Local Development

```bash
# Install dependencies
cd apps/time-off && npm install
cd apps/mock-hcm && npm install

# Copy env
cp .env.example .env

# Start mock HCM
cd apps/mock-hcm && npm run start:dev

# Start microservice
cd apps/time-off && npm run start:dev

# Swagger docs
open http://localhost:3000/api/docs
```

### Docker

```bash
# Start both services
docker compose up

# Run E2E test suite
docker compose --profile test up --abort-on-container-exit
```

## Running Tests

```bash
cd apps/time-off

# Unit tests
npm run test

# Integration tests (SQLite in-memory, no Docker needed)
npm run test:integration

# E2E tests (requires mock HCM running on port 3001)
npm run test:e2e

# All tests with coverage report
npm run test:cov
```

### Coverage Threshold
Minimum **80% line coverage** enforced. CI fails if threshold is not met.

## API Endpoints

### Time-Off Requests
| Method | Path | Description |
|---|---|---|
| POST | `/time-off/requests` | Submit a new request |
| GET | `/time-off/requests` | List requests (filterable) |
| GET | `/time-off/requests/:id` | Get request by ID |
| PATCH | `/time-off/requests/:id/approve` | Manager approves |
| PATCH | `/time-off/requests/:id/reject` | Manager rejects |
| DELETE | `/time-off/requests/:id` | Employee cancels |

### Leave Balances
| Method | Path | Description |
|---|---|---|
| GET | `/time-off/balances/:employeeId/:locationId` | Get current balance |
| POST | `/time-off/balances/sync` | Real-time sync with HCM |
| POST | `/time-off/balances/batch-sync` | Full batch sync (webhook) |

All `POST`, `PATCH`, `DELETE` endpoints require the `Idempotency-Key` header.

## Mock HCM Endpoints

### Control Endpoints (for testing)
| Method | Path | Description |
|---|---|---|
| POST | `/hcm/test/set-balance` | Set a specific balance |
| POST | `/hcm/test/set-mode` | Set failure mode |
| POST | `/hcm/test/trigger-anniversary` | Simulate work anniversary |
| GET  | `/hcm/test/last-request` | Get last request received |
| POST | `/hcm/test/reset` | Reset to defaults |

### Failure Modes
- `normal` — all requests succeed
- `timeout` — 10s delay to trigger client timeout
- `error-500` — returns HTTP 500
- `invalid-shape` — missing required fields in response
- `negative-balance` — returns `available: -5`

## Key Design Decisions

See [TRD_TimeOff_Microservice.docx](./docs/TRD_TimeOff_Microservice.docx) for full technical design including alternatives considered.
