import type { PhenologicalStage } from '../agronomy/PhenologicalStage.js';
import type { Diagnosis } from './Diagnosis.js';
import type { EpochMillis } from './EpochMillis.js';
import type { CampaignId, ObservationId, PlotId, SnapshotId } from './Ids.js';
import type { LocalDate } from './LocalDate.js';
import type { ProvenanceEntry } from './Provenance.js';
import type { DegreeDays, Millimeters } from './Units.js';

/**
 * The state of the plot at one instant: one sample of the twin's time series.
 *
 * Every snapshot belongs to a campaign, because the agronomic fields are only
 * defined inside a crop cycle — growing degree days accumulate from a planting
 * date, and a phenological stage outside a campaign means nothing.
 *
 * The agronomic fields of CLAUDE.md §8.1 are filled by the BehaviorEngine when
 * it has what it needs: a plot with a location, weather for the campaign, and
 * the coefficients each model requires. Every one of them stays **absent**
 * when it could not be computed, rather than defaulting to zero. A zero
 * depletion reads as "the soil is full"; an absent one reads as "I do not
 * know", and those are different things to tell a farmer.
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

  // --- Agronomy (CLAUDE.md §8.1), absent when it could not be computed ---

  /** Thermal time accumulated since planting. */
  readonly accumulatedGdd?: DegreeDays;
  /** Absent while nobody has supplied the thermal stage thresholds. */
  readonly phenologicalStage?: PhenologicalStage;
  /** Root zone water shortfall, mm. Zero means full, absent means unknown. */
  readonly waterDepletion?: Millimeters;
  /** Whether the crop has passed readily available water. */
  readonly underWaterStress?: boolean;
  /** Accumulated Wallin severity. Absent when leaf wetness was never measured. */
  readonly lateBlightSeverity?: number;
  /** Whether accumulated severity has reached the advisory spray threshold. */
  readonly sprayAdvised?: boolean;
}
