import type { Diagnosis } from './Diagnosis.js';
import type { EpochMillis } from './EpochMillis.js';
import type { CampaignId, ObservationId, PlotId, SnapshotId } from './Ids.js';
import type { LocalDate } from './LocalDate.js';
import type { ProvenanceEntry } from './Provenance.js';

/**
 * The state of the plot at one instant: one sample of the twin's time series.
 *
 * Every snapshot belongs to a campaign, because the agronomic fields are only
 * defined inside a crop cycle — growing degree days accumulate from a planting
 * date, and a phenological stage outside a campaign means nothing.
 *
 * Those agronomic fields of CLAUDE.md §8.1 — `phenologicalStage`,
 * `accumulatedGdd`, `waterBalance`, `healthIndex`, `lateBlightRisk` — arrive
 * with the BehaviorEngine in Phase 3, which is what can compute them honestly.
 * They are absent rather than stubbed: a zero would read as a measurement.
 */
export interface TwinSnapshot {
  readonly id: SnapshotId;
  readonly plotId: PlotId;
  readonly campaignId: CampaignId;
  readonly at: EpochMillis;
  readonly date: LocalDate;
  readonly diagnosis: Diagnosis;
  /** The observation this state was derived from, when there was one. */
  readonly observationId?: ObservationId;
  /**
   * 0–1, the trust owed to this snapshot as a whole.
   *
   * With image diagnosis as the only input, this is the diagnosis confidence.
   * Phase 3 combines several sources here.
   */
  readonly confidence: number;
  readonly provenance: readonly ProvenanceEntry[];
}
