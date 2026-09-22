import { describe, expect, it } from 'vitest';
import { epochMillis } from '../model/EpochMillis.js';
import { campaignId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { fixedClock } from '../testing/doubles.js';
import { createTestTwin } from '../testing/scenario.js';

const AT = epochMillis(1_790_114_400_000); // 2026-09-22T22:00:00Z
const DIAGNOSIS: Diagnosis = { class: 'healthy', confidence: 0.9, modelVersion: 'mock-1' };

async function openCampaign() {
  const test = createTestTwin({ clock: fixedClock(AT), diagnosis: DIAGNOSIS });
  const plot = await test.createPlot({ name: 'Chacra de arriba' });
  const campaign = await test.startCampaign({
    plotId: plot.id,
    plantingDate: LocalDate.of(2026, 5, 20),
  });
  return { test, campaign };
}

describe('closeCampaignUseCase', () => {
  it('closes on today when no harvest date is given', async () => {
    const { test, campaign } = await openCampaign();

    const closed = await test.closeCampaign({ campaignId: campaign.id });

    expect(closed.status).toBe('closed');
    expect(closed.closedOn?.toString()).toBe('2026-09-22');
    expect(closed.closedAt).toBe(AT);
  });

  it('accepts a harvest date the farmer remembers', async () => {
    const { test, campaign } = await openCampaign();

    const closed = await test.closeCampaign({
      campaignId: campaign.id,
      closedOn: LocalDate.of(2026, 9, 18),
    });

    expect(closed.closedOn?.toString()).toBe('2026-09-18');
  });

  it('leaves the plot free to start another campaign', async () => {
    const { test, campaign } = await openCampaign();

    await test.closeCampaign({ campaignId: campaign.id });

    expect(await test.campaigns.findActiveByPlot(campaign.plotId)).toBeUndefined();
  });

  it('refuses a campaign that does not exist', async () => {
    const { test } = await openCampaign();

    await expect(test.closeCampaign({ campaignId: campaignId('missing') })).rejects.toThrow(
      CampaignNotFoundError,
    );
  });
});
