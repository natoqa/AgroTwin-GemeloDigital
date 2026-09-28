import { InvalidIrrigationDateError } from '../errors/InvalidIrrigationDateError.js';
import type { Campaign } from './Campaign.js';
import type { EpochMillis } from './EpochMillis.js';
import type { CampaignId, PlotId } from './Ids.js';
import type { LocalDate } from './LocalDate.js';

/**
 * The farmer watered the plot on a given day.
 *
 * There is no amount. Asking a farmer irrigating by furrow for millimetres
 * gets a blank or an invented number, the same reason the weather questions
 * are qualitative (CLAUDE.md §9). What the event means for the soil is decided
 * by the water balance, through a coefficient that says how much of the
 * shortfall one irrigation makes up — and that coefficient is provisional and
 * costs confidence, rather than hiding inside a number the farmer never gave.
 *
 * One event per campaign and day: watering twice on the same day is still
 * "I watered today".
 */
export interface Irrigation {
  readonly campaignId: CampaignId;
  readonly plotId: PlotId;
  readonly date: LocalDate;
  readonly recordedAt: EpochMillis;
}

export interface RecordIrrigationProps {
  readonly campaign: Campaign;
  readonly date: LocalDate;
  readonly recordedAt: EpochMillis;
  /** The calendar day the device believes it is. */
  readonly today: LocalDate;
}

/**
 * Builds the event, refusing days that cannot be real.
 *
 * Before planting there is no crop to water, and a day that has not happened
 * yet is a plan, not something the twin can count as water in the soil.
 */
export function recordIrrigation(input: RecordIrrigationProps): Irrigation {
  if (input.date.daysUntil(input.campaign.plantingDate) > 0) {
    throw new InvalidIrrigationDateError('it is before the planting date');
  }
  if (input.today.daysUntil(input.date) > 0) {
    throw new InvalidIrrigationDateError('it is in the future');
  }
  return {
    campaignId: input.campaign.id,
    plotId: input.campaign.plotId,
    date: input.date,
    recordedAt: input.recordedAt,
  };
}
