import { describe, expect, it } from 'vitest';
import { closeCampaign, daysSincePlanting, isCampaignActive, startCampaign } from './Campaign.js';
import { epochMillis } from './EpochMillis.js';
import { campaignId, plotId } from './Ids.js';
import { LocalDate } from './LocalDate.js';
import { CampaignNotActiveError } from '../errors/CampaignNotActiveError.js';
import { InvalidCampaignDatesError } from '../errors/InvalidCampaignDatesError.js';

const TODAY = LocalDate.of(2026, 9, 22);
const STARTED_AT = epochMillis(1_790_114_400_000);

const props = (plantingDate: LocalDate) => ({
  id: campaignId('c1'),
  plotId: plotId('p1'),
  plantingDate,
  startedAt: STARTED_AT,
  today: TODAY,
});

describe('startCampaign', () => {
  it('opens an active campaign of the only crop this system models', () => {
    const campaign = startCampaign(props(LocalDate.of(2026, 9, 15)));

    expect(campaign.crop).toBe('potato');
    expect(campaign.status).toBe('active');
    expect(isCampaignActive(campaign)).toBe(true);
    expect(campaign.plantingDate.toString()).toBe('2026-09-15');
  });

  it('accepts a planting date a few days ahead, for a farmer registering a plan', () => {
    expect(startCampaign(props(LocalDate.of(2026, 10, 10))).plantingDate.toString()).toBe(
      '2026-10-10',
    );
  });

  it('refuses a planting date too far in the future to be anything but a typo', () => {
    expect(() => startCampaign(props(LocalDate.of(2027, 6, 1)))).toThrow(InvalidCampaignDatesError);
  });

  it('refuses a planting date older than a crop cycle plus a season', () => {
    expect(() => startCampaign(props(LocalDate.of(2024, 1, 1)))).toThrow(InvalidCampaignDatesError);
  });
});

describe('closeCampaign', () => {
  const open = startCampaign(props(LocalDate.of(2026, 5, 20)));

  it('freezes the campaign on the harvest day', () => {
    const closed = closeCampaign(open, {
      closedOn: LocalDate.of(2026, 9, 20),
      closedAt: STARTED_AT,
    });

    expect(closed.status).toBe('closed');
    expect(closed.closedOn?.toString()).toBe('2026-09-20');
    expect(isCampaignActive(closed)).toBe(false);
    // The open campaign is untouched: these are values, not mutable records.
    expect(open.status).toBe('active');
  });

  it('refuses to close a campaign twice', () => {
    const closed = closeCampaign(open, {
      closedOn: LocalDate.of(2026, 9, 20),
      closedAt: STARTED_AT,
    });

    expect(() =>
      closeCampaign(closed, { closedOn: LocalDate.of(2026, 9, 21), closedAt: STARTED_AT }),
    ).toThrow(CampaignNotActiveError);
  });

  it('refuses a harvest that happened before the planting', () => {
    expect(() =>
      closeCampaign(open, { closedOn: LocalDate.of(2026, 5, 19), closedAt: STARTED_AT }),
    ).toThrow(InvalidCampaignDatesError);
  });
});

describe('daysSincePlanting', () => {
  const campaign = startCampaign(props(LocalDate.of(2026, 9, 15)));

  it('counts the days that feed every agronomic model', () => {
    expect(daysSincePlanting(campaign, LocalDate.of(2026, 9, 15))).toBe(0);
    expect(daysSincePlanting(campaign, LocalDate.of(2026, 9, 22))).toBe(7);
  });

  it('goes negative before the planting date rather than clamping', () => {
    expect(daysSincePlanting(campaign, LocalDate.of(2026, 9, 10))).toBe(-5);
  });
});
