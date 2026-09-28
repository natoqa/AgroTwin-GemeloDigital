import type { Coefficients } from './Coefficients.js';

/**
 * The four periods FAO-56 divides a growing season into, and the crop
 * coefficient that goes with them.
 *
 * These are *water-use* periods, not physiological ones. They say how much
 * water the canopy is moving, which is why they drive Kc and the water
 * balance. They are kept apart from `PhenologicalStage` on purpose: mapping
 * "mid-season" onto "tuber bulking" takes an agronomic assumption nobody here
 * can cite, and conflating the two would smuggle that assumption in silently.
 *
 * Kc follows FAO-56 §6: constant at `Kc ini` through the initial period, a
 * straight line up to `Kc mid` across the development period, constant at
 * `Kc mid` through mid-season, and a straight line down to `Kc end` across the
 * late season.
 */
export const CROP_STAGES = ['initial', 'development', 'mid_season', 'late_season'] as const;

export type CropStage = (typeof CROP_STAGES)[number];

export const STAGE_LENGTH_KEYS = [
  'stageLengthInitial',
  'stageLengthDevelopment',
  'stageLengthMid',
  'stageLengthLate',
] as const;

export const KC_KEYS = ['kcInitial', 'kcMid', 'kcEnd'] as const;

export interface StageLengths {
  readonly initial: number;
  readonly development: number;
  readonly midSeason: number;
  readonly lateSeason: number;
}

export const stageLengthsOf = (coefficients: Coefficients): StageLengths => ({
  initial: coefficients.require('stageLengthInitial'),
  development: coefficients.require('stageLengthDevelopment'),
  midSeason: coefficients.require('stageLengthMid'),
  lateSeason: coefficients.require('stageLengthLate'),
});

/**
 * Which period a day falls in, counted from planting.
 *
 * Days past the end of the season stay in `late_season`: a crop left in the
 * ground is still a crop, and the campaign's own closing date is what ends it.
 */
export function cropStageOnDay(dayOfCampaign: number, lengths: StageLengths): CropStage {
  const afterInitial = lengths.initial;
  const afterDevelopment = afterInitial + lengths.development;
  const afterMid = afterDevelopment + lengths.midSeason;

  if (dayOfCampaign < afterInitial) return 'initial';
  if (dayOfCampaign < afterDevelopment) return 'development';
  if (dayOfCampaign < afterMid) return 'mid_season';
  return 'late_season';
}

export interface KcValues {
  readonly initial: number;
  readonly mid: number;
  readonly end: number;
}

export const kcValuesOf = (coefficients: Coefficients): KcValues => ({
  initial: coefficients.require('kcInitial'),
  mid: coefficients.require('kcMid'),
  end: coefficients.require('kcEnd'),
});

/** The crop coefficient for a day, interpolated across the sloping periods. */
export function cropCoefficientOnDay(
  dayOfCampaign: number,
  lengths: StageLengths,
  kc: KcValues,
): number {
  const stage = cropStageOnDay(dayOfCampaign, lengths);

  if (stage === 'initial') return kc.initial;
  if (stage === 'mid_season') return kc.mid;

  if (stage === 'development') {
    const elapsed = dayOfCampaign - lengths.initial;
    return interpolate(kc.initial, kc.mid, elapsed, lengths.development);
  }

  const elapsed = dayOfCampaign - (lengths.initial + lengths.development + lengths.midSeason);
  return interpolate(kc.mid, kc.end, elapsed, lengths.lateSeason);
}

function interpolate(from: number, to: number, elapsed: number, length: number): number {
  if (length <= 0) return to;
  const fraction = Math.min(1, Math.max(0, elapsed / length));
  return from + (to - from) * fraction;
}
