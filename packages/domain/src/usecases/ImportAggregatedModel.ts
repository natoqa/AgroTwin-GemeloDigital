import { ModelUnavailableError } from '../errors/ModelUnavailableError.js';
import { unflatten } from '../learning/Delta.js';
import { DEFAULT_FEDERATION, toLabeledEmbedding } from '../learning/Federation.js';
import { decodeModelPackage } from '../learning/FederationPackage.js';
import { accuracy, splitHoldout } from '../learning/Training.js';
import type { FederationDependencies } from './federationDependencies.js';

export type ImportVerdict =
  | {
      readonly accepted: true;
      readonly headVersion: string;
      readonly holdoutBefore: number;
      readonly holdoutAfter: number;
    }
  | {
      readonly accepted: false;
      readonly reason:
        | 'consent_off'
        | 'bad_signature'
        | 'untrusted_hub'
        | 'other_backbone'
        | 'other_base'
        | 'no_holdout'
        | 'holdout_dropped';
      readonly holdoutBefore?: number;
      readonly holdoutAfter?: number;
    };

/**
 * Judges an aggregated model from the hub, which is a possible adversary, not
 * an authority (CLAUDE.md §11). In order: consent, signature, the hub's key
 * (trusted on first use), the backbone and base it was built for, and — the
 * decisive test — the phone's own holdout, which it must not degrade by more
 * than `maxHoldoutDrop`. With no holdout there is nothing to test against,
 * and the answer is no.
 */
export function importAggregatedModelUseCase(deps: FederationDependencies) {
  return async function execute(bytes: Uint8Array): Promise<ImportVerdict> {
    const settings = deps.federation ?? DEFAULT_FEDERATION;
    if ((await deps.settings.getConsent()) === 'off') {
      return { accepted: false, reason: 'consent_off' };
    }
    const current = await deps.model.current();
    if (!current) throw new ModelUnavailableError('it has not been downloaded to this device');

    const parts = decodeModelPackage(bytes);
    if (!(await deps.signer.verify(parts.signedBytes, parts.signature, parts.header.publicKey))) {
      return { accepted: false, reason: 'bad_signature' };
    }
    const trustedKey = await deps.settings.getTrustedHubKey();
    if (trustedKey !== undefined && trustedKey !== parts.header.publicKey) {
      return { accepted: false, reason: 'untrusted_hub' };
    }
    if (parts.header.backboneVersion !== current.contract.version) {
      return { accepted: false, reason: 'other_backbone' };
    }
    if (parts.header.baseHeadVersion !== current.headVersion) {
      return { accepted: false, reason: 'other_base' };
    }

    const candidate = unflatten(current.head, parts.body);
    const examples = (await deps.examples.listByBackbone(current.contract.version)).map(
      toLabeledEmbedding,
    );
    const { holdout } = splitHoldout(examples);
    const before = accuracy(current.head, holdout);
    const after = accuracy(candidate, holdout);
    if (before === undefined || after === undefined) {
      return { accepted: false, reason: 'no_holdout' };
    }
    if (after < before - settings.maxHoldoutDrop) {
      return { accepted: false, reason: 'holdout_dropped', holdoutBefore: before, holdoutAfter: after };
    }

    if (trustedKey === undefined) await deps.settings.setTrustedHubKey(parts.header.publicKey);
    await deps.model.adoptHead(candidate, parts.header.headVersion);
    return {
      accepted: true,
      headVersion: parts.header.headVersion,
      holdoutBefore: before,
      holdoutAfter: after,
    };
  };
}
