import { DomainError } from './DomainError.js';

/**
 * Raised when an operation needs an open campaign and the campaign is closed.
 *
 * Closing a campaign is what freezes its history: once the harvest is in, no
 * new observation belongs to it, and it cannot be closed a second time.
 */
export class CampaignNotActiveError extends DomainError {
  readonly code = 'CAMPAIGN_NOT_ACTIVE';

  constructor(
    readonly campaignId: string,
    readonly operation: string,
  ) {
    super(`Campaign ${campaignId} is closed, so it cannot ${operation}`);
  }
}
