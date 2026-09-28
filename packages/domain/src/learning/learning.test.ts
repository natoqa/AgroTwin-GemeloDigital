import { describe, expect, it } from 'vitest';
import parity from './fixtures/head-parity.json' with { type: 'json' };
import { InvalidModelContractError } from '../errors/InvalidModelContractError.js';
import type { EmbeddingPort } from '../ports/EmbeddingPort.js';
import { HeadClassifier } from './HeadClassifier.js';
import { LinearHead, softmax } from './LinearHead.js';
import { parseModelContract } from './ModelContract.js';
import type { ModelContract } from './ModelContract.js';

const SHA = 'a'.repeat(64);

const contractDocument = (overrides: Record<string, unknown> = {}) => ({
  format: 'agrotwin-model-contract',
  formatVersion: 1,
  version: 'test-model',
  artifacts: {
    backbone: { file: 'backbone.int8.onnx', sha256: SHA, bytes: 1000 },
    head: { file: 'head.json', sha256: SHA, bytes: 100 },
  },
  input: {
    name: 'image',
    layout: 'NCHW',
    channels: 3,
    height: 224,
    width: 224,
    resizeShorterSide: 256,
    crop: 'center',
    colorSpace: 'RGB',
    scale: '0-1',
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
  },
  output: { name: 'embedding', embeddingDimension: 2 },
  classes: ['healthy', 'early_blight', 'late_blight'],
  temperature: 1,
  rejectionThreshold: 0.6,
  ...overrides,
});

describe('parseModelContract', () => {
  it('reads a well-formed contract', () => {
    const contract = parseModelContract(contractDocument());

    expect(contract.version).toBe('test-model');
    expect(contract.classes).toEqual(['healthy', 'early_blight', 'late_blight']);
    expect(contract.input.mean).toEqual([0.485, 0.456, 0.406]);
    expect(contract.backbone.file).toBe('backbone.int8.onnx');
  });

  it.each([
    ['another format', { format: 'something' }],
    ['a newer version', { formatVersion: 2 }],
    ['an unknown class', { classes: ['healthy', 'early_blight', 'rust'] }],
    ['a missing class', { classes: ['healthy', 'early_blight'] }],
    ['a repeated class', { classes: ['healthy', 'healthy', 'late_blight'] }],
    ['a zero temperature', { temperature: 0 }],
    ['a threshold of one', { rejectionThreshold: 1 }],
    ['a threshold that is not a number', { rejectionThreshold: 'high' }],
    ['no artifacts', { artifacts: [] }],
    [
      'a hash that is not SHA-256',
      { artifacts: { backbone: { file: 'b.onnx', sha256: 'abc', bytes: 1 }, head: { file: 'h.json', sha256: SHA, bytes: 1 } } },
    ],
    [
      'a file name with a path',
      { artifacts: { backbone: { file: '../b.onnx', sha256: SHA, bytes: 1 }, head: { file: 'h.json', sha256: SHA, bytes: 1 } } },
    ],
    ['preprocessing it does not implement', { input: { ...contractDocument().input, crop: 'random' } }],
    ['a layout it does not implement', { input: { ...contractDocument().input, layout: 'NHWC' } }],
    ['a two-value mean', { input: { ...contractDocument().input, mean: [0.4, 0.4] } }],
    ['a fractional size', { input: { ...contractDocument().input, height: 22.4 } }],
    ['no version', { version: '' }],
    ['no output', { output: null }],
  ])('refuses %s', (_, overrides) => {
    expect(() => parseModelContract(contractDocument(overrides))).toThrow(InvalidModelContractError);
  });

  it('refuses something that is not an object at all', () => {
    expect(() => parseModelContract(null)).toThrow(InvalidModelContractError);
    expect(() => parseModelContract({ ...contractDocument(), classes: 'healthy' })).toThrow(
      InvalidModelContractError,
    );
  });
});

describe('LinearHead', () => {
  const contract = parseModelContract(contractDocument());
  const headDocument = (overrides: Record<string, unknown> = {}) => ({
    format: 'agrotwin-head',
    formatVersion: 1,
    classes: ['healthy', 'early_blight', 'late_blight'],
    embeddingDimension: 2,
    weights: [
      [1, 0],
      [0, 1],
      [-1, -1],
    ],
    bias: [0, 0.5, 0],
    ...overrides,
  });

  it('computes W·x + b, one logit per class', () => {
    const head = LinearHead.fromDocument(headDocument(), contract);

    expect(Array.from(head.logits(Float32Array.of(2, 3)))).toEqual([2, 3.5, -5]);
  });

  it.each([
    ['another format', { format: 'x' }],
    ['classes in another order', { classes: ['early_blight', 'healthy', 'late_blight'] }],
    ['another dimension', { embeddingDimension: 3 }],
    ['a short row', { weights: [[1], [0, 1], [1, 1]] }],
    ['a missing row', { weights: [[1, 0], [0, 1]] }],
    ['a value that is not finite', { bias: [0, Number.NaN, 0] }],
    ['no weights', { weights: undefined }],
  ])('refuses a head with %s', (_, overrides) => {
    expect(() => LinearHead.fromDocument(headDocument(overrides), contract)).toThrow(
      InvalidModelContractError,
    );
  });

  it('refuses a head that is not an object, and an embedding of the wrong size', () => {
    expect(() => LinearHead.fromDocument('head', contract)).toThrow(InvalidModelContractError);
    const head = LinearHead.fromDocument(headDocument(), contract);
    expect(() => head.logits(Float32Array.of(1, 2, 3))).toThrow(/expects 2/u);
  });

  it('turns logits into probabilities, flattened by a higher temperature', () => {
    const logits = Float32Array.of(2, 1, 0);
    const sharp = softmax(logits);
    const flat = softmax(logits, 4);

    expect(sharp.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(flat[0]).toBeLessThan(sharp[0] ?? 0);
  });
});

/**
 * The Phase 5 DoD: the TypeScript head and the PyTorch head give the same
 * logits, within 1e-4, on embeddings from the real INT8 backbone. The fixture
 * is written by `ml/pipeline` from the trained model; it is not hand-made.
 */
describe('parity with PyTorch', () => {
  const contract: ModelContract = {
    ...parseModelContract(contractDocument()),
    embeddingDimension: parity.head.weights[0]?.length ?? 0,
  };
  const head = LinearHead.of(contract.classes, parity.head.weights, parity.head.bias);

  it(`matches every fixture case within ${parity.tolerance}`, () => {
    expect(parity.cases.length).toBeGreaterThanOrEqual(8);
    let worst = 0;
    for (const testCase of parity.cases) {
      const logits = head.logits(Float32Array.from(testCase.embedding));
      testCase.logits.forEach((expected, index) => {
        worst = Math.max(worst, Math.abs((logits[index] ?? Number.NaN) - expected));
      });
    }
    expect(worst).toBeLessThanOrEqual(parity.tolerance);
  });
});

describe('HeadClassifier', () => {
  const contract = parseModelContract(contractDocument({ rejectionThreshold: 0.6 }));
  const head = LinearHead.of(
    contract.classes,
    [
      [1, 0],
      [0, 1],
      [0, 0],
    ],
    [0, 0, 0],
  );
  const embedder = (embedding: number[]): EmbeddingPort => ({
    embed: async () => Float32Array.from(embedding),
  });

  it('names the most likely class when it is sure enough', async () => {
    const diagnosis = await new HeadClassifier(embedder([0, 6]), head, contract).diagnose(
      new ArrayBuffer(1),
    );

    expect(diagnosis.class).toBe('early_blight');
    expect(diagnosis.confidence).toBeGreaterThan(0.6);
    expect(diagnosis.modelVersion).toBe('test-model');
  });

  it('refuses to guess below the calibrated threshold', async () => {
    // Nearly equal logits: about a third each.
    const diagnosis = await new HeadClassifier(embedder([0.1, 0]), head, contract).diagnose(
      new ArrayBuffer(1),
    );

    expect(diagnosis.class).toBe('rejected');
    expect(diagnosis.confidence).toBeLessThan(0.6);
  });

  it('uses the calibrated temperature', () => {
    const hot = parseModelContract(contractDocument({ temperature: 10 }));
    const cold = new HeadClassifier(embedder([]), head, contract).classify(Float32Array.of(3, 0));
    const warm = new HeadClassifier(embedder([]), head, hot).classify(Float32Array.of(3, 0));

    expect(warm.confidence).toBeLessThan(cold.confidence);
    expect(warm.class).toBe('rejected');
  });
});
