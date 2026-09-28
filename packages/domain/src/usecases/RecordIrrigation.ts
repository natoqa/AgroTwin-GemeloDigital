import { CampaignNotActiveError } from '../errors/CampaignNotActiveError.js';
import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { isCampaignActive } from '../model/Campaign.js';
import type { CampaignId } from '../model/Ids.js';
import { recordIrrigation } from '../model/Irrigation.js';
import type { Irrigation } from '../model/Irrigation.js';
import { LocalDate } from '../model/LocalDate.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { IrrigationRepositoryPort } from '../ports/IrrigationRepositoryPort.js';

export interface RecordIrrigationDependencies {
  readonly campaigns: CampaignRepositoryPort;
  readonly irrigations: IrrigationRepositoryPort;
  readonly clock: ClockPort;
}

export interface RecordIrrigationInput {
  readonly campaignId: CampaignId;
  /** The day the plot was watered. Defaults to today: "I watered today". */
  readonly date?: LocalDate;
}

/**
 * Records that the farmer watered the plot.
 *
 * Until Phase 4 the water balance could count irrigation but nothing could
 * report one, so the twin's soil only ever dried out: a farmer who watered
 * every week would still have been told the crop was thirsty.
 */
export function recordIrrigationUseCase(deps: RecordIrrigationDependencies) {
  return async function execute(input: RecordIrrigationInput): Promise<Irrigation> {
    const campaign = await deps.campaigns.findById(input.campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(input.campaignId);
    }
    if (!isCampaignActive(campaign)) {
      throw new CampaignNotActiveError(campaign.id, 'take an irrigation');
    }

    const recordedAt = deps.clock.now();
    const today = LocalDate.fromEpochMillis(recordedAt);
    const irrigation = recordIrrigation({
      campaign,
      date: input.date ?? today,
      recordedAt,
      today,
    });

    await deps.irrigations.save(irrigation);
    return irrigation;
  };
}
