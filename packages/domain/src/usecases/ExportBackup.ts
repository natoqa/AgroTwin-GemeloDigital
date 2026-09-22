import {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  serializeBackup,
  toCampaignDto,
  toEncodedImageDto,
  toObservationDto,
  toPlotDto,
  toSnapshotDto,
} from '../backup/BackupDocument.js';
import type { BackupDocument, EncodedImageDto } from '../backup/BackupDocument.js';
import { LocalDate } from '../model/LocalDate.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { ImageStorePort } from '../ports/ImageStorePort.js';
import type { ObservationRepositoryPort } from '../ports/ObservationRepositoryPort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { SnapshotRepositoryPort } from '../ports/SnapshotRepositoryPort.js';

export interface ExportBackupDependencies {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly observations: ObservationRepositoryPort;
  readonly snapshots: SnapshotRepositoryPort;
  readonly images: ImageStorePort;
  readonly clock: ClockPort;
}

export interface ExportBackupResult {
  readonly contents: string;
  /** The day the backup was taken, for whatever the UI decides to call the file. */
  readonly createdOn: LocalDate;
  readonly document: BackupDocument;
}

/**
 * Writes everything the twin knows into one restorable file.
 *
 * With no cloud anywhere (CLAUDE.md §3), this file is the only thing standing
 * between the farmer and a wiped phone. It carries thumbnails and leaves the
 * full photographs behind: a backup nobody can copy off the device because it
 * is two gigabytes is not a backup.
 *
 * The file name is not decided here. Naming is user-facing text, and
 * user-facing text is Spanish and belongs to the app layer (§5).
 */
export function exportBackupUseCase(deps: ExportBackupDependencies) {
  return async function execute(): Promise<ExportBackupResult> {
    const [plots, campaigns, observations, snapshots] = await Promise.all([
      deps.plots.listAll(),
      deps.campaigns.listAll(),
      deps.observations.listAll(),
      deps.snapshots.listAll(),
    ]);

    const images: EncodedImageDto[] = [];
    for (const observation of observations) {
      if (observation.thumbnailRef === undefined) continue;
      const encoded = await deps.images.exportEncoded(observation.thumbnailRef);
      if (encoded) {
        images.push(toEncodedImageDto(encoded));
      }
    }

    const createdAt = deps.clock.now();
    const backup: BackupDocument = {
      format: BACKUP_FORMAT,
      formatVersion: BACKUP_FORMAT_VERSION,
      createdAt,
      plots: plots.map(toPlotDto),
      campaigns: campaigns.map(toCampaignDto),
      observations: observations.map(toObservationDto),
      snapshots: snapshots.map(toSnapshotDto),
      images,
    };

    return {
      contents: serializeBackup(backup),
      createdOn: LocalDate.fromEpochMillis(createdAt),
      document: backup,
    };
  };
}
