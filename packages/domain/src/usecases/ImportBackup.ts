import {
  parseBackup,
  toCampaign,
  toEncodedImage,
  toObservation,
  toPlot,
  toSnapshot,
} from '../backup/BackupDocument.js';
import type { BackupDocument } from '../backup/BackupDocument.js';
import { BackupFormatError } from '../errors/BackupFormatError.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ImageStorePort } from '../ports/ImageStorePort.js';
import type { ObservationRepositoryPort } from '../ports/ObservationRepositoryPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { SnapshotRepositoryPort } from '../ports/SnapshotRepositoryPort.js';

export interface ImportBackupDependencies {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly observations: ObservationRepositoryPort;
  readonly snapshots: SnapshotRepositoryPort;
  readonly images: ImageStorePort;
}

export interface ImportBackupSummary {
  readonly plots: number;
  readonly campaigns: number;
  readonly observations: number;
  readonly snapshots: number;
  readonly images: number;
}

/**
 * Restores a backup file over whatever is on the device.
 *
 * Records are written by id, so importing the same file twice leaves the same
 * device state: a farmer who taps twice, or restores a backup onto a phone
 * that already has part of it, does not end up with duplicates.
 *
 * Nothing is written until the whole file has been parsed *and* its references
 * check out. A half-restored twin — snapshots pointing at campaigns that never
 * arrived — would be worse than a refused import, because it would look fine.
 */
export function importBackupUseCase(deps: ImportBackupDependencies) {
  return async function execute(text: string): Promise<ImportBackupSummary> {
    const backup = parseBackup(text);
    assertReferencesResolve(backup);

    for (const dto of backup.plots) {
      await deps.plots.save(toPlot(dto));
    }
    for (const dto of backup.campaigns) {
      await deps.campaigns.save(toCampaign(dto));
    }
    for (const dto of backup.observations) {
      await deps.observations.save(toObservation(dto));
    }
    for (const dto of backup.snapshots) {
      await deps.snapshots.save(toSnapshot(dto));
    }
    for (const dto of backup.images) {
      await deps.images.importEncoded(toEncodedImage(dto));
    }

    return {
      plots: backup.plots.length,
      campaigns: backup.campaigns.length,
      observations: backup.observations.length,
      snapshots: backup.snapshots.length,
      images: backup.images.length,
    };
  };
}

function assertReferencesResolve(backup: BackupDocument): void {
  const plotIds = new Set(backup.plots.map((plot) => plot.id));
  const campaignIds = new Set(backup.campaigns.map((campaign) => campaign.id));
  const observationIds = new Set(backup.observations.map((observation) => observation.id));

  for (const campaign of backup.campaigns) {
    if (!plotIds.has(campaign.plotId)) {
      throw new BackupFormatError(`campaign ${campaign.id} belongs to a plot that is not in the file`);
    }
  }
  for (const observation of backup.observations) {
    if (!campaignIds.has(observation.campaignId)) {
      throw new BackupFormatError(
        `observation ${observation.id} belongs to a campaign that is not in the file`,
      );
    }
  }
  for (const snapshot of backup.snapshots) {
    if (!campaignIds.has(snapshot.campaignId)) {
      throw new BackupFormatError(
        `snapshot ${snapshot.id} belongs to a campaign that is not in the file`,
      );
    }
    if (snapshot.observationId !== undefined && !observationIds.has(snapshot.observationId)) {
      throw new BackupFormatError(
        `snapshot ${snapshot.id} points at an observation that is not in the file`,
      );
    }
  }
}
