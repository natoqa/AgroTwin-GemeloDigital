import { DomainError } from './DomainError.js';

/** Raised when a campaign's planting or closing date cannot be real. */
export class InvalidCampaignDatesError extends DomainError {
  readonly code = 'INVALID_CAMPAIGN_DATES';

  constructor(reason: string) {
    super(`Not a valid pair of campaign dates: ${reason}`);
  }
}
