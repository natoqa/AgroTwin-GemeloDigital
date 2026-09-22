import { CampaignNotActiveError } from '../errors/CampaignNotActiveError.js';
import { InvalidCampaignDatesError } from '../errors/InvalidCampaignDatesError.js';
import type { EpochMillis } from './EpochMillis.js';
import type { CampaignId, PlotId } from './Ids.js';
import type { LocalDate } from './LocalDate.js';

/** The only crop this system models (CLAUDE.md §2). */
export const CROP = 'potato' as const;
export type Crop = typeof CROP;

export type CampaignStatus = 'active' | 'closed';

/** A planting date further ahead than this is a typo, not a plan. */
const MAX_DAYS_IN_FUTURE = 30;

/** Beyond this, the farmer is registering history, not the current cycle. */
const MAX_DAYS_IN_PAST = 400;

/**
 * One crop cycle on one plot: from planting to harvest.
 *
 * The campaign is what makes the twin's time series mean something. Growing
 * degree days accumulate *from the planting date*, the water balance starts
 * from it, and the phenological stage is only defined inside a cycle. A
 * snapshot without a campaign is a photograph with a timestamp; a snapshot
 * inside a campaign is a state of the crop.
 *
 * There is no farmer-facing name: a campaign is identified by its planting
 * date, which is the thing the farmer actually remembers. One text field fewer
 * on a phone, for a user CLAUDE.md §3 defines as low-literacy.
 */
export interface Campaign {
  readonly id: CampaignId;
  readonly plotId: PlotId;
  readonly crop: Crop;
  readonly plantingDate: LocalDate;
  /** When the record was created, which is not when the crop was planted. */
  readonly startedAt: EpochMillis;
  readonly status: CampaignStatus;
  readonly closedOn?: LocalDate;
  readonly closedAt?: EpochMillis;
}

export interface StartCampaignProps {
  readonly id: CampaignId;
  readonly plotId: PlotId;
  readonly plantingDate: LocalDate;
  readonly startedAt: EpochMillis;
  /** The calendar day the device believes it is, used to sanity-check the date. */
  readonly today: LocalDate;
}

export function startCampaign(input: StartCampaignProps): Campaign {
  const offset = input.today.daysUntil(input.plantingDate);
  if (offset > MAX_DAYS_IN_FUTURE) {
    throw new InvalidCampaignDatesError(
      `the planting date is ${offset} days in the future; at most ${MAX_DAYS_IN_FUTURE} is allowed`,
    );
  }
  if (-offset > MAX_DAYS_IN_PAST) {
    throw new InvalidCampaignDatesError(
      `the planting date is ${-offset} days in the past; at most ${MAX_DAYS_IN_PAST} is allowed`,
    );
  }

  return {
    id: input.id,
    plotId: input.plotId,
    crop: CROP,
    plantingDate: input.plantingDate,
    startedAt: input.startedAt,
    status: 'active',
  };
}

export interface CloseCampaignProps {
  readonly closedOn: LocalDate;
  readonly closedAt: EpochMillis;
}

/** Returns the campaign closed. Closing is final: the history stops growing. */
export function closeCampaign(campaign: Campaign, input: CloseCampaignProps): Campaign {
  if (campaign.status !== 'active') {
    throw new CampaignNotActiveError(campaign.id, 'be closed again');
  }
  if (input.closedOn.daysUntil(campaign.plantingDate) > 0) {
    throw new InvalidCampaignDatesError('the harvest date is before the planting date');
  }

  return {
    id: campaign.id,
    plotId: campaign.plotId,
    crop: campaign.crop,
    plantingDate: campaign.plantingDate,
    startedAt: campaign.startedAt,
    status: 'closed',
    closedOn: input.closedOn,
    closedAt: input.closedAt,
  };
}

export const isCampaignActive = (campaign: Campaign): boolean => campaign.status === 'active';

/**
 * Days elapsed since planting, which is the x-axis of every agronomic model
 * Phase 3 adds. Negative before the planting date.
 */
export const daysSincePlanting = (campaign: Campaign, date: LocalDate): number =>
  campaign.plantingDate.daysUntil(date);
