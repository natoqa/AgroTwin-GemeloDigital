/** Where a piece of a snapshot came from. */
export type ProvenanceSource =
  | 'image_diagnosis'
  | 'manual_weather'
  | 'climate_normals'
  | 'network_weather_cache';

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
