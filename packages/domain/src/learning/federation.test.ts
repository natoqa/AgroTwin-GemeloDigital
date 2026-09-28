import { describe, expect, it } from 'vitest';
import { FederationPackageError } from '../errors/FederationPackageError.js';
import { InvalidModelContractError } from '../errors/InvalidModelContractError.js';
import { seededRandom } from '../testing/federation.js';
import { addGaussianNoise, clip, flatten, l2Norm, subtract, unflatten } from './Delta.js';
import {
  DELTA_MAGIC,
  MODEL_MAGIC,
  decodeDeltaPackage,
  decodeModelPackage,
  encodePackage,
  signedBytesFor,
} from './FederationPackage.js';
import { LinearHead } from './LinearHead.js';
import type { ModelClass } from './ModelContract.js';
import { accuracy, isHoldout, splitHoldout, trainHead } from './Training.js';
import type { LabeledEmbedding } from './Training.js';

const CLASSES: readonly ModelClass[] = ['healthy', 'early_blight', 'late_blight'];
const zeroHead = () =>
  LinearHead.of(
    CLASSES,
    CLASSES.map(() => [0, 0, 0]),
    [0, 0, 0],
  );

/** Three well separated clusters, one per class, in three dimensions. */
function clusters(perClass: number, seed = 1): LabeledEmbedding[] {
  const random = seededRandom(seed);
  const out: LabeledEmbedding[] = [];
  CLASSES.forEach((label, index) => {
    for (let n = 0; n < perClass; n += 1) {
      const point = [0, 0, 0].map((_, axis) => (axis === index ? 2 : 0) + random.next() * 0.4);
      out.push({ id: `${label}-${n}`, embedding: Float32Array.from(point), label });
    }
  });
  return out;
}

const OPTIONS = { epochs: 30, batchSize: 4, learningRate: 0.2, l2: 1e-4 };

describe('trainHead', () => {
  it('learns separable classes from a zero head', () => {
    const data = clusters(8);
    const start = zeroHead();

    const trained = trainHead(start, data, OPTIONS, seededRandom(7));

    expect(accuracy(start, data)).toBeLessThan(0.5);
    expect(accuracy(trained, data)).toBe(1);
    // The head it started from is untouched: training returns a new one.
    expect(Array.from(start.weights).every((value) => value === 0)).toBe(true);
  });

  it('is deterministic for a given seed, and differs across seeds', () => {
    const data = clusters(6);
    const a = trainHead(zeroHead(), data, OPTIONS, seededRandom(3));
    const b = trainHead(zeroHead(), data, OPTIONS, seededRandom(3));
    const c = trainHead(zeroHead(), data, OPTIONS, seededRandom(4));

    expect(Array.from(a.weights)).toEqual(Array.from(b.weights));
    expect(Array.from(a.weights)).not.toEqual(Array.from(c.weights));
  });

  it('has no accuracy to report on no examples', () => {
    expect(accuracy(zeroHead(), [])).toBeUndefined();
  });
});

describe('the local holdout', () => {
  it('is stable by id and holds out about one example in four', () => {
    const ids = Array.from({ length: 400 }, (_, index) => `obs-${index}`);
    const held = ids.filter(isHoldout);

    expect(ids.filter(isHoldout)).toEqual(held);
    expect(held.length / ids.length).toBeGreaterThan(0.15);
    expect(held.length / ids.length).toBeLessThan(0.35);

    const { train, holdout } = splitHoldout(clusters(20));
    expect(train.length + holdout.length).toBe(60);
    expect(holdout.every((example) => isHoldout(example.id))).toBe(true);
  });
});

describe('deltas', () => {
  it('flattens and rebuilds a head exactly', () => {
    const head = trainHead(zeroHead(), clusters(4), OPTIONS, seededRandom(1));

    const rebuilt = unflatten(head, flatten(head));

    expect(Array.from(rebuilt.weights)).toEqual(Array.from(head.weights));
    expect(Array.from(rebuilt.bias)).toEqual(Array.from(head.bias));
    expect(() => unflatten(head, new Float32Array(3))).toThrow(InvalidModelContractError);
  });

  it('clips a long delta to the norm and leaves a short one alone', () => {
    const long = Float32Array.of(3, 4);
    const short = Float32Array.of(0.3, 0.4);

    expect(l2Norm(clip(long, 1))).toBeCloseTo(1, 6);
    expect(Array.from(clip(short, 1))).toEqual(Array.from(short));
    expect(Array.from(clip(new Float32Array(2), 1))).toEqual([0, 0]);
  });

  it('adds Gaussian noise of the stated standard deviation', () => {
    const zeros = new Float32Array(20_001);
    const noisy = addGaussianNoise(zeros, 0.5, seededRandom(11));
    const mean = noisy.reduce((sum, value) => sum + value, 0) / noisy.length;
    const variance = noisy.reduce((sum, value) => sum + (value - mean) ** 2, 0) / noisy.length;

    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.sqrt(variance)).toBeCloseTo(0.5, 1);
    expect(Array.from(addGaussianNoise(Float32Array.of(1), 0, seededRandom(1)))).toEqual([1]);
  });

  it('subtracts only vectors of the same size', () => {
    expect(Array.from(subtract(Float32Array.of(3, 2), Float32Array.of(1, 1)))).toEqual([2, 1]);
    expect(() => subtract(Float32Array.of(1), Float32Array.of(1, 2))).toThrow(
      InvalidModelContractError,
    );
  });
});

describe('federation packages', () => {
  const deltaHeader = {
    format: 'agrotwin-delta',
    formatVersion: 1,
    backboneVersion: 'bb-1',
    baseHeadVersion: 'bb-1',
    parameterCount: 3,
    sampleCount: 5,
    clipNorm: 1,
    noiseSigma: 0.01,
    createdAt: 1000,
    ephemeralId: 'abcd',
    publicKey: 'key',
  };
  const body = Float32Array.of(0.5, -0.25, 1e-7);

  it('round-trips a delta, and signs exactly what the file holds', () => {
    const bytes = encodePackage(DELTA_MAGIC, deltaHeader, body, 'sig');

    const parts = decodeDeltaPackage(bytes);

    expect(parts.header).toEqual(deltaHeader);
    expect(Array.from(parts.body)).toEqual(Array.from(body));
    expect(parts.signature).toBe('sig');
    expect(Array.from(parts.signedBytes)).toEqual(
      Array.from(signedBytesFor(DELTA_MAGIC, deltaHeader, body)),
    );
  });

  it('round-trips a model', () => {
    const header = {
      format: 'agrotwin-model',
      formatVersion: 1,
      backboneVersion: 'bb-1',
      baseHeadVersion: 'bb-1',
      headVersion: 'bb-1+fed1',
      parameterCount: 3,
      contributors: 3,
      totalSamples: 12,
      createdAt: 2000,
      publicKey: 'hub',
    };

    const parts = decodeModelPackage(encodePackage(MODEL_MAGIC, header, body, 'hubsig'));

    expect(parts.header.headVersion).toBe('bb-1+fed1');
    expect(parts.header.contributors).toBe(3);
  });

  it.each([
    ['the wrong magic', () => encodePackage(MODEL_MAGIC, deltaHeader, body, 's')],
    ['a truncated file', () => encodePackage(DELTA_MAGIC, deltaHeader, body, 's').subarray(0, 20)],
    ['a body shorter than promised', () => encodePackage(DELTA_MAGIC, deltaHeader, body.subarray(0, 2), 's')],
    ['a zero sample count', () => encodePackage(DELTA_MAGIC, { ...deltaHeader, sampleCount: 0 }, body, 's')],
    ['a negative clip norm', () => encodePackage(DELTA_MAGIC, { ...deltaHeader, clipNorm: -1 }, body, 's')],
    ['another format', () => encodePackage(DELTA_MAGIC, { ...deltaHeader, format: 'x' }, body, 's')],
    ['no public key', () => encodePackage(DELTA_MAGIC, { ...deltaHeader, publicKey: '' }, body, 's')],
    ['a value that is not finite', () => encodePackage(DELTA_MAGIC, deltaHeader, Float32Array.of(1, Number.NaN, 0), 's')],
  ])('refuses %s', (_, make) => {
    expect(() => decodeDeltaPackage(make())).toThrow(FederationPackageError);
  });

  it('refuses a header that is not JSON or not an object, and non-ASCII text', () => {
    const broken = encodePackage(DELTA_MAGIC, deltaHeader, body, 's');
    broken[8] = 0x7b; // '{' stays, then corrupt the next byte
    broken[9] = 0x7b;
    expect(() => decodeDeltaPackage(broken)).toThrow(/not JSON/u);

    const list = encodePackage(DELTA_MAGIC, [1], new Float32Array(0), 's');
    expect(() => decodeDeltaPackage(list)).toThrow(/not an object/u);

    expect(() => encodePackage(DELTA_MAGIC, { note: 'señal' }, body, 's')).toThrow(/ASCII/u);
  });
});
