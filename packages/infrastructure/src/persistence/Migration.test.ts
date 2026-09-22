import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { AgroTwinDb } from './AgroTwinDb.js';

/**
 * The upgrade from the Phase 1 schema.
 *
 * Every snapshot now belongs to a campaign, and a Phase 1 snapshot has no
 * planting date to belong to. Inventing one would feed a guess into growing
 * degree days and the water balance as though it were a fact, so the upgrade
 * drops those rows instead. This test is here to make that deletion a stated,
 * tested decision rather than a surprise on someone's phone.
 */

const NAME = 'agrotwin-migration-test';

afterEach(async () => {
  await AgroTwinDb.delete(NAME);
});

async function seedVersion1(): Promise<void> {
  const legacy = new Dexie(NAME);
  legacy.version(1).stores({
    plots: 'id, createdAt',
    snapshots: 'id, plotId, at, [plotId+at]',
    images: 'id, storedAt',
  });
  await legacy.open();
  await legacy.table('plots').put({ id: 'plot-1', name: 'Chacra de arriba', createdAt: 1_000 });
  await legacy.table('snapshots').put({
    id: 'snap-1',
    plotId: 'plot-1',
    at: 1_000,
    date: '2026-09-21',
    diagnosisClass: 'healthy',
    diagnosisConfidence: 0.9,
    modelVersion: 'mock-1',
    confidence: 0.9,
    provenance: [],
  });
  await legacy.table('images').put({
    id: 'img-1',
    data: new ArrayBuffer(8),
    contentType: 'image/jpeg',
    storedAt: 1_000,
  });
  legacy.close();
}

describe('AgroTwinDb version 2', () => {
  it('keeps the plots a farmer registered in Phase 1', async () => {
    await seedVersion1();

    const db = new AgroTwinDb(NAME);
    await db.open();

    expect(await db.plots.get('plot-1')).toMatchObject({ name: 'Chacra de arriba' });
    db.close();
  });

  it('drops snapshots that predate campaigns rather than inventing one', async () => {
    await seedVersion1();

    const db = new AgroTwinDb(NAME);
    await db.open();

    expect(await db.snapshots.count()).toBe(0);
    db.close();
  });

  it('drops the old in-database image blobs, which now live in OPFS', async () => {
    await seedVersion1();

    const db = new AgroTwinDb(NAME);
    await db.open();

    expect(await db.images.count()).toBe(0);
    db.close();
  });

  it('opens the new tables ready for use', async () => {
    await seedVersion1();

    const db = new AgroTwinDb(NAME);
    await db.open();

    expect(await db.campaigns.count()).toBe(0);
    expect(await db.observations.count()).toBe(0);
    db.close();
  });
});
