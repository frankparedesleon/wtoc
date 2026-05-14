import { DateTime } from 'luxon';

export class DateRange {
  private readonly _start: DateTime;
  private readonly _end: DateTime;

  constructor(startDate: string, endDate: string) {
    const start = DateTime.fromISO(startDate, { zone: 'utc' });
    const end = DateTime.fromISO(endDate, { zone: 'utc' });

    if (!start.isValid) {
      throw new Error(`Invalid startDate: ${startDate}`);
    }
    if (!end.isValid) {
      throw new Error(`Invalid endDate: ${endDate}`);
    }
    if (start > end) {
      throw new Error(
        `startDate (${startDate}) must not be after endDate (${endDate})`,
      );
    }

    const today = DateTime.now().startOf('day');
    if (end < today) {
      throw new Error(
        `DateRange must not be entirely in the past. endDate: ${endDate}`,
      );
    }

    this._start = start;
    this._end = end;
  }

  get start(): DateTime {
    return this._start;
  }

  get end(): DateTime {
    return this._end;
  }

  getDays(): number {
    return Math.floor(this._end.diff(this._start, 'days').days) + 1;
  }

  get startISO(): string {
    return this._start.toISODate()!;
  }

  get endISO(): string {
    return this._end.toISODate()!;
  }
}
