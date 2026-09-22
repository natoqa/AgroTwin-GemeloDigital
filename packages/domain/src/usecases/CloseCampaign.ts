import { CampaignNotFoundError } from '../errors/CampaignNotFoundError.js';
import { closeCampaign } from '../model/Campaign.js';
import type { Campaign } from '../model/Campaign.js';
import type { CampaignId } from '../model/Ids.js';
import { LocalDate } from '../model/LocalDate.js';
import type { CampaignRepositoryPort } from '../ports/CampaignRepositoryPort.js';
import type { ClockPort } from '../ports/ClockPort.js';

export interface CloseCampaignDependencies {
  readonly campaigns: CampaignRepositoryPort;
  readonly clock: ClockPort;
}

export interface CloseCampaignInput {
  readonly campaignId: CampaignId;
  /** The harvest day. Defaults to today, which is the common case. */
  readonly closedOn?: LocalDate;
}

/** Closes a crop cycle. The campaign's history stops growing from here. */
export function closeCampaignUseCase(deps: CloseCampaignDependencies) {
  return async function execute(input: CloseCampaignInput): Promise<Campaign> {
    const campaign = await deps.campaigns.findById(input.campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(input.campaignId);
    }

    const closedAt = deps.clock.now();
    const closed = closeCampaign(campaign, {
      closedOn: input.closedOn ?? LocalDate.fromEpochMillis(closedAt),
      closedAt,
    });

    await deps.campaigns.save(closed);
    return closed;
  };
}
