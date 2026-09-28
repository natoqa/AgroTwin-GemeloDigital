import climateNormalsDocument from '../../../../data/climate/la-libertad.SYNTHETIC.json' with { type: 'json' };
import ortWasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import {
  AgroTwinDb,
  CachedNetworkWeatherAdapter,
  ClimateNormals,
  DexieWeatherObservationRepository,
  ManualWeatherAdapter,
  NormalsWeatherAdapter,
  BackupFileAdapter,
  CanvasImageThumbnailer,
  CryptoIdGenerator,
  DexieCampaignRepository,
  DexieIrrigationRepository,
  DexieObservationRepository,
  DexiePlotRepository,
  DexieSnapshotRepository,
  LazyModelInference,
  ModelAssets,
  NavigatorStorageAdapter,
  OpfsImageStore,
  SystemClockAdapter,
} from '@agrotwin/infrastructure';
import {
  POTATO_COEFFICIENTS,
  adviseCampaignUseCase,
  applyImageRetentionUseCase,
  computeCampaignStateUseCase,
  closeCampaignUseCase,
  createPlotUseCase,
  ensurePersistentStorageUseCase,
  eraseAllDataUseCase,
  exportBackupUseCase,
  getCampaignTimelineUseCase,
  importBackupUseCase,
  recordIrrigationUseCase,
  recordObservationUseCase,
  recordWeatherObservationUseCase,
  simulateScenarioUseCase,
  startCampaignUseCase,
  updatePlotDetailsUseCase,
} from '@agrotwin/domain';
import type {
  CampaignRepositoryPort,
  ImageStorePort,
  IrrigationRepositoryPort,
  ObservationRepositoryPort,
  PlotRepositoryPort,
  SnapshotRepositoryPort,
  StoragePort,
  WeatherObservationRepositoryPort,
  WeatherPort,
} from '@agrotwin/domain';

/**
 * The composition root: the one place where the domain and its adapters meet.
 *
 * Everything above this file talks to use cases and ports. That is what made
 * Phase 5's swap of the mock classifier for the real one — ONNX backbone in a
 * worker, head in the domain — a change to this file and nothing else.
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
  readonly weather: WeatherPort;
  readonly weatherObservations: WeatherObservationRepositoryPort;
  readonly irrigations: IrrigationRepositoryPort;
  readonly backupFile: BackupFileAdapter;
  /** The leaf-recognition model: download it, and ask whether it is here. */
  readonly model: ModelAssets;
  /** Starts the classifier ahead of the first photograph. */
  readonly warmUpModel: () => Promise<unknown>;
  readonly createPlot: ReturnType<typeof createPlotUseCase>;
  readonly updatePlotDetails: ReturnType<typeof updatePlotDetailsUseCase>;
  readonly startCampaign: ReturnType<typeof startCampaignUseCase>;
  readonly closeCampaign: ReturnType<typeof closeCampaignUseCase>;
  readonly recordObservation: ReturnType<typeof recordObservationUseCase>;
  readonly getCampaignTimeline: ReturnType<typeof getCampaignTimelineUseCase>;
  readonly computeCampaignState: ReturnType<typeof computeCampaignStateUseCase>;
  readonly recordWeatherObservation: ReturnType<typeof recordWeatherObservationUseCase>;
  readonly recordIrrigation: ReturnType<typeof recordIrrigationUseCase>;
  readonly adviseCampaign: ReturnType<typeof adviseCampaignUseCase>;
  readonly simulateScenario: ReturnType<typeof simulateScenarioUseCase>;
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
  const weatherObservations = new DexieWeatherObservationRepository(db);
  const irrigations = new DexieIrrigationRepository(db);

  /*
   * The three weather sources of CLAUDE.md §9, stacked cheapest-to-best:
   * normals underneath, a cache that will one day talk to the LAN hub in the
   * middle, and the farmer's own answers on top. Today the fixture is
   * SYNTHETIC and the cache has no fetcher, so every figure is tagged
   * `synthetic_normals` until the farmer answers or SENAMHI data arrives.
   */
  const weather: WeatherPort = new ManualWeatherAdapter(
    new CachedNetworkWeatherAdapter(
      new NormalsWeatherAdapter(ClimateNormals.fromDocument(climateNormalsDocument)),
    ),
    weatherObservations,
    POTATO_COEFFICIENTS,
  );
  // Phase 5: the real classifier — INT8 backbone in a worker, float32 head in
  // the domain — started on first use from what the farmer downloaded.
  const model = new ModelAssets({
    contractUrl: `${import.meta.env.BASE_URL}model/model-contract.json`,
    wasmUrl: ortWasmUrl,
  });
  const inference = new LazyModelInference(
    model,
    () => new Worker(new URL('./embedding.worker.ts', import.meta.url), { type: 'module' }),
  );

  return {
    plots,
    campaigns,
    observations,
    snapshots,
    images,
    storage,
    weather,
    weatherObservations,
    irrigations,
    backupFile: new BackupFileAdapter(),
    model,
    warmUpModel: () => inference.ready(),
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
      agronomy: { weather, irrigations, coefficients: POTATO_COEFFICIENTS },
    }),
    computeCampaignState: computeCampaignStateUseCase({
      plots,
      campaigns,
      weather,
      irrigations,
      coefficients: POTATO_COEFFICIENTS,
      clock,
    }),
    recordIrrigation: recordIrrigationUseCase({ campaigns, irrigations, clock }),
    adviseCampaign: adviseCampaignUseCase({
      plots,
      campaigns,
      snapshots,
      weatherObservations,
      irrigations,
      weather,
      coefficients: POTATO_COEFFICIENTS,
      clock,
    }),
    simulateScenario: simulateScenarioUseCase({
      plots,
      campaigns,
      irrigations,
      weather,
      coefficients: POTATO_COEFFICIENTS,
      clock,
    }),
    recordWeatherObservation: recordWeatherObservationUseCase({
      plots,
      weatherObservations,
      clock,
    }),
    getCampaignTimeline: getCampaignTimelineUseCase({
      plots,
      campaigns,
      observations,
      snapshots,
      irrigations,
      weatherObservations,
    }),
    applyImageRetention: applyImageRetentionUseCase({ images, observations, clock }),
    ensurePersistentStorage: ensurePersistentStorageUseCase({ storage }),
    exportBackup: exportBackupUseCase({
      plots,
      campaigns,
      observations,
      snapshots,
      images,
      weatherObservations,
      irrigations,
      clock,
    }),
    importBackup: importBackupUseCase({
      plots,
      campaigns,
      observations,
      snapshots,
      images,
      weatherObservations,
      irrigations,
    }),
    eraseAllData: eraseAllDataUseCase({
      plots,
      campaigns,
      observations,
      snapshots,
      images,
      weatherObservations,
      irrigations,
    }),
  };
}
