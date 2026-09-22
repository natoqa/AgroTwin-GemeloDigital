import {
  AgroTwinDb,
  BackupFileAdapter,
  CanvasImageThumbnailer,
  CryptoIdGenerator,
  DexieCampaignRepository,
  DexieObservationRepository,
  DexiePlotRepository,
  DexieSnapshotRepository,
  MockInferenceAdapter,
  NavigatorStorageAdapter,
  OpfsImageStore,
  SystemClockAdapter,
} from '@agrotwin/infrastructure';
import {
  applyImageRetentionUseCase,
  closeCampaignUseCase,
  createPlotUseCase,
  ensurePersistentStorageUseCase,
  eraseAllDataUseCase,
  exportBackupUseCase,
  getCampaignTimelineUseCase,
  importBackupUseCase,
  recordObservationUseCase,
  startCampaignUseCase,
  updatePlotDetailsUseCase,
} from '@agrotwin/domain';
import type {
  CampaignRepositoryPort,
  ImageStorePort,
  ObservationRepositoryPort,
  PlotRepositoryPort,
  SnapshotRepositoryPort,
  StoragePort,
} from '@agrotwin/domain';

/**
 * The composition root: the one place where the domain and its adapters meet.
 *
 * Everything above this file talks to use cases and ports. That is what keeps
 * Phase 5's swap of MockInferenceAdapter for the real ONNX adapter a change to
 * this file and nothing else.
 *
 * Building it is asynchronous now, because OPFS hands out its directory handle
 * through a promise. The app shows a short "preparing" state rather than
 * pretending the store is ready before it is.
 */
export interface Container {
  readonly plots: PlotRepositoryPort;
  readonly campaigns: CampaignRepositoryPort;
  readonly observations: ObservationRepositoryPort;
  readonly snapshots: SnapshotRepositoryPort;
  readonly images: ImageStorePort;
  readonly storage: StoragePort;
  readonly backupFile: BackupFileAdapter;
  readonly createPlot: ReturnType<typeof createPlotUseCase>;
  readonly updatePlotDetails: ReturnType<typeof updatePlotDetailsUseCase>;
  readonly startCampaign: ReturnType<typeof startCampaignUseCase>;
  readonly closeCampaign: ReturnType<typeof closeCampaignUseCase>;
  readonly recordObservation: ReturnType<typeof recordObservationUseCase>;
  readonly getCampaignTimeline: ReturnType<typeof getCampaignTimelineUseCase>;
  readonly applyImageRetention: ReturnType<typeof applyImageRetentionUseCase>;
  readonly ensurePersistentStorage: ReturnType<typeof ensurePersistentStorageUseCase>;
  readonly exportBackup: ReturnType<typeof exportBackupUseCase>;
  readonly importBackup: ReturnType<typeof importBackupUseCase>;
  readonly eraseAllData: ReturnType<typeof eraseAllDataUseCase>;
}

export async function createContainer(databaseName = 'agrotwin'): Promise<Container> {
  const db = new AgroTwinDb(databaseName);
  const clock = new SystemClockAdapter();
  const ids = new CryptoIdGenerator();

  const plots = new DexiePlotRepository(db);
  const campaigns = new DexieCampaignRepository(db);
  const observations = new DexieObservationRepository(db);
  const snapshots = new DexieSnapshotRepository(db);
  const images = await OpfsImageStore.open(db, ids, clock, new CanvasImageThumbnailer());
  const storage = new NavigatorStorageAdapter();
  // Phase 5 replaces this line with the ONNX adapter in a worker.
  const inference = new MockInferenceAdapter();

  return {
    plots,
    campaigns,
    observations,
    snapshots,
    images,
    storage,
    backupFile: new BackupFileAdapter(),
    createPlot: createPlotUseCase({ plots, clock, ids }),
    updatePlotDetails: updatePlotDetailsUseCase({ plots }),
    startCampaign: startCampaignUseCase({ plots, campaigns, clock, ids }),
    closeCampaign: closeCampaignUseCase({ campaigns, clock }),
    recordObservation: recordObservationUseCase({
      plots,
      campaigns,
      observations,
      snapshots,
      images,
      inference,
      clock,
      ids,
    }),
    getCampaignTimeline: getCampaignTimelineUseCase({ plots, campaigns, observations, snapshots }),
    applyImageRetention: applyImageRetentionUseCase({ images, observations, clock }),
    ensurePersistentStorage: ensurePersistentStorageUseCase({ storage }),
    exportBackup: exportBackupUseCase({ plots, campaigns, observations, snapshots, images, clock }),
    importBackup: importBackupUseCase({ plots, campaigns, observations, snapshots, images }),
    eraseAllData: eraseAllDataUseCase({ plots, campaigns, observations, snapshots, images }),
  };
}
