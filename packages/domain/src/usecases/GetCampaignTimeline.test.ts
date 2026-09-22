import { describe, expect, it } from 'vitest';
import { epochMillis } from '../model/EpochMillis.js';
import { campaignId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { Campaign } from '../model/Campaign.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { MovableClock } from '../testing/doubles.js';
import { createTestTwin } from '../testing/scenario.js';
import type { TestTwin } from '../testing/scenario.js';

const DIAGNOSIS: Diagnosis = { class: 'late_blight', confidence: 0.74, modelVersion: 'mock-1' };
const PLANTING = LocalDate.of(2026, 9, 1);

const noon = (date: LocalDate) => epochMillis(date.toEpochDay() * 86_400_000 + 12 * 3_600_000);

async function campaignWithObservations(
  count: number,
  daysApart = 10,
): Promise<{ test: TestTwin; campaign: Campaign; clock: MovableClock }> {
  const clock = new MovableClock(noon(LocalDate.of(2026, 9, 2)));
  const test = createTestTwin({ clock, diagnosis: DIAGNOSIS });
  const plot = await test.createPlot({ name: 'Chacra de arriba' });
  const campaign = await test.startCampaign({ plotId: plot.id, plantingDate: PLANTING });

  for (let index = 0; index < count; index += 1) {
    await test.recordObservation({
      campaignId: campaign.id,
      image: new ArrayBuffer(4096),
      contentType: 'image/jpeg',
    });
    if (index < count - 1) clock.advanceDays(daysApart);
  }

  return { test, campaign, clock };
}

describe('getCampaignTimelineUseCase', () => {
  it('returns the history oldest first, with the day of the campaign', async () => {
    const { test, campaign } = await campaignWithObservations(3);

    const timeline = await test.getCampaignTimeline(campaign.id);

    expect(timeline.campaign.id).toBe(campaign.id);
    expect(timeline.plot.name).toBe('Chacra de arriba');
    expect(timeline.entries.map((entry) => entry.dayOfCampaign)).toEqual([1, 11, 21]);
    expect(timeline.entries.every((entry) => entry.hasOriginalImage)).toBe(true);
  });

  it('links each snapshot back to the evidence it came from', async () => {
    const { test, campaign } = await campaignWithObservations(1);

    const [entry] = (await test.getCampaignTimeline(campaign.id)).entries;

    expect(entry?.observation?.id).toBe(entry?.snapshot.observationId);
    expect(entry?.thumbnailRef).toBeDefined();
  });

  /**
   * CLAUDE.md §8.1: the StateStore must rebuild the twin from its snapshots
   * even when the original images are gone. This is that requirement as a
   * test, run against a device whose photographs have all been purged.
   */
  it('rebuilds the whole campaign after every original photograph is purged', async () => {
    const { test, campaign, clock } = await campaignWithObservations(3);
    const before = await test.getCampaignTimeline(campaign.id);

    clock.advanceDays(60);
    const purge = await test.applyImageRetention();

    expect(purge.purgedCount).toBe(3);
    expect(await test.images.listOriginals()).toHaveLength(0);

    const after = await test.getCampaignTimeline(campaign.id);

    expect(after.entries).toHaveLength(before.entries.length);
    expect(after.entries.map((entry) => entry.snapshot)).toEqual(
      before.entries.map((entry) => entry.snapshot),
    );
    expect(after.entries.map((entry) => entry.dayOfCampaign)).toEqual([1, 11, 21]);
    expect(after.entries.map((entry) => entry.snapshot.diagnosis.class)).toEqual([
      'late_blight',
      'late_blight',
      'late_blight',
    ]);
    // What was traded away is the photograph, never the state or the thumbnail.
    expect(after.entries.every((entry) => entry.hasOriginalImage)).toBe(false);
    expect(after.entries.every((entry) => entry.thumbnailRef !== undefined)).toBe(true);
    expect(after.entries.every((entry) => entry.observation !== undefined)).toBe(true);
  });

  it('refuses a campaign that does not exist', async () => {
    const { test } = await campaignWithObservations(1);

    await expect(test.getCampaignTimeline(campaignId('missing'))).rejects.toThrow(
      CampaignNotFoundError,
    );
  });
});
