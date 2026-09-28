import { FederationPackageError } from '../errors/FederationPackageError.js';
import { ModelUnavailableError } from '../errors/ModelUnavailableError.js';
import { addGaussianNoise, clip, flatten, l2Norm, subtract } from '../learning/Delta.js';
import { DEFAULT_FEDERATION, toLabeledEmbedding } from '../learning/Federation.js';
import { DELTA_MAGIC, PACKAGE_FORMAT_VERSION, encodePackage, signedBytesFor } from '../learning/FederationPackage.js';
import type { DeltaHeader } from '../learning/FederationPackage.js';
import { DEFAULT_TRAINING, accuracy, splitHoldout, trainHead } from '../learning/Training.js';
import type { FederationDependencies } from './federationDependencies.js';
import { randomHex } from './federationDependencies.js';

export interface Contribution {
  readonly bytes: Uint8Array;
  readonly header: DeltaHeader;
  /** L2 norm of the raw delta, before clipping and noise. */
  readonly rawNorm: number;
  readonly holdoutAccuracyBefore?: number;
  readonly holdoutAccuracyAfter?: number;
}

/**
 * Trains the head locally on the farmer's labels and packages the change as
 * a signed `.agrotwin-delta`: clipped, with Gaussian noise, and carrying no
 * photograph, embedding, label or location.
 */
export function prepareContributionUseCase(deps: FederationDependencies) {
  return async function execute(): Promise<Contribution> {
    const settings = deps.federation ?? DEFAULT_FEDERATION;
    if ((await deps.settings.getConsent()) !== 'share_and_receive') {
      throw new FederationPackageError('the farmer has not agreed to share');
    }
    const current = await deps.model.current();
    if (!current) throw new ModelUnavailableError('it has not been downloaded to this device');

    const examples = (await deps.examples.listByBackbone(current.contract.version)).map(
      toLabeledEmbedding,
    );
    const { train, holdout } = splitHoldout(examples);
    if (train.length < settings.minimumExamples) {
      throw new FederationPackageError(
        `there are ${train.length} training examples and at least ${settings.minimumExamples} are needed`,
      );
    }

    const trained = trainHead(current.head, train, deps.training ?? DEFAULT_TRAINING, deps.random);
    const raw = subtract(flatten(trained), flatten(current.head));
    const protectedDelta = addGaussianNoise(clip(raw, settings.clipNorm), settings.noiseSigma, deps.random);

    const signer = await deps.signer.createEphemeralSigner();
    const header: DeltaHeader = {
      format: 'agrotwin-delta',
      formatVersion: PACKAGE_FORMAT_VERSION,
      backboneVersion: current.contract.version,
      baseHeadVersion: current.headVersion,
      parameterCount: protectedDelta.length,
      sampleCount: train.length,
      clipNorm: settings.clipNorm,
      noiseSigma: settings.noiseSigma,
      createdAt: deps.clock.now(),
      ephemeralId: randomHex(deps.random, 16),
      publicKey: signer.publicKey,
    };
    const signature = await signer.sign(signedBytesFor(DELTA_MAGIC, header, protectedDelta));
    const before = accuracy(current.head, holdout);
    const after = accuracy(trained, holdout);

    return {
      bytes: encodePackage(DELTA_MAGIC, header, protectedDelta, signature),
      header,
      rawNorm: l2Norm(raw),
      ...(before === undefined ? {} : { holdoutAccuracyBefore: before }),
      ...(after === undefined ? {} : { holdoutAccuracyAfter: after }),
    };
  };
}
