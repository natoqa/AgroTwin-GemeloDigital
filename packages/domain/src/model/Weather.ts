import type { LocalDate } from './LocalDate.js';
import type { ProvenanceSource } from './Provenance.js';
import type { Celsius, Millimeters } from './Units.js';

/**
 * One day of weather, and how much of it is actually known.
 *
 * Risk R-01 in one type. The twin will run on a mixture of climatological
 * normals, a farmer's "it rained a bit", and occasionally a real forecast, and
 * the difference between those has to survive all the way to the screen. So a
 * day of weather is never bare numbers: every value arrives with where it came
 * from and how much it can be trusted.
 *
 * `leafWetnessHours` is optional and usually absent. The Wallin blight model
 * needs it and no source on this device measures it, so the risk simply is not
 * computed rather than being computed from a guess.
 */
export interface DailyWeather {
  readonly date: LocalDate;
  readonly maxTemperature: Celsius;
  readonly minTemperature: Celsius;
  readonly rainfall: Millimeters;
  /** Hours at or above 90% relative humidity, when something measured them. */
  readonly leafWetnessHours?: number;
  /** Mean temperature during the wet period, when it is known. */
  readonly wetPeriodMeanTemperature?: Celsius;
  readonly source: ProvenanceSource;
  /** 0–1, how much this day's figures can be trusted. */
  readonly confidence: number;
}

/**
 * How much a source is worth, before anything else adjusts it.
 *
 * These are engineering judgements, stated so they can be argued with:
 *
 * - **Climate normals** describe a typical year, not this one. They are the
 *   floor the twin stands on when nothing better exists.
 * - **A farmer's answer** is about *this* plot on *this* day, which normals
 *   can never be, but it is qualitative — "a lot of rain" is a range, not a
 *   number. It ranks above normals for exactly that reason.
 * - **A cached forecast** was a real measurement of the region, though it may
 *   be stale and it is never required (CLAUDE.md §9).
 */
export const SOURCE_BASE_CONFIDENCE: Readonly<Record<ProvenanceSource, number>> = {
  image_diagnosis: 1,
  climate_normals: 0.35,
  manual_weather: 0.55,
  network_weather_cache: 0.7,
};
