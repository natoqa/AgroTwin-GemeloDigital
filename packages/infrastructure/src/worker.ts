/**
 * The inference worker's code, on its own entry point.
 *
 * Kept out of the package root so that ONNX Runtime is bundled into the
 * worker only, never into the main thread's app shell (RNF-02 excludes the
 * inference runtime, and the main thread never needs it).
 */
export { runEmbeddingWorker } from './inference/embeddingWorker.js';
export type { WorkerRequest, WorkerResponse } from './inference/embeddingWorker.js';
