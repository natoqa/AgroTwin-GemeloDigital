import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { daysSincePlanting } from '../model/Campaign.js';
import type { Campaign } from '../model/Campaign.js';
import type { CampaignId, ImageRef } from '../model/Ids.js';
import type { Observation } from '../model/Observation.js';
import type { Plot } from '../model/Plot.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ObservationRepositoryPort } from '../ports/ObservationRepositoryPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { SnapshotRepositoryPort } from '../ports/SnapshotRepositoryPort.js';

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

export interface CampaignTimeline {
  readonly campaign: Campaign;
  readonly plot: Plot;
  /** Oldest first: the twin's history in the order it happened. */
  readonly entries: readonly TimelineEntry[];
}

export interface GetCampaignTimelineDependencies {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly observations: ObservationRepositoryPort;
  readonly snapshots: SnapshotRepositoryPort;
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

    const [snapshots, observations] = await Promise.all([
      deps.snapshots.listByCampaign(id),
      deps.observations.listByCampaign(id),
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

    return { campaign, plot, entries };
  };
}
