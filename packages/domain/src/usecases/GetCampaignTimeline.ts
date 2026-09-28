import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { daysSincePlanting } from '../model/Campaign.js';
import type { Campaign } from '../model/Campaign.js';
import type { CampaignId, ImageRef } from '../model/Ids.js';
import type { Irrigation } from '../model/Irrigation.js';
import { LocalDate } from '../model/LocalDate.js';
import type { Observation } from '../model/Observation.js';
import type { Plot } from '../model/Plot.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';
import type { WeatherObservation } from '../model/WeatherObservation.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { IrrigationRepositoryPort } from '../ports/IrrigationRepositoryPort.js';
import type { ObservationRepositoryPort } from '../ports/ObservationRepositoryPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { SnapshotRepositoryPort } from '../ports/SnapshotRepositoryPort.js';
import type { WeatherObservationRepositoryPort } from '../ports/WeatherObservationRepositoryPort.js';

export interface TimelineEntry {
  readonly snapshot: TwinSnapshot;
  /** Absent only if the evidence was never stored, not if it was purged. */
  readonly observation?: Observation;
  /** Days since planting: the axis every agronomic model in Phase 3 uses. */
  readonly dayOfCampaign: number;
  /** Whether the full photograph survives on the device. */
  readonly hasOriginalImage: boolean;
  readonly thumbnailRef?: ImageRef;
}

/**
 * One thing that happened in the plot, as the farmer lived it.
 *
 * The photographs are the snapshots above; irrigations and weather answers
 * are what the farmer *did* and *said*, and they belong on the same line
 * because they are what moved the twin's water balance between photographs.
 */
export type TimelineEvent =
  | { readonly kind: 'photo'; readonly date: LocalDate; readonly dayOfCampaign: number; readonly entry: TimelineEntry }
  | { readonly kind: 'irrigation'; readonly date: LocalDate; readonly dayOfCampaign: number; readonly irrigation: Irrigation }
  | {
      readonly kind: 'weather_answer';
      readonly date: LocalDate;
      readonly dayOfCampaign: number;
      readonly answer: WeatherObservation;
    };

export interface CampaignTimeline {
  readonly campaign: Campaign;
  readonly plot: Plot;
  /** Oldest first: the twin's history in the order it happened. */
  readonly entries: readonly TimelineEntry[];
  /** Photographs, irrigations and weather answers, oldest first. */
  readonly events: readonly TimelineEvent[];
}

/** The last calendar day there is: an open campaign has no end yet. */
const END_OF_CALENDAR = LocalDate.of(9999, 12, 31);

/** Within a day, what the farmer did comes before the photograph it explains. */
const KIND_ORDER: Readonly<Record<TimelineEvent['kind'], number>> = {
  weather_answer: 0,
  irrigation: 1,
  photo: 2,
};

export interface GetCampaignTimelineDependencies {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly observations: ObservationRepositoryPort;
  readonly snapshots: SnapshotRepositoryPort;
  readonly irrigations: IrrigationRepositoryPort;
  readonly weatherObservations: WeatherObservationRepositoryPort;
}

/**
 * Rebuilds the state of a campaign from what was stored.
 *
 * This is the read side of CLAUDE.md §8.1's requirement that the StateStore
 * reconstruct the twin *even when the original images are gone*. Nothing here
 * reads image bytes: the history is made of snapshots and observations, and a
 * purged photograph costs the timeline a thumbnail, never a state.
 */
export function getCampaignTimelineUseCase(deps: GetCampaignTimelineDependencies) {
  return async function execute(id: CampaignId): Promise<CampaignTimeline> {
    const campaign = await deps.campaigns.findById(id);
    if (!campaign) {
      throw new CampaignNotFoundError(id);
    }
    const plot = await deps.plots.findById(campaign.plotId);
    if (!plot) {
      throw new PlotNotFoundError(campaign.plotId);
    }

    const [snapshots, observations, irrigations, answers] = await Promise.all([
      deps.snapshots.listByCampaign(id),
      deps.observations.listByCampaign(id),
      deps.irrigations.listByCampaign(id),
      // Answers belong to the plot; the campaign's dates pick out its own.
      deps.weatherObservations.listBetween(
        plot.id,
        campaign.plantingDate,
        campaign.closedOn ?? END_OF_CALENDAR,
      ),
    ]);
    const byId = new Map(observations.map((observation) => [observation.id, observation]));

    const entries = snapshots.map((snapshot): TimelineEntry => {
      const observation =
        snapshot.observationId === undefined ? undefined : byId.get(snapshot.observationId);
      return {
        snapshot,
        ...(observation === undefined ? {} : { observation }),
        dayOfCampaign: daysSincePlanting(campaign, snapshot.date),
        hasOriginalImage: observation?.imageRef !== undefined,
        ...(observation?.thumbnailRef === undefined
          ? {}
          : { thumbnailRef: observation.thumbnailRef }),
      };
    });

    const day = (date: LocalDate) => daysSincePlanting(campaign, date);
    const events: TimelineEvent[] = [
      ...entries.map((entry): TimelineEvent => ({
        kind: 'photo',
        date: entry.snapshot.date,
        dayOfCampaign: entry.dayOfCampaign,
        entry,
      })),
      ...irrigations.map((irrigation): TimelineEvent => ({
        kind: 'irrigation',
        date: irrigation.date,
        dayOfCampaign: day(irrigation.date),
        irrigation,
      })),
      ...answers.map((answer): TimelineEvent => ({
        kind: 'weather_answer',
        date: answer.date,
        dayOfCampaign: day(answer.date),
        answer,
      })),
    ].sort(
      (left, right) =>
        left.date.toEpochDay() - right.date.toEpochDay() ||
        KIND_ORDER[left.kind] - KIND_ORDER[right.kind],
    );

    return { campaign, plot, entries, events };
  };
}
