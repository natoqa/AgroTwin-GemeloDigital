import type { RandomPort } from '../ports/RandomPort.js';
import { LinearHead, softmax } from './LinearHead.js';
import type { ModelClass } from './ModelContract.js';

/**
 * Local training of the classifier head (CLAUDE.md §8.5, §11).
 *
 * Softmax regression on the backbone's embeddings, mini-batch SGD with L2
 * regularisation. The backbone never changes on the device (ADR-0005); this is
 * the whole of what the phone learns, and what it may share.
 *
 * Pure and deterministic given the RandomPort: the same examples and the same
 * seed give the same head, which is what makes it testable in Node.
 */

/** An example the farmer confirmed or corrected: the only kind trained on. */
export interface LabeledEmbedding {
  /** Stable identity, used to keep the holdout stable across sessions. */
  readonly id: string;
  readonly embedding: Float32Array;
  readonly label: ModelClass;
}

export interface TrainingOptions {
  readonly epochs: number;
  readonly batchSize: number;
  readonly learningRate: number;
  readonly l2: number;
}

export const DEFAULT_TRAINING: TrainingOptions = {
  epochs: 20,
  batchSize: 8,
  learningRate: 0.05,
  l2: 1e-4,
};

/**
 * One example in four is held out, chosen by a hash of its id — not by a
 * random draw — so an example that was once in the holdout is never trained
 * on in a later session (CLAUDE.md §11).
 */
export const HOLDOUT_ONE_IN = 4;

export function isHoldout(id: string): boolean {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % HOLDOUT_ONE_IN === 0;
}

export function splitHoldout(examples: readonly LabeledEmbedding[]): {
  train: LabeledEmbedding[];
  holdout: LabeledEmbedding[];
} {
  const train: LabeledEmbedding[] = [];
  const holdout: LabeledEmbedding[] = [];
  for (const example of examples) (isHoldout(example.id) ? holdout : train).push(example);
  return { train, holdout };
}

/** Returns a new head; the one passed in is not modified. */
export function trainHead(
  start: LinearHead,
  examples: readonly LabeledEmbedding[],
  options: TrainingOptions,
  random: RandomPort,
): LinearHead {
  const classes = start.classes;
  const dimension = start.embeddingDimension;
  const weights = Float64Array.from(start.weights);
  const bias = Float64Array.from(start.bias);
  const order = examples.map((_, index) => index);

  for (let epoch = 0; epoch < options.epochs; epoch += 1) {
    shuffle(order, random);
    for (let begin = 0; begin < order.length; begin += options.batchSize) {
      const batch = order.slice(begin, begin + options.batchSize);
      const gradWeights = new Float64Array(weights.length);
      const gradBias = new Float64Array(bias.length);

      for (const index of batch) {
        const example = examples[index];
        if (!example) continue;
        const logits = new Float32Array(classes.length);
        for (let row = 0; row < classes.length; row += 1) {
          let sum = bias[row] ?? 0;
          for (let column = 0; column < dimension; column += 1) {
            sum += (weights[row * dimension + column] ?? 0) * (example.embedding[column] ?? 0);
          }
          logits[row] = sum;
        }
        const probabilities = softmax(logits);
        const target = classes.indexOf(example.label);
        for (let row = 0; row < classes.length; row += 1) {
          // d(cross-entropy)/d(logit) = p - onehot.
          const error = (probabilities[row] ?? 0) - (row === target ? 1 : 0);
          gradBias[row] = (gradBias[row] ?? 0) + error;
          for (let column = 0; column < dimension; column += 1) {
            const at = row * dimension + column;
            gradWeights[at] = (gradWeights[at] ?? 0) + error * (example.embedding[column] ?? 0);
          }
        }
      }

      const scale = options.learningRate / Math.max(1, batch.length);
      for (let at = 0; at < weights.length; at += 1) {
        const current = weights[at] ?? 0;
        weights[at] = current - scale * (gradWeights[at] ?? 0) - options.learningRate * options.l2 * current;
      }
      for (let row = 0; row < bias.length; row += 1) {
        bias[row] = (bias[row] ?? 0) - scale * (gradBias[row] ?? 0);
      }
    }
  }

  return LinearHead.of(classes, rows(weights, classes.length, dimension), Array.from(bias));
}

/** Share of examples whose most likely class is their label. `undefined` if none. */
export function accuracy(
  head: LinearHead,
  examples: readonly LabeledEmbedding[],
): number | undefined {
  if (examples.length === 0) return undefined;
  let correct = 0;
  for (const example of examples) {
    const logits = head.logits(example.embedding);
    let best = 0;
    logits.forEach((value, index) => {
      if (value > (logits[best] ?? -Infinity)) best = index;
    });
    if (head.classes[best] === example.label) correct += 1;
  }
  return correct / examples.length;
}

function shuffle(order: number[], random: RandomPort): void {
  for (let index = order.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random.next() * (index + 1));
    const held = order[index] as number;
    order[index] = order[other] as number;
    order[other] = held;
  }
}

function rows(flat: Float64Array, count: number, dimension: number): number[][] {
  return Array.from({ length: count }, (_, row) =>
    Array.from(flat.subarray(row * dimension, (row + 1) * dimension)),
  );
}

export type { ModelClass };
