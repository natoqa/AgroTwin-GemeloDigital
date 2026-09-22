import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ImageStorePort } from '../ports/ImageStorePort.js';
import type { ObservationRepositoryPort } from '../ports/ObservationRepositoryPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { SnapshotRepositoryPort } from '../ports/SnapshotRepositoryPort.js';

export interface EraseAllDataDependencies {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly observations: ObservationRepositoryPort;
  readonly snapshots: SnapshotRepositoryPort;
  readonly images: ImageStorePort;
}

/**
 * Deletes everything the device holds.
 *
 * Needed for two honest reasons: a farmer handing the phone on has the right
 * to leave nothing behind, and restoring a backup over a corrupted database
 * has to start from an empty one. It is deliberately a single, explicit
 * operation rather than something hidden inside import.
 */
export function eraseAllDataUseCase(deps: EraseAllDataDependencies) {
  return async function execute(): Promise<void> {
    await deps.snapshots.deleteAll();
    await deps.observations.deleteAll();
    await deps.campaigns.deleteAll();
    await deps.plots.deleteAll();
    await deps.images.deleteAll();
  };
}
