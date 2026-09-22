import { DomainError } from './DomainError.js';

/**
 * Raised when a plot is asked to start a second campaign while one is open.
 *
 * One plot grows one crop cycle at a time. Allowing two open campaigns would
 * make "the state of the plot" ambiguous, and the twin is defined as the state
 * of *the plot*, not of a spreadsheet row.
 */
export class ActiveCampaignAlreadyExistsError extends DomainError {
  readonly code = 'ACTIVE_CAMPAIGN_ALREADY_EXISTS';

  constructor(
    readonly plotId: string,
    readonly activeCampaignId: string,
  ) {
    super(`Plot ${plotId} already has an open campaign (${activeCampaignId})`);
  }
}
