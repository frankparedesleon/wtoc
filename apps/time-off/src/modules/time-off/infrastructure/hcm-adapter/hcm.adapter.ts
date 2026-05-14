import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

export interface HcmBalanceDto {
  employeeId: string;
  locationId: string;
  available: number;
  used: number;
  lastUpdatedAt: string;
}

export interface HcmBatchItem extends HcmBalanceDto {}

export class HcmUnavailableException extends Error {
  constructor(message = 'HCM is currently unavailable') {
    super(message);
    this.name = 'HcmUnavailableException';
  }
}

export class HcmRejectionException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly rawBody?: unknown,
  ) {
    super(message);
    this.name = 'HcmRejectionException';
  }
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

const HCM_TIMEOUT_MS = parseInt(process.env.HCM_TIMEOUT_MS || '5000', 10);
const HCM_RETRY_ATTEMPTS = parseInt(process.env.HCM_RETRY_ATTEMPTS || '3', 10);
const CB_FAILURE_THRESHOLD = parseInt(process.env.CB_FAILURE_THRESHOLD || '5', 10);
const CB_HALF_OPEN_DELAY_MS = parseInt(process.env.CB_HALF_OPEN_DELAY_MS || '30000', 10);

@Injectable()
export class HcmAdapter {
  private readonly logger = new Logger(HcmAdapter.name);
  private circuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private openedAt?: number;

  constructor(private readonly httpService: HttpService) {}

  private get baseUrl(): string {
    return process.env.HCM_BASE_URL || 'http://localhost:3001';
  }

  private canCall(): boolean {
    if (this.circuitState === CircuitState.CLOSED) return true;
    if (this.circuitState === CircuitState.OPEN) {
      const elapsed = Date.now() - (this.openedAt ?? 0);
      if (elapsed >= CB_HALF_OPEN_DELAY_MS) {
        this.circuitState = CircuitState.HALF_OPEN;
        this.logger.warn('Circuit breaker transitioning to HALF_OPEN');
        return true;
      }
      return false;
    }
    // HALF_OPEN: allow one probe
    return true;
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.circuitState !== CircuitState.CLOSED) {
      this.logger.log('Circuit breaker CLOSED after successful probe');
    }
    this.circuitState = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.circuitState === CircuitState.HALF_OPEN) {
      this.circuitState = CircuitState.OPEN;
      this.openedAt = Date.now();
      this.logger.warn('Circuit breaker re-OPENED from HALF_OPEN');
      return;
    }
    if (this.failureCount >= CB_FAILURE_THRESHOLD) {
      this.circuitState = CircuitState.OPEN;
      this.openedAt = Date.now();
      this.logger.warn(`Circuit breaker OPENED after ${this.failureCount} failures`);
    }
  }

  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canCall()) {
      throw new HcmUnavailableException('Circuit breaker is OPEN');
    }

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= HCM_RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await fn();
        this.onSuccess();
        return result;
      } catch (err) {
        lastError = err as Error;
        if (err instanceof HcmRejectionException) {
          // HCM domain errors don't count as circuit failures
          this.onSuccess();
          throw err;
        }
        this.logger.warn(`HCM call attempt ${attempt} failed: ${lastError.message}`);
        if (attempt < HCM_RETRY_ATTEMPTS) {
          await this.sleep(Math.pow(2, attempt - 1) * 1000);
        }
      }
    }
    this.onFailure();
    throw new HcmUnavailableException(`HCM call failed after ${HCM_RETRY_ATTEMPTS} attempts: ${lastError?.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private parseBalance(data: unknown, employeeId: string, locationId: string): HcmBalanceDto {
    if (!data || typeof data !== 'object') {
      this.logger.warn('HCM returned unexpected response shape', { data });
      return { employeeId, locationId, available: 0, used: 0, lastUpdatedAt: new Date().toISOString() };
    }
    const d = data as Record<string, unknown>;
    return {
      employeeId: (d.employeeId as string) ?? employeeId,
      locationId: (d.locationId as string) ?? locationId,
      available: Math.max(0, Number(d.available ?? 0)),
      used: Math.max(0, Number(d.used ?? 0)),
      lastUpdatedAt: (d.lastUpdatedAt as string) ?? new Date().toISOString(),
    };
  }

  async getBalance(employeeId: string, locationId: string): Promise<HcmBalanceDto> {
    return this.callWithRetry(async () => {
      const url = `${this.baseUrl}/hcm/balances/${employeeId}/${locationId}`;
      try {
        const resp = await firstValueFrom(
          this.httpService.get(url).pipe(timeout(HCM_TIMEOUT_MS)),
        );
        return this.parseBalance(resp.data, employeeId, locationId);
      } catch (err: any) {
        if (err?.response?.status === 422) {
          const body = err.response.data;
          this.logger.warn('HCM rejected getBalance', { body });
          throw new HcmRejectionException(body?.error ?? 'UNKNOWN', body?.message ?? 'HCM rejection', body);
        }
        throw err;
      }
    });
  }

  async postBalance(
    employeeId: string,
    locationId: string,
    payload: { deductDays?: number; addDays?: number },
  ): Promise<void> {
    return this.callWithRetry(async () => {
      const url = `${this.baseUrl}/hcm/balances/${employeeId}/${locationId}`;
      try {
        await firstValueFrom(
          this.httpService.post(url, { employeeId, locationId, ...payload }).pipe(timeout(HCM_TIMEOUT_MS)),
        );
      } catch (err: any) {
        if (err?.response?.status === 422) {
          const body = err.response.data;
          this.logger.warn('HCM rejected postBalance', { body });
          throw new HcmRejectionException(body?.error ?? 'UNKNOWN', body?.message ?? 'HCM rejection', body);
        }
        throw err;
      }
    });
  }

  async getBatch(): Promise<HcmBatchItem[]> {
    return this.callWithRetry(async () => {
      const url = `${this.baseUrl}/hcm/balances/batch`;
      const resp = await firstValueFrom(
        this.httpService.get(url).pipe(timeout(HCM_TIMEOUT_MS)),
      );
      const items: unknown[] = Array.isArray(resp.data) ? resp.data : [];
      return items.map((item) => this.parseBalance(item, '', '') as HcmBatchItem);
    });
  }

  getCircuitState(): string {
    return this.circuitState;
  }
}
