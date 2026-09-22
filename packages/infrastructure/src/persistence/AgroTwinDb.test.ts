import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LocalDate,
  campaignId,
  createObservation,
  createPlot,
  epochMillis,
  imageRef,
  observationId,
  plotId,
  snapshotId,
  startCampaign,
  withOriginalPurged,
} from '@agrotwin/domain';
import type { Campaign, EpochMillis, Observation, Plot, TwinSnapshot } from '@agrotwin/domain';
import { AgroTwinDb } from './AgroTwinDb.js';
import { DexieCampaignRepository } from './DexieCampaignRepository.js';
import { DexieObservationRepository } from './DexieObservationRepository.js';
import { DexiePlotRepository } from './DexiePlotRepository.js';
import { DexieSnapshotRepository } from './DexieSnapshotRepository.js';

const AT = epochMillis(1_790_028_000_000); // 2026-09-21T22:00:00Z
const PLOT_ID = plotId('plot-1');
const CAMPAIGN_ID = campaignId('camp-1');

const campaign = (overrides: Partial<Campaign> = {}): Campaign => ({
  ...startCampaign({
    id: CAMPAIGN_ID,
    plotId: PLOT_ID,
    plantingDate: LocalDate.of(2026, 9, 1),
    startedAt: AT,
    today: LocalDate.of(2026, 9, 21),
  }),
  ...overrides,
});

const snapshotAt = (at: EpochMillis, overrides: Partial<TwinSnapshot> = {}): TwinSnapshot => ({
  id: snapshotId(`snap-${at}`),
  plotId: PLOT_ID,
  campaignId: CAMPAIGN_ID,
  at,
  date: LocalDate.fromEpochMillis(at),
  diagnosis: { class: 'late_blight', confidence: 0.83, modelVersion: 'mock-1' },
  confidence: 0.83,
  provenance: [{ field: 'diagnosis', source: 'image_diagnosis', confidence: 0.83 }],
  ...overrides,
});

const observationAt = (at: EpochMillis, overrides: Partial<Observation> = {}): Observation =>
  createObservation({
    id: observationId(`obs-${at}`),
    plotId: PLOT_ID,
    campaignId: CAMPAIGN_ID,
    at,
    date: LocalDate.fromEpochMillis(at),
    diagnosis: { class: 'healthy', confidence: 0.9, modelVersion: 'mock-1' },
    imageRef: imageRef(`original-${at}`),
    thumbnailRef: imageRef(`thumbnail-${at}`),
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
    const plot = createPlot({ id: PLOT_ID, name: 'Chacra de arriba', createdAt: AT });

    await repository.save(plot);

    expect(await repository.findById(plot.id)).toEqual(plot);
  });

  it('round-trips the area and the coordinates Phase 3 will need', async () => {
    const repository = new DexiePlotRepository(db);
    const plot = createPlot({
      id: PLOT_ID,
      name: 'Chacra de arriba',
      createdAt: AT,
      area: 0.4,
      location: { latitude: -8.11, longitude: -78.01, altitude: 3100 },
    });

    await repository.save(plot);

    expect(await repository.findById(plot.id)).toEqual(plot);
  });

  it('keeps an absent location absent instead of inventing zeroes', async () => {
    const repository = new DexiePlotRepository(db);
    await repository.save(createPlot({ id: PLOT_ID, name: 'Sin datos', createdAt: AT }));

    const stored = await repository.findById(PLOT_ID);

    expect(stored?.location).toBeUndefined();
    expect(stored?.area).toBeUndefined();
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

describe('DexieCampaignRepository', () => {
  it('rebuilds the planting date as a LocalDate', async () => {
    const repository = new DexieCampaignRepository(db);
    const stored = campaign();

    await repository.save(stored);
    const back = await repository.findById(stored.id);

    expect(back?.plantingDate).toBeInstanceOf(LocalDate);
    expect(back).toEqual(stored);
  });

  it('finds the one open campaign of a plot', async () => {
    const repository = new DexieCampaignRepository(db);
    await repository.save(
      campaign({
        id: campaignId('old'),
        status: 'closed',
        closedOn: LocalDate.of(2026, 8, 30),
        closedAt: AT,
      }),
    );
    await repository.save(campaign());

    expect((await repository.findActiveByPlot(PLOT_ID))?.id).toBe(CAMPAIGN_ID);
  });

  it('reports no open campaign once the crop is harvested', async () => {
    const repository = new DexieCampaignRepository(db);
    await repository.save(
      campaign({ status: 'closed', closedOn: LocalDate.of(2026, 9, 20), closedAt: AT }),
    );

    expect(await repository.findActiveByPlot(PLOT_ID)).toBeUndefined();
  });
});

describe('DexieObservationRepository', () => {
  it('stores the evidence and reads it back whole', async () => {
    const repository = new DexieObservationRepository(db);
    const observation = observationAt(AT, { note: 'manchas en las hojas bajas' });

    await repository.save(observation);

    expect(await repository.findById(observation.id)).toEqual(observation);
  });

  it('finds the observation holding a photograph, which is what retention needs', async () => {
    const repository = new DexieObservationRepository(db);
    const observation = observationAt(AT);
    await repository.save(observation);

    const found = await repository.findByOriginalImageRef(imageRef(`original-${AT}`));

    expect(found?.id).toBe(observation.id);
  });

  it('stops finding it once the reference is purged', async () => {
    const repository = new DexieObservationRepository(db);
    const observation = observationAt(AT);
    await repository.save(observation);

    await repository.save(withOriginalPurged(observation));

    expect(await repository.findByOriginalImageRef(imageRef(`original-${AT}`))).toBeUndefined();
    // The observation itself survives: only the photograph was forgotten.
    expect((await repository.findById(observation.id))?.thumbnailRef).toBeDefined();
  });

  it('lists a campaign newest first', async () => {
    const repository = new DexieObservationRepository(db);
    await repository.save(observationAt(epochMillis(1_000)));
    await repository.save(observationAt(epochMillis(3_000)));
    await repository.save(observationAt(epochMillis(2_000)));

    expect((await repository.listByCampaign(CAMPAIGN_ID)).map((o) => o.at)).toEqual([
      3_000, 2_000, 1_000,
    ]);
  });
});

describe('DexieSnapshotRepository', () => {
  it('rebuilds the value objects it stored as primitives', async () => {
    const repository = new DexieSnapshotRepository(db);
    const snapshot = snapshotAt(AT, { observationId: observationId('obs-1') });

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

    expect((await repository.listByPlot(PLOT_ID)).map((s) => s.at)).toEqual([3_000, 2_000, 1_000]);
    expect((await repository.latestForPlot(PLOT_ID))?.at).toBe(3_000);
  });

  it('orders a campaign series oldest first, the way the models read it', async () => {
    const repository = new DexieSnapshotRepository(db);
    await repository.save(snapshotAt(epochMillis(3_000)));
    await repository.save(snapshotAt(epochMillis(1_000)));
    await repository.save(snapshotAt(epochMillis(2_000)));

    expect((await repository.listByCampaign(CAMPAIGN_ID)).map((s) => s.at)).toEqual([
      1_000, 2_000, 3_000,
    ]);
  });

  it('keeps each plot series to itself', async () => {
    const repository = new DexieSnapshotRepository(db);
    await repository.save(snapshotAt(epochMillis(1_000)));
    await repository.save(snapshotAt(epochMillis(2_000), { plotId: plotId('plot-2') }));

    expect(await repository.listByPlot(PLOT_ID)).toHaveLength(1);
    expect(await repository.latestForPlot(plotId('plot-3'))).toBeUndefined();
  });
});

describe('deleteAll', () => {
  it('leaves every table empty, which is what a restore starts from', async () => {
    const plots = new DexiePlotRepository(db);
    const campaigns = new DexieCampaignRepository(db);
    const observations = new DexieObservationRepository(db);
    const snapshots = new DexieSnapshotRepository(db);

    await plots.save(createPlot({ id: PLOT_ID, name: 'Chacra', createdAt: AT }));
    await campaigns.save(campaign());
    await observations.save(observationAt(AT));
    await snapshots.save(snapshotAt(AT));

    await Promise.all([
      plots.deleteAll(),
      campaigns.deleteAll(),
      observations.deleteAll(),
      snapshots.deleteAll(),
    ]);

    expect(await plots.listAll()).toHaveLength(0);
    expect(await campaigns.listAll()).toHaveLength(0);
    expect(await observations.listAll()).toHaveLength(0);
    expect(await snapshots.listAll()).toHaveLength(0);
  });
});
