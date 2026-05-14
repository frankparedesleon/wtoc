import { TimeOffRequest, RequestStatus } from '../entities/time-off-request.entity';
import { LeaveBalance } from '../entities/leave-balance.entity';

export const TIME_OFF_REQUEST_REPOSITORY = 'TIME_OFF_REQUEST_REPOSITORY';
export const LEAVE_BALANCE_REPOSITORY = 'LEAVE_BALANCE_REPOSITORY';

export interface ITimeOffRequestRepository {
  save(request: TimeOffRequest): Promise<void>;
  findById(id: string): Promise<TimeOffRequest | null>;
  findByIdempotencyKey(key: string): Promise<TimeOffRequest | null>;
  findByEmployeeAndLocation(
    employeeId: string,
    locationId: string,
  ): Promise<TimeOffRequest[]>;
  findPendingByBalance(
    employeeId: string,
    locationId: string,
  ): Promise<TimeOffRequest[]>;
  findAll(filters?: {
    employeeId?: string;
    locationId?: string;
    status?: RequestStatus;
    startDate?: string;
    endDate?: string;
  }): Promise<TimeOffRequest[]>;
}

export interface ILeaveBalanceRepository {
  save(balance: LeaveBalance): Promise<void>;
  findByEmployeeAndLocation(
    employeeId: string,
    locationId: string,
  ): Promise<LeaveBalance | null>;
  findAll(): Promise<LeaveBalance[]>;
  upsert(balance: LeaveBalance): Promise<void>;
}
