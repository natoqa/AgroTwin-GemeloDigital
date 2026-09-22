/**
 * How long full photographs are kept on the device.
 *
 * These are engineering budgets, not agronomic coefficients: they decide when
 * bytes are dropped, never what the twin believes. The defaults are set so
 * that a farmer can still look back at the actual photograph within the same
 * phenological stage (stages of a potato cycle run a few weeks), while the
 * originals cannot grow without bound on a phone whose storage the browser may
 * evict at any moment (risk R-07).
 *
 * Whatever is purged, the diagnosis, the date and the thumbnail remain, so the
 * twin's history is never what gets traded away.
 */
export interface RetentionPolicy {
  /** Age past which a full photograph may be dropped. */
  readonly keepOriginalsForDays: number;
  /** Ceiling on the bytes held by full photographs; oldest go first. */
  readonly maxOriginalBytes: number;
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  keepOriginalsForDays: 30,
  maxOriginalBytes: 150 * 1024 * 1024,
};
