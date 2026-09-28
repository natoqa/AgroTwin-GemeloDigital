import type { EpochMillis } from '../model/EpochMillis.js';
import type { ObservationId } from '../model/Ids.js';
import type { LinearHead } from './LinearHead.js';
import type { ModelClass, ModelContract } from './ModelContract.js';
import type { LabeledEmbedding } from './Training.js';

/**
 * The state of federated learning on one phone (CLAUDE.md §11).
 */

/**
 * Explicit and revocable. `receive_only` accepts aggregated models and never
 * sends anything; `off` does neither. The default is `off`: nothing is shared
 * until the farmer says so.
 */
export const FEDERATION_CONSENTS = ['off', 'receive_only', 'share_and_receive'] as const;
export type FederationConsent = (typeof FEDERATION_CONSENTS)[number];

/** A photograph the farmer confirmed or corrected, as the head sees it. */
export interface TrainingExample {
  readonly observationId: ObservationId;
  readonly label: ModelClass;
  /** The backbone's embedding of the original photograph. */
  readonly embedding: Float32Array;
  /** Embeddings from another backbone are meaningless to this head. */
  readonly backboneVersion: string;
  readonly labeledAt: EpochMillis;
}

export const toLabeledEmbedding = (example: TrainingExample): LabeledEmbedding => ({
  id: example.observationId,
  embedding: example.embedding,
  label: example.label,
});

/** The model the phone is running now: the shipped head, or an accepted one. */
export interface CurrentModel {
  readonly contract: ModelContract;
  readonly head: LinearHead;
  /** The contract's version for the shipped head; the aggregate's afterwards. */
  readonly headVersion: string;
}

/**
 * Settings of this federation, stated as numbers rather than buried in code.
 *
 * `noiseSigma` is deliberately small so the three-browser demo can show an
 * aggregate being **accepted**; at this level the Gaussian noise gives no
 * meaningful formal privacy guarantee, and the documentation says so. The
 * mechanism is in place; the calibration of σ against an ε budget is not.
 */
export interface FederationSettings {
  readonly clipNorm: number;
  readonly noiseSigma: number;
  /** Fewer training examples than this, and there is nothing worth sharing. */
  readonly minimumExamples: number;
  /** An aggregate may lose at most this much holdout accuracy. */
  readonly maxHoldoutDrop: number;
}

export const DEFAULT_FEDERATION: FederationSettings = {
  clipNorm: 1,
  noiseSigma: 0.01,
  minimumExamples: 4,
  maxHoldoutDrop: 0.05,
};
