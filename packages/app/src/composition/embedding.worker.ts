import { runEmbeddingWorker } from '@agrotwin/infrastructure/worker';

/**
 * The inference worker's entry point. It lives in the app only because the
 * bundler has to see `new Worker(new URL(...))` here; the logic is
 * infrastructure (`runEmbeddingWorker`).
 */
runEmbeddingWorker(self as unknown as Parameters<typeof runEmbeddingWorker>[0]);
