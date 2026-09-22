import type { Diagnosis } from '../model/Diagnosis.js';

/**
 * Classifies a leaf photograph.
 *
 * Phase 1 is served by a deterministic mock. Phase 5 swaps in ONNX Runtime Web
 * in a worker. The port is what lets that swap be a one-line change in the
 * composition root, and it is why the twin does not depend on the classifier.
 */
export interface InferencePort {
  diagnose(image: ArrayBuffer): Promise<Diagnosis>;
}
