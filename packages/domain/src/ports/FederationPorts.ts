import type { CurrentModel, FederationConsent, TrainingExample } from '../learning/Federation.js';
import type { LinearHead } from '../learning/LinearHead.js';

export interface TrainingExampleRepositoryPort {
  /** One example per observation: relabelling replaces the earlier label. */
  save(example: TrainingExample): Promise<void>;
  listByBackbone(backboneVersion: string): Promise<readonly TrainingExample[]>;
  deleteAll(): Promise<void>;
}

export interface FederationSettingsPort {
  getConsent(): Promise<FederationConsent>;
  setConsent(consent: FederationConsent): Promise<void>;
  /** The hub key seen first; later models must be signed by the same key. */
  getTrustedHubKey(): Promise<string | undefined>;
  setTrustedHubKey(publicKey: string): Promise<void>;
}

/**
 * The model in use, and the only way to change it.
 *
 * Infrastructure implements it over the downloaded model and the heads the
 * phone accepted; adopting a head also restarts the classifier, so the next
 * photograph is diagnosed with it.
 */
export interface CurrentModelPort {
  current(): Promise<CurrentModel | undefined>;
  adoptHead(head: LinearHead, headVersion: string): Promise<void>;
}
