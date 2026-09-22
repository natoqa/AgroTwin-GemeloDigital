import { DomainError } from './DomainError.js';

/** Raised when an operation names a campaign that is not stored. */
export class CampaignNotFoundError extends DomainError {
  readonly code = 'CAMPAIGN_NOT_FOUND';

  constructor(readonly campaignId: string) {
    super(`No campaign is stored with id ${campaignId}`);
  }
}
