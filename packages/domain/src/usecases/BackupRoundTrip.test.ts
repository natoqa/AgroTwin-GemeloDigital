import { describe, expect, it } from 'vitest';
import { epochMillis } from '../model/EpochMillis.js';
import { LocalDate } from '../model/LocalDate.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import { BackupFormatError } from '../errors/BackupFormatError.js';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, parseBackup } from '../backup/BackupDocument.js';
import { MovableClock, decodeBase64 } from '../testing/doubles.js';
import { createTestTwin } from '../testing/scenario.js';
import type { TestTwin } from '../testing/scenario.js';

const DIAGNOSIS: Diagnosis = { class: 'early_blight', confidence: 0.81, modelVersion: 'mock-1' };
const noon = (date: LocalDate) => epochMillis(date.toEpochDay() * 86_400_000 + 12 * 3_600_000);

async function populated(): Promise<TestTwin> {
  const clock = new MovableClock(noon(LocalDate.of(2026, 9, 2)));
  const test = createTestTwin({ clock, diagnosis: DIAGNOSIS });

  const plot = await test.createPlot({
    name: 'Chacra de arriba',
    area: 0.4,
    location: { latitude: -8.11, longitude: -78.01, altitude: 3100 },
  });
  const campaign = await test.startCampaign({
    plotId: plot.id,
    plantingDate: LocalDate.of(2026, 9, 1),
  });

  for (let index = 0; index < 2; index += 1) {
    const bytes = new Uint8Array([index, 1, 2, 3, 250, 251, 252, 253]);
    await test.recordObservation({
      campaignId: campaign.id,
      image: bytes.buffer,
      contentType: 'image/jpeg',
      note: `observación ${index}`,
    });
    clock.advanceDays(5);
  }

  return test;
}

async function stateOf(test: TestTwin) {
  return {
    plots: await test.plots.listAll(),
    campaigns: await test.campaigns.listAll(),
    observations: await test.observations.listAll(),
    snapshots: await test.snapshots.listAll(),
  };
}

describe('backup round trip', () => {
  /**
   * The Phase 2 exit criterion: export, wipe the device, import, and be back
   * where you started. With no cloud anywhere, this file is the only copy of
   * the twin a farmer can hold.
   */
  it('exports, erases and restores the whole twin', async () => {
    const test = await populated();
    const before = await stateOf(test);
    const thumbnailRef = before.observations[0]?.thumbnailRef;
    expect(thumbnailRef).toBeDefined();
    const thumbnailBytes = thumbnailRef ? await test.images.get(thumbnailRef) : undefined;

    const backup = await test.exportBackup();

    await test.eraseAllData();
    expect(await stateOf(test)).toEqual({
      plots: [],
      campaigns: [],
      observations: [],
      snapshots: [],
    });

    const summary = await test.importBackup(backup.contents);

    expect(summary).toEqual({
      plots: 1,
      campaigns: 1,
      observations: 2,
      snapshots: 2,
      images: 2,
    });
    expect(await stateOf(test)).toEqual(before);

    // The thumbnails come back byte for byte, so the restored history is still
    // something the farmer recognises.
    const restored = thumbnailRef ? await test.images.get(thumbnailRef) : undefined;
    expect(new Uint8Array(restored ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array(thumbnailBytes ?? new ArrayBuffer(0)),
    );
  });

  it('writes a file that declares its own format and version', async () => {
    const test = await populated();

    const backup = await test.exportBackup();
    const parsed = parseBackup(backup.contents);

    expect(parsed.format).toBe(BACKUP_FORMAT);
    expect(parsed.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(backup.createdOn.toString()).toBe('2026-09-12');
  });

  it('carries thumbnails and leaves the full photographs out', async () => {
    const test = await populated();

    const backup = await test.exportBackup();

    expect(backup.document.images).toHaveLength(2);
    expect(backup.document.images.every((image) => image.kind === 'thumbnail')).toBe(true);
    expect(decodeBase64(backup.document.images[0]?.base64 ?? '').length).toBeGreaterThan(0);
  });

  it('can be imported twice without duplicating anything', async () => {
    const test = await populated();
    const backup = await test.exportBackup();
    const before = await stateOf(test);

    await test.importBackup(backup.contents);
    await test.importBackup(backup.contents);

    expect(await stateOf(test)).toEqual(before);
  });

  it('restores a plot exactly, including the coordinates Phase 3 needs', async () => {
    const test = await populated();
    const backup = await test.exportBackup();
    await test.eraseAllData();

    await test.importBackup(backup.contents);

    const [plot] = await test.plots.listAll();
    expect(plot?.area).toBe(0.4);
    expect(plot?.location).toEqual({ latitude: -8.11, longitude: -78.01, altitude: 3100 });
  });
});

describe('importBackupUseCase refusals', () => {
  it('refuses a file that is not a backup', async () => {
    const test = await populated();

    await expect(test.importBackup('{"hello":true}')).rejects.toThrow(BackupFormatError);
    await expect(test.importBackup('not json at all')).rejects.toThrow(BackupFormatError);
  });

  it('refuses a format version it cannot read', async () => {
    const test = await populated();
    const backup = await test.exportBackup();
    const future = backup.contents.replace('"formatVersion": 1', '"formatVersion": 99');

    await expect(test.importBackup(future)).rejects.toThrow(/format version 99/u);
  });

  it('refuses a file whose references do not resolve, writing nothing', async () => {
    const test = await populated();
    const backup = await test.exportBackup();
    await test.eraseAllData();

    const orphaned = JSON.parse(backup.contents) as { plots: unknown[] };
    orphaned.plots = [];

    await expect(test.importBackup(JSON.stringify(orphaned))).rejects.toThrow(BackupFormatError);
    expect(await stateOf(test)).toEqual({
      plots: [],
      campaigns: [],
      observations: [],
      snapshots: [],
    });
  });
});
