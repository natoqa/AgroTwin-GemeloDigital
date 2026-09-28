export { add, addGaussianNoise, clip, flatten, l2Norm, subtract, unflatten } from './Delta.js';
export { DEFAULT_FEDERATION, FEDERATION_CONSENTS, toLabeledEmbedding } from './Federation.js';
export type {
  CurrentModel,
  FederationConsent,
  FederationSettings,
  TrainingExample,
} from './Federation.js';
export {
  DELTA_MAGIC,
  MODEL_MAGIC,
  PACKAGE_FORMAT_VERSION,
  decodeDeltaPackage,
  decodeModelPackage,
  encodePackage,
  signedBytesFor,
} from './FederationPackage.js';
export type { DeltaHeader, ModelHeader, PackageParts } from './FederationPackage.js';
export {
  DEFAULT_TRAINING,
  HOLDOUT_ONE_IN,
  accuracy,
  isHoldout,
  splitHoldout,
  trainHead,
} from './Training.js';
export type { LabeledEmbedding, TrainingOptions } from './Training.js';
export { HeadClassifier } from './HeadClassifier.js';
export { LinearHead, softmax } from './LinearHead.js';
export {
  MODEL_CONTRACT_FORMAT,
  MODEL_CONTRACT_FORMAT_VERSION,
  parseModelContract,
} from './ModelContract.js';
export type {
  ArtifactReference,
  ModelClass,
  ModelContract,
  ModelInputSpec,
} from './ModelContract.js';
