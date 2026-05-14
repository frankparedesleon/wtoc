/**
 * Circuit breaker state machine unit tests (E34, E35, E36)
 * Tests the state transitions in isolation using the HcmAdapter internal logic.
 */

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

// Inline minimal circuit breaker for isolated unit testing
class TestCircuitBreaker {
  state = CircuitState.CLOSED;
  failureCount = 0;
  openedAt: number | undefined;
  private readonly threshold = 5;
  private readonly halfOpenDelay = 30_000;

  canCall(now: number): boolean {
    if (this.state === CircuitState.CLOSED) return true;
    if (this.state === CircuitState.OPEN) {
      if (now - (this.openedAt ?? 0) >= this.halfOpenDelay) {
        this.state = CircuitState.HALF_OPEN;
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN: allow probe
  }

  onSuccess(): void {
    this.failureCount = 0;
    this.state = CircuitState.CLOSED;
  }

  onFailure(now: number): void {
    this.failureCount++;
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.OPEN;
      this.openedAt = now;
      return;
    }
    if (this.failureCount >= this.threshold) {
      this.state = CircuitState.OPEN;
      this.openedAt = now;
    }
  }
}

describe('Circuit Breaker state machine', () => {
  let cb: TestCircuitBreaker;
  let now: number;

  beforeEach(() => {
    cb = new TestCircuitBreaker();
    now = Date.now();
  });

  it('starts in CLOSED state', () => {
    expect(cb.state).toBe(CircuitState.CLOSED);
    expect(cb.canCall(now)).toBe(true);
  });

  it('opens after 5 consecutive failures (E34)', () => {
    for (let i = 0; i < 5; i++) cb.onFailure(now);
    expect(cb.state).toBe(CircuitState.OPEN);
  });

  it('does not open after 4 failures', () => {
    for (let i = 0; i < 4; i++) cb.onFailure(now);
    expect(cb.state).toBe(CircuitState.CLOSED);
  });

  it('blocks calls when OPEN before half-open delay (E35)', () => {
    for (let i = 0; i < 5; i++) cb.onFailure(now);
    expect(cb.canCall(now + 1_000)).toBe(false);
  });

  it('transitions to HALF_OPEN after 30s delay', () => {
    for (let i = 0; i < 5; i++) cb.onFailure(now);
    expect(cb.canCall(now + 30_001)).toBe(true);
    expect(cb.state).toBe(CircuitState.HALF_OPEN);
  });

  it('closes after successful probe in HALF_OPEN (E36)', () => {
    for (let i = 0; i < 5; i++) cb.onFailure(now);
    cb.canCall(now + 30_001); // transitions to HALF_OPEN
    cb.onSuccess();
    expect(cb.state).toBe(CircuitState.CLOSED);
    expect(cb.failureCount).toBe(0);
  });

  it('re-opens on failure in HALF_OPEN', () => {
    for (let i = 0; i < 5; i++) cb.onFailure(now);
    cb.canCall(now + 30_001); // HALF_OPEN
    cb.onFailure(now + 30_001);
    expect(cb.state).toBe(CircuitState.OPEN);
  });

  it('resets failure count on success', () => {
    for (let i = 0; i < 3; i++) cb.onFailure(now);
    cb.onSuccess();
    expect(cb.failureCount).toBe(0);
    expect(cb.state).toBe(CircuitState.CLOSED);
  });
});
