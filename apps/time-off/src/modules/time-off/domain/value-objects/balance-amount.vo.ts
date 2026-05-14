export class BalanceAmount {
  private readonly _value: number;

  constructor(value: number) {
    if (value < 0) {
      throw new Error(`BalanceAmount cannot be negative, got: ${value}`);
    }
    this._value = value;
  }

  get value(): number {
    return this._value;
  }

  subtract(days: number): BalanceAmount {
    return new BalanceAmount(this._value - days);
  }

  add(days: number): BalanceAmount {
    return new BalanceAmount(this._value + days);
  }

  isGreaterThanOrEqual(days: number): boolean {
    return this._value >= days;
  }

  equals(other: BalanceAmount): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return String(this._value);
  }
}
