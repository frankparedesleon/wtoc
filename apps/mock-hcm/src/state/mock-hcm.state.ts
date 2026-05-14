export type FailureMode = 'normal' | 'timeout' | 'error-500' | 'invalid-shape' | 'negative-balance';

export interface HcmBalance {
  employeeId: string;
  locationId: string;
  available: number;
  used: number;
  lastUpdatedAt: string;
}

export class MockHcmState {
  private balances: Map<string, HcmBalance> = new Map();
  private mode: FailureMode = 'normal';
  private lastRequest: unknown = null;

  private key(employeeId: string, locationId: string): string {
    return `${employeeId}::${locationId}`;
  }

  setBalance(employeeId: string, locationId: string, available: number, used = 0): void {
    this.balances.set(this.key(employeeId, locationId), {
      employeeId,
      locationId,
      available,
      used,
      lastUpdatedAt: new Date().toISOString(),
    });
  }

  getBalance(employeeId: string, locationId: string): HcmBalance | null {
    return this.balances.get(this.key(employeeId, locationId)) ?? null;
  }

  deductBalance(employeeId: string, locationId: string, days: number): boolean {
    const b = this.getBalance(employeeId, locationId);
    if (!b || b.available < days) return false;
    b.available -= days;
    b.used += days;
    b.lastUpdatedAt = new Date().toISOString();
    return true;
  }

  triggerAnniversary(employeeId: string, bonusDays = 5): void {
    for (const [key, balance] of this.balances.entries()) {
      if (balance.employeeId === employeeId) {
        balance.available += bonusDays;
        balance.lastUpdatedAt = new Date().toISOString();
      }
    }
  }

  getAllBalances(): HcmBalance[] {
    return Array.from(this.balances.values());
  }

  setMode(mode: FailureMode): void {
    this.mode = mode;
  }

  getMode(): FailureMode {
    return this.mode;
  }

  setLastRequest(body: unknown): void {
    this.lastRequest = body;
  }

  getLastRequest(): unknown {
    return this.lastRequest;
  }

  reset(): void {
    this.balances.clear();
    this.mode = 'normal';
    this.lastRequest = null;
    // Seed default test data
    this.setBalance('emp-001', 'loc-nyc', 10, 0);
    this.setBalance('emp-002', 'loc-lax', 15, 2);
  }
}
