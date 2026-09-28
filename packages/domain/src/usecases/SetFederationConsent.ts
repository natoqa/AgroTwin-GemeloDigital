import type { FederationConsent } from '../learning/Federation.js';
import type { FederationDependencies } from './federationDependencies.js';

/** Grants, narrows or revokes consent. Takes effect for the next action. */
export function setFederationConsentUseCase(deps: Pick<FederationDependencies, 'settings'>) {
  return (consent: FederationConsent): Promise<void> => deps.settings.setConsent(consent);
}

