import { DEFAULT_FEDERATION, toLabeledEmbedding } from '../learning/Federation.js';
import type { FederationConsent } from '../learning/Federation.js';
import { accuracy, splitHoldout } from '../learning/Training.js';
import type { FederationDependencies } from './federationDependencies.js';

export interface FederationStatus {
  readonly consent: FederationConsent;
  readonly headVersion?: string;
  readonly trainingExamples: number;
  readonly holdoutExamples: number;
  readonly minimumExamples: number;
  /** Holdout accuracy of the model in use, when there is a holdout. */
  readonly holdoutAccuracy?: number;
}

export function getFederationStatusUseCase(deps: FederationDependencies) {
  return async function execute(): Promise<FederationStatus> {
    const settings = deps.federation ?? DEFAULT_FEDERATION;
    const consent = await deps.settings.getConsent();
    const current = await deps.model.current();
    if (!current) {
      return {
        consent,
        trainingExamples: 0,
        holdoutExamples: 0,
        minimumExamples: settings.minimumExamples,
      };
    }
    const examples = await deps.examples.listByBackbone(current.contract.version);
    const { train, holdout } = splitHoldout(examples.map(toLabeledEmbedding));
    const holdoutAccuracy = accuracy(current.head, holdout);
    return {
      consent,
      headVersion: current.headVersion,
      trainingExamples: train.length,
      holdoutExamples: holdout.length,
      minimumExamples: settings.minimumExamples,
      ...(holdoutAccuracy === undefined ? {} : { holdoutAccuracy }),
    };
  };
}
