import { MissingCoefficientError } from '../errors/MissingCoefficientError.js';
import type { DegreeDays } from '../model/Units.js';
import type { Coefficients } from './Coefficients.js';

/**
 * Where the crop is in its life, on the thermal clock.
 *
 * The stages are the ones CLAUDE.md §8.2 names: emergence, vegetative
 * development, tuber initiation, bulking, maturity.
 *
 * Note what this is *not*. FAO-56's four Kc periods (initial, development,
 * mid-season, late) describe how a crop uses water, not what it is doing
 * physiologically, and mapping one onto the other takes an agronomic
 * assumption nobody here can cite. They are kept apart: this module answers
 * "what is the plant doing", and the water balance asks its own question.
 */
export const PHENOLOGICAL_STAGES = [
  'emergence',
  'vegetative_development',
  'tuber_initiation',
  'bulking',
  'maturity',
] as const;

export type PhenologicalStage = (typeof PHENOLOGICAL_STAGES)[number];

/** The thermal threshold that opens each stage, read from the coefficients. */
export const STAGE_THRESHOLD_KEYS: Readonly<Record<Exclude<PhenologicalStage, 'emergence'>, string>> =
  {
    vegetative_development: 'gddToEmergence',
    tuber_initiation: 'gddToTuberInitiation',
    bulking: 'gddToBulking',
    maturity: 'gddToMaturity',
  };

export interface StageEstimate {
  /** Absent when the thresholds needed to decide are not known. */
  readonly stage?: PhenologicalStage;
  /** 0–1. Zero when nothing could be decided. */
  readonly confidence: number;
  /** The coefficient keys this estimate rests on, for provenance. */
  readonly basedOn: readonly string[];
  /** Present only when no estimate could be made, saying what is missing. */
  readonly missing?: readonly string[];
}

/**
 * The stage a campaign has reached, given its accumulated degree-days.
 *
 * When the thresholds have not been supplied, this returns **no stage and zero
 * confidence** rather than a guess. That is the whole design: CLAUDE.md §18
 * forbids inventing coefficients, and a phenological stage invented from
 * plausible-looking thresholds would drive irrigation and fungicide advice
 * that the farmer has no way to question.
 */
export function estimatePhenologicalStage(
  accumulated: DegreeDays,
  coefficients: Coefficients,
): StageEstimate {
  const keys = Object.values(STAGE_THRESHOLD_KEYS);
  const missing = keys.filter((key) => !coefficients.has(key));
  if (missing.length > 0) {
    return { confidence: 0, basedOn: keys, missing };
  }

  const thresholds = orderedThresholds(coefficients);
  let stage: PhenologicalStage = 'emergence';
  for (const [candidate, threshold] of thresholds) {
    if (accumulated >= threshold) stage = candidate;
  }

  return {
    stage,
    confidence: coefficients.confidenceFor(keys),
    basedOn: keys,
  };
}

function orderedThresholds(
  coefficients: Coefficients,
): readonly (readonly [PhenologicalStage, number])[] {
  const entries = (
    Object.entries(STAGE_THRESHOLD_KEYS) as readonly [PhenologicalStage, string][]
  ).map(([stage, key]) => {
    const value = coefficients.get(key).value;
    if (value === null) {
      throw new MissingCoefficientError(key, coefficients.get(key).source);
    }
    return [stage, value] as const;
  });

  return [...entries].sort((left, right) => left[1] - right[1]);
}
