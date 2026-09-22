import { describe, expect, it } from 'vitest';
import { epochMillis } from '../model/EpochMillis.js';
import { plotId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { Diagnosis } from '../model/Diagnosis.js';
import { ActiveCampaignAlreadyExistsError } from '../errors/ActiveCampaignAlreadyExistsError.js';
import { PlotNotFoundError } from '../errors/PlotNotFoundError.js';
import { fixedClock } from '../testing/doubles.js';
import { createTestTwin } from '../testing/scenario.js';

const AT = epochMillis(1_790_114_400_000); // 2026-09-22T22:00:00Z
const DIAGNOSIS: Diagnosis = { class: 'healthy', confidence: 0.9, modelVersion: 'mock-1' };

const twin = () => createTestTwin({ clock: fixedClock(AT), diagnosis: DIAGNOSIS });

describe('startCampaignUseCase', () => {
  it('opens a campaign on an existing plot', async () => {
    const test = twin();
    const plot = await test.createPlot({ name: 'Chacra de arriba' });

    const campaign = await test.startCampaign({
      plotId: plot.id,
      plantingDate: LocalDate.of(2026, 9, 10),
    });

    expect(campaign.plotId).toBe(plot.id);
    expect(campaign.status).toBe('active');
    expect(campaign.startedAt).toBe(AT);
    expect(await test.campaigns.findActiveByPlot(plot.id)).toEqual(campaign);
  });

  it('refuses a second open campaign on the same plot', async () => {
    const test = twin();
    const plot = await test.createPlot({ name: 'Chacra de arriba' });
    await test.startCampaign({ plotId: plot.id, plantingDate: LocalDate.of(2026, 9, 10) });

    await expect(
      test.startCampaign({ plotId: plot.id, plantingDate: LocalDate.of(2026, 9, 12) }),
    ).rejects.toThrow(ActiveCampaignAlreadyExistsError);

    expect(await test.campaigns.listByPlot(plot.id)).toHaveLength(1);
  });

  it('allows a new campaign once the previous one is harvested', async () => {
    const test = twin();
    const plot = await test.createPlot({ name: 'Chacra de arriba' });
    const first = await test.startCampaign({
      plotId: plot.id,
      plantingDate: LocalDate.of(2026, 3, 1),
    });
    await test.closeCampaign({ campaignId: first.id });

    const second = await test.startCampaign({
      plotId: plot.id,
      plantingDate: LocalDate.of(2026, 9, 10),
    });

    expect(second.id).not.toBe(first.id);
    expect(await test.campaigns.listByPlot(plot.id)).toHaveLength(2);
  });

  it('refuses a plot that does not exist', async () => {
    const test = twin();

    await expect(
      test.startCampaign({ plotId: plotId('missing'), plantingDate: LocalDate.of(2026, 9, 10) }),
    ).rejects.toThrow(PlotNotFoundError);
  });
});
