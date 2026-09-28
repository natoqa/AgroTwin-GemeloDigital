import { InvalidModelContractError } from '../errors/InvalidModelContractError.js';
import type { ModelClass, ModelContract } from './ModelContract.js';

/**
 * The classifier head of ADR-0005: one linear layer, float32.
 *
 * `logits = W · embedding + b`, with W stored row-major, one row per class.
 * Products are accumulated in double precision and rounded to float32 once
 * per output, which keeps the result within the parity tolerance of PyTorch's
 * float32 matmul (1e-4, CLAUDE.md §15) without depending on summation order.
 *
 * Kept in the domain, and immutable, because Phase 6 trains it here: a
 * training step produces a new head rather than mutating this one.
 */
export class LinearHead {
  private constructor(
    readonly classes: readonly ModelClass[],
    readonly embeddingDimension: number,
    /** Row-major, `classes.length × embeddingDimension`. */
    readonly weights: Float32Array,
    readonly bias: Float32Array,
  ) {}

  static of(
    classes: readonly ModelClass[],
    weights: readonly (readonly number[])[],
    bias: readonly number[],
  ): LinearHead {
    const dimension = weights[0]?.length ?? 0;
    if (dimension === 0 || weights.length !== classes.length || bias.length !== classes.length) {
      throw new InvalidModelContractError('the head does not have one row and one bias per class');
    }
    const flat = new Float32Array(classes.length * dimension);
    weights.forEach((row, index) => {
      if (row.length !== dimension || row.some((value) => !Number.isFinite(value))) {
        throw new InvalidModelContractError(`head row ${index} is malformed`);
      }
      flat.set(row, index * dimension);
    });
    if (bias.some((value) => !Number.isFinite(value))) {
      throw new InvalidModelContractError('the head bias is malformed');
    }
    return new LinearHead(classes, dimension, flat, Float32Array.from(bias));
  }

  /** Reads `head.json` and checks it against the contract it ships with. */
  static fromDocument(value: unknown, contract: ModelContract): LinearHead {
    if (typeof value !== 'object' || value === null) {
      throw new InvalidModelContractError('the head is not an object');
    }
    const document = value as Record<string, unknown>;
    if (document['format'] !== 'agrotwin-head' || document['formatVersion'] !== 1) {
      throw new InvalidModelContractError('the head is not an agrotwin-head version 1 document');
    }
    const classes = document['classes'];
    if (
      !Array.isArray(classes) ||
      classes.length !== contract.classes.length ||
      classes.some((entry, index) => entry !== contract.classes[index])
    ) {
      throw new InvalidModelContractError('the head classes differ from the contract');
    }
    if (document['embeddingDimension'] !== contract.embeddingDimension) {
      throw new InvalidModelContractError('the head dimension differs from the contract');
    }
    const weights = document['weights'];
    const bias = document['bias'];
    if (!Array.isArray(weights) || !Array.isArray(bias)) {
      throw new InvalidModelContractError('the head has no weights or bias');
    }
    const head = LinearHead.of(
      contract.classes,
      weights as readonly (readonly number[])[],
      bias as readonly number[],
    );
    if (head.embeddingDimension !== contract.embeddingDimension) {
      throw new InvalidModelContractError('the head rows do not match the embedding dimension');
    }
    return head;
  }

  logits(embedding: Float32Array): Float32Array {
    if (embedding.length !== this.embeddingDimension) {
      throw new InvalidModelContractError(
        `the embedding has ${embedding.length} values and the head expects ${this.embeddingDimension}`,
      );
    }
    const out = new Float32Array(this.classes.length);
    for (let row = 0; row < this.classes.length; row += 1) {
      let sum = this.bias[row] ?? 0;
      const offset = row * this.embeddingDimension;
      for (let column = 0; column < this.embeddingDimension; column += 1) {
        sum += (this.weights[offset + column] ?? 0) * (embedding[column] ?? 0);
      }
      out[row] = Math.fround(sum);
    }
    return out;
  }
}

/** Softmax with a temperature, numerically stable. */
export function softmax(logits: Float32Array, temperature = 1): number[] {
  const scaled = Array.from(logits, (value) => value / temperature);
  const top = Math.max(...scaled);
  const exps = scaled.map((value) => Math.exp(value - top));
  const total = exps.reduce((sum, value) => sum + value, 0);
  return exps.map((value) => value / total);
}
