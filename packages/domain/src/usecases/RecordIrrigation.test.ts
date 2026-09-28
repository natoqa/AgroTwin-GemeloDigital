import { describe, expect, it } from 'vitest';
import { CampaignNotActiveError } from '../errors/CampaignNotActiveError.js';
import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { InvalidIrrigationDateError } from '../errors/InvalidIrrigationDateError.js';
import { epochMillis } from '../model/EpochMillis.js';
import { campaignId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import {
  InMemoryCampaigns,
  InMemoryIrrigations,
  InMemoryPlots,
  countingIds,
  fixedClock,
} from '../testing/doubles.js';
import { closeCampaignUseCase } from './CloseCampaign.js';
import { createPlotUseCase } from './CreatePlot.js';
import { recordIrrigationUseCase } from './RecordIrrigation.js';
import { startCampaignUseCase } from './StartCampaign.js';

const TODAY = LocalDate.of(2026, 9, 20);
const NOW = epochMillis(TODAY.toEpochDay() * 86_400_000 + 12 * 3_600_000);
const PLANTING = LocalDate.of(2026, 9, 1);

async function subject() {
  const plots = new InMemoryPlots();
  const campaigns = new InMemoryCampaigns();
  const irrigations = new InMemoryIrrigations();
  const clock = fixedClock(NOW);
  const ids = countingIds();

  const plot = await createPlotUseCase({ plots, clock, ids })({ name: 'Chacra de abajo' });
  const campaign = await startCampaignUseCase({ plots, campaigns, clock, ids })({
    plotId: plot.id,
    plantingDate: PLANTING,
  });

  return {
    execute: recordIrrigationUseCase({ campaigns, irrigations, clock }),
    close: closeCampaignUseCase({ campaigns, clock }),
    campaign,
    irrigations,
  };
}

describe('recordIrrigationUseCase', () => {
  it('records today by default, because the farmer says "I watered today"', async () => {
    const { execute, campaign, irrigations } = await subject();

    const irrigation = await execute({ campaignId: campaign.id });

    expect(irrigation.date.equals(TODAY)).toBe(true);
    expect(irrigation.plotId).toBe(campaign.plotId);
    expect(irrigation.recordedAt).toBe(NOW);
    expect(await irrigations.listByCampaign(campaign.id)).toEqual([irrigation]);
  });

  it('keeps one record per day, however many times the farmer taps', async () => {
    const { execute, campaign, irrigations } = await subject();

    await execute({ campaignId: campaign.id });
    await execute({ campaignId: campaign.id });
    await execute({ campaignId: campaign.id, date: TODAY.plusDays(-3) });

    const stored = await irrigations.listByCampaign(campaign.id);
    expect(stored.map((irrigation) => irrigation.date.toString())).toEqual([
      '2026-09-17',
      '2026-09-20',
    ]);
  });

  it('accepts the planting day itself', async () => {
    const { execute, campaign } = await subject();

    const irrigation = await execute({ campaignId: campaign.id, date: PLANTING });

    expect(irrigation.date.equals(PLANTING)).toBe(true);
  });

  it('refuses a day before planting and a day that has not happened', async () => {
    const { execute, campaign } = await subject();

    await expect(execute({ campaignId: campaign.id, date: PLANTING.plusDays(-1) })).rejects.toThrow(
      InvalidIrrigationDateError,
    );
    await expect(execute({ campaignId: campaign.id, date: TODAY.plusDays(1) })).rejects.toThrow(
      /future/u,
    );
  });

  it('refuses a harvested campaign and one that does not exist', async () => {
    const { execute, close, campaign } = await subject();

    await expect(execute({ campaignId: campaignId('missing') })).rejects.toThrow(
      CampaignNotFoundError,
    );

    await close({ campaignId: campaign.id });
    await expect(execute({ campaignId: campaign.id })).rejects.toThrow(CampaignNotActiveError);
  });
});
