import type { EpochMillis } from './EpochMillis.js';
import type { PlotId } from './Ids.js';
import type { LocalDate } from './LocalDate.js';

/**
 * What the farmer says the weather did.
 *
 * Qualitative on purpose (CLAUDE.md §9). Nobody in the sierra has a rain
 * gauge, and asking for millimetres would get a number that is either blank or
 * made up. "Did it rain yesterday — not at all, a little, a lot?" is a
 * question a person can answer truthfully, and truthful-but-vague beats
 * precise-but-invented every time.
 *
 * What it buys: this is the only source that is about *this* plot on *this*
 * day. Normals cannot be. What it costs: a band, not a number, which is why
 * the translation carries provisional coefficients and reduced confidence.
 */
export const RAINFALL_ANSWERS = ['none', 'a_little', 'a_lot'] as const;
export type RainfallAnswer = (typeof RAINFALL_ANSWERS)[number];

export interface WeatherObservation {
  readonly plotId: PlotId;
  readonly date: LocalDate;
  readonly rainfall: RainfallAnswer;
  /** Whether the night was cold enough for the farmer to notice. */
  readonly coldNight: boolean;
  readonly recordedAt: EpochMillis;
}

export function isRainfallAnswer(value: string): value is RainfallAnswer {
  return (RAINFALL_ANSWERS as readonly string[]).includes(value);
}
