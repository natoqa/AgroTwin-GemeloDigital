import { InvalidModelContractError } from '../errors/InvalidModelContractError.js';
import type { RandomPort } from '../ports/RandomPort.js';
import { LinearHead } from './LinearHead.js';

/**
 * What a phone shares: the change it made to the head, never its photos,
 * embeddings or labels (CLAUDE.md §3, §11).
 *
 * The parameters are flattened in one fixed order — every weight row by row,
 * then the biases — so a delta is a single Float32 vector the hub can average
 * without knowing anything about classes.
 */
export function flatten(head: LinearHead): Float32Array {
  const flat = new Float32Array(head.weights.length + head.bias.length);
  flat.set(head.weights, 0);
  flat.set(head.bias, head.weights.length);
  return flat;
}

export function unflatten(like: LinearHead, flat: Float32Array): LinearHead {
  const size = like.weights.length + like.bias.length;
  if (flat.length !== size) {
    throw new InvalidModelContractError(`expected ${size} parameters, got ${flat.length}`);
  }
  const dimension = like.embeddingDimension;
  const rows = like.classes.map((_, row) =>
    Array.from(flat.subarray(row * dimension, (row + 1) * dimension)),
  );
  return LinearHead.of(like.classes, rows, Array.from(flat.subarray(like.weights.length)));
}

export function subtract(after: Float32Array, before: Float32Array): Float32Array {
  if (after.length !== before.length) throw new InvalidModelContractError('size mismatch');
  return after.map((value, index) => value - (before[index] ?? 0));
}

export function add(base: Float32Array, delta: Float32Array): Float32Array {
  if (base.length !== delta.length) throw new InvalidModelContractError('size mismatch');
  return base.map((value, index) => value + (delta[index] ?? 0));
}

export function l2Norm(vector: Float32Array): number {
  let sum = 0;
  for (const value of vector) sum += value * value;
  return Math.sqrt(sum);
}

/**
 * Norm clipping: a delta longer than `maxNorm` is scaled down to it.
 *
 * This bounds how much any one phone can move the shared model, which is the
 * defence against a poisoned contribution and the premise of the Gaussian
 * mechanism below.
 */
export function clip(delta: Float32Array, maxNorm: number): Float32Array {
  const norm = l2Norm(delta);
  if (norm <= maxNorm || norm === 0) return Float32Array.from(delta);
  const scale = maxNorm / norm;
  return delta.map((value) => value * scale);
}

/**
 * Adds independent Gaussian noise of standard deviation `sigma` to each
 * parameter (Box–Muller from the RandomPort).
 *
 * `sigma` is written in the package so the hub and the report know it. No
 * formal ε is claimed here; it is computed, if at all, by an accountant in
 * Python (CLAUDE.md §11).
 */
export function addGaussianNoise(
  delta: Float32Array,
  sigma: number,
  random: RandomPort,
): Float32Array {
  if (sigma <= 0) return Float32Array.from(delta);
  const noisy = new Float32Array(delta.length);
  for (let index = 0; index < delta.length; index += 2) {
    // 1 - next() is in (0, 1], so the logarithm is finite.
    const radius = Math.sqrt(-2 * Math.log(1 - random.next()));
    const angle = 2 * Math.PI * random.next();
    noisy[index] = (delta[index] ?? 0) + sigma * radius * Math.cos(angle);
    if (index + 1 < delta.length) {
      noisy[index + 1] = (delta[index + 1] ?? 0) + sigma * radius * Math.sin(angle);
    }
  }
  return noisy;
}
