import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalDate, createPlot, epochMillis, plotId, snapshotId } from '@agrotwin/domain';
import type { EpochMillis, Plot, TwinSnapshot } from '@agrotwin/domain';
import { AgroTwinDb } from './AgroTwinDb.js';
import { DexiePlotRepository } from './DexiePlotRepository.js';
import { DexieSnapshotRepository } from './DexieSnapshotRepository.js';
import { IndexedDbImageStore } from './IndexedDbImageStore.js';

const AT = epochMillis(1_790_028_000_000); // 2026-09-21T22:00:00Z

const countingIds = () => {
  let next = 0;
  return {
    newId: () => {
      next += 1;
      return `id-${next}`;
    },
  };
};
const fixedClock = (at: EpochMillis) => ({ now: () => at });

const snapshotAt = (at: EpochMillis, overrides: Partial<TwinSnapshot> = {}): TwinSnapshot => ({
  id: snapshotId(`snap-${at}`),
  plotId: plotId('plot-1'),
  at,
  date: LocalDate.fromEpochMillis(at),
  diagnosis: { class: 'late_blight', confidence: 0.83, modelVersion: 'mock-1' },
  confidence: 0.83,
  provenance: [{ field: 'diagnosis', source: 'image_diagnosis', confidence: 0.83 }],
  ...overrides,
});

let db: AgroTwinDb;
let unique = 0;

beforeEach(async () => {
  unique += 1;
  db = new AgroTwinDb(`agrotwin-test-${unique}`);
  await db.open();
});

afterEach(async () => {
  db.close();
  await AgroTwinDb.delete(`agrotwin-test-${unique}`);
});

describe('DexiePlotRepository', () => {
  it('stores a plot and reads it back whole', async () => {
    const repository = new DexiePlotRepository(db);
    const plot = createPlot({ id: plotId('plot-1'), name: 'Chacra de arriba', createdAt: AT });

    await repository.save(plot);

    expect(await repository.findById(plot.id)).toEqual(plot);
  });

  it('returns undefined for a plot that was never stored', async () => {
    expect(await new DexiePlotRepository(db).findById(plotId('nope'))).toBeUndefined();
  });

  it('lists plots newest first', async () => {
    const repository = new DexiePlotRepository(db);
    const older: Plot = { id: plotId('a'), name: 'Vieja', createdAt: epochMillis(1_000) };
    const newer: Plot = { id: plotId('b'), name: 'Nueva', createdAt: epochMillis(2_000) };

    await repository.save(older);
    await repository.save(newer);

    expect((await repository.listAll()).map((plot) => plot.id)).toEqual(['b', 'a']);
  });
});

describe('DexieSnapshotRepository', () => {
  it('rebuilds the value objects it stored as primitives', async () => {
    const repository = new DexieSnapshotRepository(db);
    const snapshot = snapshotAt(AT);

    await repository.save(snapshot);
    const [stored] = await repository.listByPlot(snapshot.plotId);

    // The record keeps the date as a string; what comes back must be a LocalDate.
    expect(stored?.date).toBeInstanceOf(LocalDate);
    expect(stored).toEqual(snapshot);
  });

  it('orders a plot time series newest first', async () => {
    const repository = new DexieSnapshotRepository(db);
    await repository.save(snapshotAt(epochMillis(1_000)));
    await repository.save(snapshotAt(epochMillis(3_000)));
    await repository.save(snapshotAt(epochMillis(2_000)));

    expect((await repository.listByPlot(plotId('plot-1'))).map((s) => s.at)).toEqual([
      3_000, 2_000, 1_000,
    ]);
    expect((await repository.latestForPlot(plotId('plot-1')))?.at).toBe(3_000);
  });

  it('keeps each plot series to itself', async () => {
    const repository = new DexieSnapshotRepository(db);
    await repository.save(snapshotAt(epochMillis(1_000)));
    await repository.save(snapshotAt(epochMillis(2_000), { plotId: plotId('plot-2') }));

    expect(await repository.listByPlot(plotId('plot-1'))).toHaveLength(1);
    expect(await repository.latestForPlot(plotId('plot-3'))).toBeUndefined();
  });
});

describe('IndexedDbImageStore', () => {
  it('returns the same bytes it was given', async () => {
    const store = new IndexedDbImageStore(db, countingIds(), fixedClock(AT));
    const bytes = new Uint8Array([1, 2, 3, 250]);

    const ref = await store.put(bytes.buffer, 'image/jpeg');
    const back = await store.get(ref);

    expect(back).toBeDefined();
    expect(new Uint8Array(back as ArrayBuffer)).toEqual(bytes);
  });

  it('forgets an image once it is deleted', async () => {
    const store = new IndexedDbImageStore(db, countingIds(), fixedClock(AT));
    const ref = await store.put(new Uint8Array([9]).buffer, 'image/jpeg');

    await store.delete(ref);

    expect(await store.get(ref)).toBeUndefined();
  });
});
