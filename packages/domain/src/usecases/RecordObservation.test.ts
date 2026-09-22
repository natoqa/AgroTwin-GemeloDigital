import { describe, expect, it } from 'vitest';
import { recordObservationUseCase } from './RecordObservation.js';
import { epochMillis } from '../model/EpochMillis.js';
import type { EpochMillis } from '../model/EpochMillis.js';
import { imageRef, plotId } from '../model/Ids.js';
import type { ImageRef, PlotId } from '../model/Ids.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import type { Plot } from '../model/Plot.js';
import type { TwinSnapshot } from '../model/TwinSnapshot.js';
import type { ImageStorePort } from '../ports/ImageStorePort.js';
import type { InferencePort } from '../ports/InferencePort.js';
import type { PlotRepositoryPort } from '../ports/PlotRepositoryPort.js';
import type { SnapshotRepositoryPort } from '../ports/SnapshotRepositoryPort.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';

const AT = epochMillis(1_790_028_000_000); // 2026-09-21T22:00:00Z
const PLOT: Plot = { id: plotId('plot-1'), name: 'Chacra de arriba', createdAt: epochMillis(0) };

class InMemoryPlots implements PlotRepositoryPort {
  constructor(private readonly plots: readonly Plot[]) {}
  async save(): Promise<void> {}
  async findById(id: PlotId): Promise<Plot | undefined> {
    return this.plots.find((plot) => plot.id === id);
  }
  async listAll(): Promise<readonly Plot[]> {
    return this.plots;
  }
}

class InMemorySnapshots implements SnapshotRepositoryPort {
  readonly saved: TwinSnapshot[] = [];
  async save(snapshot: TwinSnapshot): Promise<void> {
    this.saved.push(snapshot);
  }
  async listByPlot(id: PlotId): Promise<readonly TwinSnapshot[]> {
    return this.saved.filter((snapshot) => snapshot.plotId === id);
  }
  async latestForPlot(id: PlotId): Promise<TwinSnapshot | undefined> {
    return this.saved.filter((snapshot) => snapshot.plotId === id).at(-1);
  }
}

class RecordingImages implements ImageStorePort {
  readonly stored: ArrayBuffer[] = [];
  async put(image: ArrayBuffer): Promise<ImageRef> {
    this.stored.push(image);
    return imageRef(`image-${this.stored.length}`);
  }
  async get(): Promise<ArrayBuffer | undefined> {
    return this.stored[0];
  }
  async delete(): Promise<void> {}
}

const stubInference = (diagnosis: Diagnosis): InferencePort => ({
  diagnose: async () => diagnosis,
});

const fixedClock = (at: EpochMillis) => ({ now: () => at });
const fixedIds = (value: string) => ({ newId: () => value });

const dependencies = (
  diagnosis: Diagnosis,
  overrides: { plots?: PlotRepositoryPort } = {},
) => {
  const snapshots = new InMemorySnapshots();
  const images = new RecordingImages();
  return {
    deps: {
      plots: overrides.plots ?? new InMemoryPlots([PLOT]),
      snapshots,
      images,
      inference: stubInference(diagnosis),
      clock: fixedClock(AT),
      ids: fixedIds('snap-1'),
    },
    snapshots,
    images,
  };
};

const HEALTHY: Diagnosis = { class: 'healthy', confidence: 0.91, modelVersion: 'mock-1' };
const REJECTED: Diagnosis = { class: 'rejected', confidence: 0.22, modelVersion: 'mock-1' };

describe('recordObservationUseCase', () => {
  it('turns a photograph into a snapshot of the twin', async () => {
    const { deps, snapshots, images } = dependencies(HEALTHY);
    const image = new ArrayBuffer(8);

    const snapshot = await recordObservationUseCase(deps)({
      plotId: PLOT.id,
      image,
      contentType: 'image/jpeg',
    });

    expect(snapshot.plotId).toBe(PLOT.id);
    expect(snapshot.at).toBe(AT);
    expect(snapshot.date.toString()).toBe('2026-09-21');
    expect(snapshot.diagnosis).toEqual(HEALTHY);
    expect(snapshot.imageRef).toBe('image-1');
    expect(images.stored).toEqual([image]);
    expect(snapshots.saved).toEqual([snapshot]);
  });

  it('carries the provenance and confidence of its only input', async () => {
    const { deps } = dependencies(HEALTHY);

    const snapshot = await recordObservationUseCase(deps)({
      plotId: PLOT.id,
      image: new ArrayBuffer(8),
      contentType: 'image/jpeg',
    });

    expect(snapshot.confidence).toBe(HEALTHY.confidence);
    expect(snapshot.provenance).toEqual([
      { field: 'diagnosis', source: 'image_diagnosis', confidence: HEALTHY.confidence },
    ]);
  });

  it('records a rejection as a snapshot too, with its low confidence', async () => {
    const { deps, snapshots } = dependencies(REJECTED);

    const snapshot = await recordObservationUseCase(deps)({
      plotId: PLOT.id,
      image: new ArrayBuffer(8),
      contentType: 'image/jpeg',
    });

    // A refusal is part of the twin's history, not a discarded attempt.
    expect(snapshot.diagnosis.class).toBe('rejected');
    expect(snapshot.confidence).toBe(0.22);
    expect(snapshots.saved).toHaveLength(1);
  });

  it('refuses to observe a plot that does not exist', async () => {
    const { deps, snapshots, images } = dependencies(HEALTHY, { plots: new InMemoryPlots([]) });

    await expect(
      recordObservationUseCase(deps)({
        plotId: plotId('missing'),
        image: new ArrayBuffer(8),
        contentType: 'image/jpeg',
      }),
    ).rejects.toThrow(PlotNotFoundError);

    expect(snapshots.saved).toHaveLength(0);
    expect(images.stored).toHaveLength(0);
  });
});
