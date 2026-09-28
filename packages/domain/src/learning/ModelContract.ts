import { InvalidModelContractError } from '../errors/InvalidModelContractError.js';
import type { DiagnosisClass } from '../model/Diagnosis.js';

/**
 * The model contract of CLAUDE.md §10, as the client reads it.
 *
 * `ml/pipeline` writes `model-contract.json` next to the artifacts. The client
 * validates it before loading anything, and the artifacts against it after
 * loading them. Every number the phone needs to reproduce the pipeline's
 * preprocessing and decisions comes from here — none is copied into code.
 */
export const MODEL_CONTRACT_FORMAT = 'agrotwin-model-contract';
export const MODEL_CONTRACT_FORMAT_VERSION = 1;

/** The classes a model may output. `rejected` is a decision, not an output. */
export type ModelClass = Exclude<DiagnosisClass, 'rejected'>;
const MODEL_CLASSES: readonly ModelClass[] = ['healthy', 'early_blight', 'late_blight'];

export interface ArtifactReference {
  readonly file: string;
  /** Lowercase hex SHA-256 of the file. */
  readonly sha256: string;
  readonly bytes: number;
}

export interface ModelInputSpec {
  readonly name: string;
  readonly height: number;
  readonly width: number;
  /** Shorter side is resized to this before the centred crop. */
  readonly resizeShorterSide: number;
  readonly mean: readonly [number, number, number];
  readonly std: readonly [number, number, number];
}

export interface ModelContract {
  readonly version: string;
  readonly backbone: ArtifactReference;
  readonly head: ArtifactReference;
  readonly input: ModelInputSpec;
  readonly outputName: string;
  readonly embeddingDimension: number;
  /** The order of the head's outputs. */
  readonly classes: readonly ModelClass[];
  /** Softmax temperature from calibration. Positive. */
  readonly temperature: number;
  /** Below this top probability the answer is `rejected`. In (0, 1). */
  readonly rejectionThreshold: number;
}

/** Validates the parsed JSON of `model-contract.json`. */
export function parseModelContract(value: unknown): ModelContract {
  const root = record(value, 'the contract');
  if (root['format'] !== MODEL_CONTRACT_FORMAT) {
    throw new InvalidModelContractError(`it is not an ${MODEL_CONTRACT_FORMAT} document`);
  }
  if (root['formatVersion'] !== MODEL_CONTRACT_FORMAT_VERSION) {
    throw new InvalidModelContractError(
      `it uses format version ${String(root['formatVersion'])}, and this app reads version ${MODEL_CONTRACT_FORMAT_VERSION}`,
    );
  }

  const artifacts = record(root['artifacts'], 'artifacts');
  const input = record(root['input'], 'input');
  const output = record(root['output'], 'output');

  if (input['layout'] !== 'NCHW' || input['channels'] !== 3 || input['colorSpace'] !== 'RGB') {
    throw new InvalidModelContractError('the input is not 3-channel RGB in NCHW layout');
  }
  if (input['crop'] !== 'center' || input['scale'] !== '0-1') {
    throw new InvalidModelContractError('the preprocessing is not the one this app implements');
  }

  const classes = list(root['classes'], 'classes').map((entry, index) => {
    if (typeof entry !== 'string' || !(MODEL_CLASSES as readonly string[]).includes(entry)) {
      throw new InvalidModelContractError(`classes[${index}] is not a class this app knows`);
    }
    return entry as ModelClass;
  });
  if (classes.length !== MODEL_CLASSES.length || new Set(classes).size !== classes.length) {
    throw new InvalidModelContractError('the classes are not exactly healthy, early and late blight');
  }

  const temperature = number(root['temperature'], 'temperature');
  if (temperature <= 0) throw new InvalidModelContractError('temperature must be positive');
  const rejectionThreshold = number(root['rejectionThreshold'], 'rejectionThreshold');
  if (rejectionThreshold <= 0 || rejectionThreshold >= 1) {
    throw new InvalidModelContractError('rejectionThreshold must be between 0 and 1');
  }

  return {
    version: text(root['version'], 'version'),
    backbone: artifact(artifacts['backbone'], 'artifacts.backbone'),
    head: artifact(artifacts['head'], 'artifacts.head'),
    input: {
      name: text(input['name'], 'input.name'),
      height: positiveInteger(input['height'], 'input.height'),
      width: positiveInteger(input['width'], 'input.width'),
      resizeShorterSide: positiveInteger(input['resizeShorterSide'], 'input.resizeShorterSide'),
      mean: triple(input['mean'], 'input.mean'),
      std: triple(input['std'], 'input.std'),
    },
    outputName: text(output['name'], 'output.name'),
    embeddingDimension: positiveInteger(output['embeddingDimension'], 'output.embeddingDimension'),
    classes,
    temperature,
    rejectionThreshold,
  };
}

function artifact(value: unknown, path: string): ArtifactReference {
  const entry = record(value, path);
  const sha256 = text(entry['sha256'], `${path}.sha256`);
  if (!/^[0-9a-f]{64}$/u.test(sha256)) {
    throw new InvalidModelContractError(`${path}.sha256 is not a SHA-256 in lowercase hex`);
  }
  const file = text(entry['file'], `${path}.file`);
  if (!/^[A-Za-z0-9._-]+$/u.test(file)) {
    throw new InvalidModelContractError(`${path}.file is not a plain file name`);
  }
  return { file, sha256, bytes: positiveInteger(entry['bytes'], `${path}.bytes`) };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidModelContractError(`${path} is not an object`);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new InvalidModelContractError(`${path} is not a list`);
  return value as readonly unknown[];
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidModelContractError(`${path} is not text`);
  }
  return value;
}

function number(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidModelContractError(`${path} is not a number`);
  }
  return value;
}

function positiveInteger(value: unknown, path: string): number {
  const result = number(value, path);
  if (!Number.isInteger(result) || result <= 0) {
    throw new InvalidModelContractError(`${path} is not a positive integer`);
  }
  return result;
}

function triple(value: unknown, path: string): readonly [number, number, number] {
  const items = list(value, path).map((item, index) => number(item, `${path}[${index}]`));
  const [a, b, c] = items;
  if (items.length !== 3 || a === undefined || b === undefined || c === undefined) {
    throw new InvalidModelContractError(`${path} does not have three values`);
  }
  return [a, b, c];
}
