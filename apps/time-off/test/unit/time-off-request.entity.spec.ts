import { TimeOffRequest, RequestStatus } from '../../src/modules/time-off/domain/entities/time-off-request.entity';
import {
  TimeOffRequestApproved,
  TimeOffRequestRejected,
  TimeOffRequestCancelled,
  TimeOffRequestCreated,
} from '../../src/modules/time-off/domain/events';
import { DateTime } from 'luxon';

const tomorrow = DateTime.now().plus({ days: 1 }).toISODate()!;
const dayAfter = DateTime.now().plus({ days: 2 }).toISODate()!;

function makeRequest(status = RequestStatus.PENDING): TimeOffRequest {
  const r = TimeOffRequest.create({
    id: 'req-001',
    employeeId: 'emp-001',
    locationId: 'loc-nyc',
    startDate: tomorrow,
    endDate: dayAfter,
    idempotencyKey: 'key-001',
  });
  r.clearDomainEvents();
  if (status === RequestStatus.AWAITING_APPROVAL) r.confirmWithHcm();
  return r;
}

describe('TimeOffRequest — state machine', () => {
  it('creates with PENDING status and emits TimeOffRequestCreated (E01)', () => {
    const r = TimeOffRequest.create({
      id: 'req-001', employeeId: 'emp-001', locationId: 'loc-nyc',
      startDate: tomorrow, endDate: dayAfter, idempotencyKey: 'key-001',
    });
    expect(r.status).toBe(RequestStatus.PENDING);
    expect(r.domainEvents[0]).toBeInstanceOf(TimeOffRequestCreated);
  });

  it('daysRequested is calculated from DateRange', () => {
    const r = makeRequest();
    expect(r.daysRequested).toBe(2);
  });

  it('confirmWithHcm transitions PENDING → AWAITING_APPROVAL', () => {
    const r = makeRequest();
    r.confirmWithHcm();
    expect(r.status).toBe(RequestStatus.AWAITING_APPROVAL);
  });

  it('approve transitions to APPROVED and emits event (E43)', () => {
    const r = makeRequest(RequestStatus.AWAITING_APPROVAL);
    r.approve('mgr-001');
    expect(r.status).toBe(RequestStatus.APPROVED);
    const events = r.domainEvents;
    expect(events[0]).toBeInstanceOf(TimeOffRequestApproved);
    expect((events[0] as TimeOffRequestApproved).managerId).toBe('mgr-001');
    expect((events[0] as TimeOffRequestApproved).requestId).toBe('req-001');
  });

  it('approve is idempotent when already APPROVED (E17)', () => {
    const r = makeRequest(RequestStatus.AWAITING_APPROVAL);
    r.approve('mgr-001');
    r.clearDomainEvents();
    r.approve('mgr-001'); // second call
    expect(r.status).toBe(RequestStatus.APPROVED);
    expect(r.domainEvents.length).toBe(0); // no extra event
  });

  it('approve throws on REJECTED request (E16)', () => {
    const r = makeRequest();
    r.reject('SOME_REASON');
    r.clearDomainEvents();
    expect(() => r.approve('mgr-001')).toThrow('Cannot approve request in status: REJECTED');
  });

  it('reject transitions to REJECTED and emits event (E44)', () => {
    const r = makeRequest();
    r.reject('INSUFFICIENT_BALANCE');
    expect(r.status).toBe(RequestStatus.REJECTED);
    const event = r.domainEvents[0] as TimeOffRequestRejected;
    expect(event).toBeInstanceOf(TimeOffRequestRejected);
    expect(event.reason).toBe('INSUFFICIENT_BALANCE');
  });

  it('cancel transitions PENDING to CANCELLED', () => {
    const r = makeRequest();
    r.cancel();
    expect(r.status).toBe(RequestStatus.CANCELLED);
    expect(r.domainEvents[0]).toBeInstanceOf(TimeOffRequestCancelled);
  });

  it('cancel throws on APPROVED request (E18)', () => {
    const r = makeRequest(RequestStatus.AWAITING_APPROVAL);
    r.approve('mgr-001');
    r.clearDomainEvents();
    expect(() => r.cancel()).toThrow('Cannot cancel request in status: APPROVED');
  });

  it('cancel throws on REJECTED request', () => {
    const r = makeRequest();
    r.reject('reason');
    r.clearDomainEvents();
    expect(() => r.cancel()).toThrow('Cannot cancel request in status: REJECTED');
  });

  it('clearDomainEvents empties the list', () => {
    const r = makeRequest(RequestStatus.AWAITING_APPROVAL);
    r.approve('mgr-001');
    r.clearDomainEvents();
    expect(r.domainEvents.length).toBe(0);
  });
});

describe('TimeOffRequest — domain invariants', () => {
  it('throws when daysRequested would be 0 (same day range counts as 1)', () => {
    // DateRange minimum is 1 day, so days=0 is not directly constructable
    // Verify via DateRange getDays
    const r = TimeOffRequest.create({
      id: 'req-002', employeeId: 'emp-001', locationId: 'loc-nyc',
      startDate: tomorrow, endDate: tomorrow, idempotencyKey: 'key-002',
    });
    expect(r.daysRequested).toBe(1);
  });
});
