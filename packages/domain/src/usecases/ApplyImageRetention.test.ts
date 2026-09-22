import { describe, expect, it } from 'vitest';
import { epochMillis } from '../model/EpochMillis.js';
import { LocalDate } from '../model/LocalDate.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import type { RetentionPolicy } from '../model/RetentionPolicy.js';
import { MovableClock } from '../testing/doubles.js';
import { createTestTwin } from '../testing/scenario.js';

const DIAGNOSIS: Diagnosis = { class: 'healthy', confidence: 0.88, modelVersion: 'mock-1' };
const noon = (date: LocalDate) => epochMillis(date.toEpochDay() * 86_400_000 + 12 * 3_600_000);

async function twinWithPhotos(count: number, bytes: number, retention?: RetentionPolicy) {
  const clock = new MovableClock(noon(LocalDate.of(2026, 9, 2)));
  const test = createTestTwin({
    clock,
    diagnosis: DIAGNOSIS,
    ...(retention === undefined ? {} : { retention }),
  });
  const plot = await test.createPlot({ name: 'Chacra de arriba' });
  const campaign = await test.startCampaign({
    plotId: plot.id,
    plantingDate: LocalDate.of(2026, 9, 1),
  });

  for (let index = 0; index < count; index += 1) {
    await test.recordObservation({
      campaignId: campaign.id,
      image: new ArrayBuffer(bytes),
      contentType: 'image/jpeg',
    });
    clock.advanceDays(10);
  }

  return { test, campaign, clock };
}

describe('applyImageRetentionUseCase', () => {
  it('keeps everything while nothing is old or over budget', async () => {
    const { test } = await twinWithPhotos(2, 1024);

    const result = await test.applyImageRetention();

    expect(result.purgedCount).toBe(0);
    expect(await test.images.listOriginals()).toHaveLength(2);
  });

  it('drops only the photographs older than the policy allows', async () => {
    // Taken on days 0, 10 and 20; then twenty more days pass, so the oldest
    // two are past the 30-day window and the newest is not.
    const { test, clock } = await twinWithPhotos(3, 1024);
    clock.advanceDays(11);

    const result = await test.applyImageRetention();

    expect(result.purgedCount).toBe(2);
    expect(result.freedBytes).toBe(2048);
    expect(await test.images.listOriginals()).toHaveLength(1);
  });

  it('forgets the reference on the observation, not the observation', async () => {
    const { test, campaign, clock } = await twinWithPhotos(1, 1024);
    clock.advanceDays(60);

    await test.applyImageRetention();

    const [observation] = await test.observations.listByCampaign(campaign.id);
    expect(observation).toBeDefined();
    expect(observation?.imageRef).toBeUndefined();
    expect(observation?.thumbnailRef).toBeDefined();
    expect(observation?.diagnosis).toEqual(DIAGNOSIS);
  });

  it('never purges thumbnails, whatever the age', async () => {
    const { test, clock } = await twinWithPhotos(2, 1024);
    clock.advanceDays(200);

    await test.applyImageRetention();

    const thumbnails = [...test.images.items.values()].filter(
      (held) => held.info.kind === 'thumbnail',
    );
    expect(thumbnails).toHaveLength(2);
  });

  it('gives up the oldest survivors when the byte budget is still exceeded', async () => {
    // Nothing is old enough to expire, so only the size ceiling can bite.
    const policy: RetentionPolicy = { keepOriginalsForDays: 3650, maxOriginalBytes: 2500 };
    const { test } = await twinWithPhotos(3, 1000, policy);
    const before = await test.images.listOriginals();

    const result = await test.applyImageRetention();

    expect(result.purgedCount).toBe(1);
    expect(result.remainingBytes).toBe(2000);
    // The oldest goes; the newest photograph is the one worth keeping.
    const survivors = await test.images.listOriginals();
    expect(survivors.map((image) => image.ref)).toEqual(
      before.slice(1).map((image) => image.ref),
    );
  });
});
