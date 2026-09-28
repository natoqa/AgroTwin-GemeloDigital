import type { Diagnosis } from '../model/Diagnosis.js';
import type { EmbeddingPort } from '../ports/EmbeddingPort.js';
import type { InferencePort } from '../ports/InferencePort.js';
import type { LinearHead } from './LinearHead.js';
import { softmax } from './LinearHead.js';
import type { ModelContract } from './ModelContract.js';

/**
 * The real classifier: backbone embedding, then the domain's head.
 *
 * It implements the same `InferencePort` the mock did, so swapping it in is a
 * change to the composition root and nothing else (CLAUDE.md §7).
 *
 * Below the contract's calibrated threshold the answer is `rejected` — "I
 * could not identify it, try another photo" — never a low-confidence guess
 * dressed up as a diagnosis (CLAUDE.md §10). The confidence reported is the
 * calibrated one, so what the twin and the Advisor weigh is what the pipeline
 * measured.
 */
export class HeadClassifier implements InferencePort {
  constructor(
    private readonly embedder: EmbeddingPort,
    private readonly head: LinearHead,
    private readonly contract: ModelContract,
  ) {}

  async diagnose(image: ArrayBuffer): Promise<Diagnosis> {
    const embedding = await this.embedder.embed(image);
    return this.classify(embedding);
  }

  classify(embedding: Float32Array): Diagnosis {
    const probabilities = softmax(this.head.logits(embedding), this.contract.temperature);
    let best = 0;
    probabilities.forEach((value, index) => {
      if (value > (probabilities[best] ?? 0)) best = index;
    });
    const confidence = probabilities[best] ?? 0;
    const label = this.head.classes[best] ?? 'healthy';

    return {
      class: confidence < this.contract.rejectionThreshold ? 'rejected' : label,
      confidence,
      modelVersion: this.contract.version,
    };
  }
}
