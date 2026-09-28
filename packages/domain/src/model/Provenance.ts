/** Where a piece of a snapshot came from. */
export const PROVENANCE_SOURCES = [
  'image_diagnosis',
  'manual_weather',
  'climate_normals',
  // A stand-in for normals nobody has measured. It exists so the engine can
  // be exercised while risk R-01 is open, and it is a separate source
  // precisely so that nothing derived from it can be mistaken for data
  // (CLAUDE.md §9).
  'synthetic_normals',
  'network_weather_cache',
] as const;

export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

/**
 * One traced input of a snapshot.
 *
 * Provenance is not bookkeeping: it is what keeps the twin from lying. A value
 * derived from a farmer's "it rained a bit" and one derived from a measurement
 * must not look alike downstream, so each carries its source and how much it
 * can be trusted.
 */
export interface ProvenanceEntry {
  /** The snapshot field this entry explains, e.g. `diagnosis`. */
  readonly field: string;
  readonly source: ProvenanceSource;
  /** 0–1. */
  readonly confidence: number;
}

export function isProvenanceSource(value: string): value is ProvenanceSource {
  return (PROVENANCE_SOURCES as readonly string[]).includes(value);
}
