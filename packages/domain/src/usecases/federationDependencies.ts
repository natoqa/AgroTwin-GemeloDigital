import type { FederationSettings } from '../learning/Federation.js';
import type { TrainingOptions } from '../learning/Training.js';
import type { ClockPort } from '../ports/ClockPort.js';
import type { EmbeddingPort } from '../ports/EmbeddingPort.js';
import type {
  CurrentModelPort,
  FederationSettingsPort,
  TrainingExampleRepositoryPort,
} from '../ports/FederationPorts.js';
import type { ImageStorePort } from '../ports/ImageStorePort.js';
import type { ObservationRepositoryPort } from '../ports/ObservationRepositoryPort.js';
import type { RandomPort } from '../ports/RandomPort.js';
import type { SignerPort } from '../ports/SignerPort.js';

/**
 * What the federated-learning use cases (CLAUDE.md §11) draw on. One shape
 * for all of them, because they are one protocol: labelling feeds training,
 * training feeds the delta, and an aggregate is judged on the labels' holdout.
 */
export interface FederationDependencies {
  readonly observations: ObservationRepositoryPort;
  readonly images: ImageStorePort;
  readonly embedder: EmbeddingPort;
  readonly examples: TrainingExampleRepositoryPort;
  readonly settings: FederationSettingsPort;
  readonly model: CurrentModelPort;
  readonly signer: SignerPort;
  readonly random: RandomPort;
  readonly clock: ClockPort;
  readonly federation?: FederationSettings;
  readonly training?: TrainingOptions;
}

/** Random bytes as hex, for identifiers that must not link to a phone. */
export function randomHex(random: RandomPort, bytes: number): string {
  let text = '';
  for (let index = 0; index < bytes; index += 1) {
    text += Math.floor(random.next() * 256)
      .toString(16)
      .padStart(2, '0');
  }
  return text;
}
