export class TimeOffRequestCreated {
  constructor(
    public readonly requestId: string,
    public readonly employeeId: string,
    public readonly locationId: string,
    public readonly daysRequested: number,
    public readonly startDate: string,
    public readonly endDate: string,
  ) {}
}

export class TimeOffRequestApproved {
  constructor(
    public readonly requestId: string,
    public readonly employeeId: string,
    public readonly locationId: string,
    public readonly managerId: string,
    public readonly approvedAt: string,
  ) {}
}

export class TimeOffRequestRejected {
  constructor(
    public readonly requestId: string,
    public readonly employeeId: string,
    public readonly reason: string,
  ) {}
}

export class TimeOffRequestCancelled {
  constructor(
    public readonly requestId: string,
    public readonly employeeId: string,
    public readonly cancelledAt: string,
  ) {}
}

export class LeaveBalanceSynced {
  constructor(
    public readonly employeeId: string,
    public readonly locationId: string,
    public readonly available: number,
    public readonly syncedAt: string,
  ) {}
}

export class LeaveBalanceStale {
  constructor(
    public readonly employeeId: string,
    public readonly locationId: string,
    public readonly cancelledRequestIds: string[],
    public readonly newBalance: number,
  ) {}
}
