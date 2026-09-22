import {
  AgroTwinDb,
  CryptoIdGenerator,
  DexiePlotRepository,
  DexieSnapshotRepository,
  IndexedDbImageStore,
  MockInferenceAdapter,
  SystemClockAdapter,
} from '@agrotwin/infrastructure';
import { createPlotUseCase, recordObservationUseCase } from '@agrotwin/domain';
import type {
  ImageStorePort,
  PlotRepositoryPort,
  SnapshotRepositoryPort,
} from '@agrotwin/domain';

/**
 * The composition root: the one place where the domain and its adapters meet.
 *
 * Everything above this file talks to use cases and ports. That is what keeps
 * Phase 5's swap of MockInferenceAdapter for the real ONNX adapter a change to
 * this file and nothing else.
 */
export interface Container {
  readonly plots: PlotRepositoryPort;
  readonly snapshots: SnapshotRepositoryPort;
  readonly images: ImageStorePort;
  readonly createPlot: ReturnType<typeof createPlotUseCase>;
  readonly recordObservation: ReturnType<typeof recordObservationUseCase>;
}

export function createContainer(databaseName = 'agrotwin'): Container {
  const db = new AgroTwinDb(databaseName);
  const clock = new SystemClockAdapter();
  const ids = new CryptoIdGenerator();

  const plots = new DexiePlotRepository(db);
  const snapshots = new DexieSnapshotRepository(db);
  const images = new IndexedDbImageStore(db, ids, clock);
  // Phase 5 replaces this line with the ONNX adapter in a worker.
  const inference = new MockInferenceAdapter();

  return {
    plots,
    snapshots,
    images,
    createPlot: createPlotUseCase({ plots, clock, ids }),
    recordObservation: recordObservationUseCase({
      plots,
      snapshots,
      images,
      inference,
      clock,
      ids,
    }),
  };
}
