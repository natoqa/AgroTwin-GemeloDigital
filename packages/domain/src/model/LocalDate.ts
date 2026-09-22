import { InvalidLocalDateError } from '../errors/InvalidLocalDateError.js';
import type { EpochMillis } from './EpochMillis.js';

const MILLIS_PER_DAY = 86_400_000;

/**
 * A calendar date, with no time and no zone.
 *
 * The domain keeps instants (`EpochMillis`) and calendar dates apart on
 * purpose: agronomy accumulates by *day* (growing degree days, water balance),
 * and a day is not a fixed number of milliseconds anywhere a farmer lives.
 *
 * Conversion is pure arithmetic rather than `Date`, so it cannot pick up the
 * host's time zone by accident.
 */
export class LocalDate {
  private constructor(
    readonly year: number,
    /** 1–12. */
    readonly month: number,
    /** 1–31. */
    readonly day: number,
  ) {}

  static of(year: number, month: number, day: number): LocalDate {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      throw new InvalidLocalDateError(year, month, day, 'the parts must be integers');
    }
    if (month < 1 || month > 12) {
      throw new InvalidLocalDateError(year, month, day, 'the month must be between 1 and 12');
    }
    if (day < 1 || day > LocalDate.daysInMonth(year, month)) {
      throw new InvalidLocalDateError(year, month, day, 'that day does not exist in that month');
    }
    return new LocalDate(year, month, day);
  }

  /** Parses `YYYY-MM-DD`. */
  static parse(text: string): LocalDate {
    const match = /^(-?\d{4,})-(\d{2})-(\d{2})$/.exec(text);
    if (!match?.[1] || !match[2] || !match[3]) {
      throw new InvalidLocalDateError(Number.NaN, Number.NaN, Number.NaN, `cannot parse "${text}"`);
    }
    return LocalDate.of(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  /**
   * The UTC calendar date of an instant.
   *
   * Phase 1 works in UTC. A per-plot time zone belongs with the agronomy in
   * Phase 3, where the day boundary starts to carry meaning.
   */
  static fromEpochMillis(at: EpochMillis): LocalDate {
    return LocalDate.fromEpochDay(Math.floor(at / MILLIS_PER_DAY));
  }

  /**
   * Civil date from days since 1970-01-01, after Howard Hinnant's
   * `civil_from_days`. Valid for the whole proleptic Gregorian calendar.
   */
  static fromEpochDay(epochDay: number): LocalDate {
    const z = epochDay + 719_468;
    const era = Math.floor(z / 146_097);
    const dayOfEra = z - era * 146_097;
    const yearOfEra = Math.floor(
      (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36_524) - Math.floor(dayOfEra / 146_096)) / 365,
    );
    const year = yearOfEra + era * 400;
    const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
    const mp = Math.floor((5 * dayOfYear + 2) / 153);
    const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
    const month = mp < 10 ? mp + 3 : mp - 9;
    return new LocalDate(month <= 2 ? year + 1 : year, month, day);
  }

  /** Days since 1970-01-01, after Hinnant's `days_from_civil`. */
  toEpochDay(): number {
    const year = this.month <= 2 ? this.year - 1 : this.year;
    const era = Math.floor(year / 400);
    const yearOfEra = year - era * 400;
    const mp = this.month > 2 ? this.month - 3 : this.month + 9;
    const dayOfYear = Math.floor((153 * mp + 2) / 5) + this.day - 1;
    const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
    return era * 146_097 + dayOfEra - 719_468;
  }

  plusDays(days: number): LocalDate {
    return LocalDate.fromEpochDay(this.toEpochDay() + days);
  }

  daysUntil(other: LocalDate): number {
    return other.toEpochDay() - this.toEpochDay();
  }

  equals(other: LocalDate): boolean {
    return this.year === other.year && this.month === other.month && this.day === other.day;
  }

  /** `YYYY-MM-DD`. The persisted form, and the one shown in the UI. */
  toString(): string {
    const pad = (value: number, width: number): string => String(value).padStart(width, '0');
    return `${pad(this.year, 4)}-${pad(this.month, 2)}-${pad(this.day, 2)}`;
  }

  toJSON(): string {
    return this.toString();
  }

  private static daysInMonth(year: number, month: number): number {
    if (month === 2) {
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      return leap ? 29 : 28;
    }
    return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
  }
}
