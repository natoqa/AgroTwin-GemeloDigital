import { celsius, millimeters } from '@agrotwin/domain';
import type { Celsius, LocalDate, Millimeters } from '@agrotwin/domain';

/**
 * Climatological normals: what a typical year looks like here.
 *
 * They are the floor the twin stands on. They know nothing about *this* year
 * — that is the whole limitation — but they are available every day of the
 * campaign with no network, no sensor and no farmer input, which nothing else
 * is.
 *
 * A document that declares `synthetic: true` is a stand-in with invented
 * numbers, used while the SENAMHI normals are missing (risk R-01). Everything
 * derived from one is tagged `synthetic_normals`, which is the lowest-trust
 * provenance the system has.
 */
export interface MonthlyNormal {
  /** 1–12. */
  readonly month: number;
  readonly maxTemperature: number;
  readonly minTemperature: number;
  /** Average rainfall per day of that month, mm. */
  readonly rainfallPerDay: number;
}

export interface ClimateNormalsDocument {
  readonly synthetic: boolean;
  readonly region: string;
  readonly station: string;
  readonly monthly: readonly MonthlyNormal[];
}

export class InvalidClimateNormalsError extends Error {
  constructor(reason: string) {
    super(`The climate normals are not usable: ${reason}`);
    this.name = 'InvalidClimateNormalsError';
  }
}

export interface DailyNormal {
  readonly maxTemperature: Celsius;
  readonly minTemperature: Celsius;
  readonly rainfall: Millimeters;
}

export class ClimateNormals {
  private constructor(
    readonly synthetic: boolean,
    readonly region: string,
    private readonly byMonth: ReadonlyMap<number, MonthlyNormal>,
  ) {}

  static fromDocument(document: ClimateNormalsDocument): ClimateNormals {
    if (!Array.isArray(document.monthly) || document.monthly.length !== 12) {
      throw new InvalidClimateNormalsError('there must be exactly twelve monthly entries');
    }

    const byMonth = new Map<number, MonthlyNormal>();
    for (const entry of document.monthly) {
      if (!Number.isInteger(entry.month) || entry.month < 1 || entry.month > 12) {
        throw new InvalidClimateNormalsError(`month ${String(entry.month)} is not a month`);
      }
      if (entry.maxTemperature < entry.minTemperature) {
        throw new InvalidClimateNormalsError(
          `month ${entry.month} has a maximum below its minimum`,
        );
      }
      if (entry.rainfallPerDay < 0) {
        throw new InvalidClimateNormalsError(`month ${entry.month} has negative rainfall`);
      }
      byMonth.set(entry.month, entry);
    }
    if (byMonth.size !== 12) {
      throw new InvalidClimateNormalsError('a month is repeated or missing');
    }

    return new ClimateNormals(document.synthetic === true, document.region, byMonth);
  }

  /**
   * The normal for one day.
   *
   * Monthly values are stepped, not interpolated across month boundaries. The
   * step is honest about what a monthly normal is; smoothing it would invent
   * a daily resolution the source does not have.
   */
  forDate(date: LocalDate): DailyNormal {
    const entry = this.byMonth.get(date.month);
    if (!entry) {
      throw new InvalidClimateNormalsError(`no normal for month ${date.month}`);
    }
    return {
      maxTemperature: celsius(entry.maxTemperature),
      minTemperature: celsius(entry.minTemperature),
      rainfall: millimeters(entry.rainfallPerDay),
    };
  }
}
