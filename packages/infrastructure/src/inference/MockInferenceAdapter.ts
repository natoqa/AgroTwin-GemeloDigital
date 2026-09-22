import type { Diagnosis, DiagnosisClass, InferencePort } from '@agrotwin/domain';

const CANDIDATES: readonly DiagnosisClass[] = ['healthy', 'early_blight', 'late_blight'];

/**
 * Phase 1's stand-in for the classifier, and nothing more.
 *
 * It is **deterministic**: the same bytes always give the same diagnosis. A
 * random mock would make the end-to-end test flaky and would teach us nothing.
 *
 * It does model one real behaviour on purpose: when the derived confidence
 * falls below the threshold it answers `rejected` rather than guessing. That
 * is the contract Phase 5's real adapter has to honour, so the UI that handles
 * it is exercised from day one.
 */
export class MockInferenceAdapter implements InferencePort {
  static readonly MODEL_VERSION = 'mock-1';

  constructor(private readonly rejectionThreshold = 0.6) {}

  async diagnose(image: ArrayBuffer): Promise<Diagnosis> {
    const hash = fnv1a(new Uint8Array(image));

    const candidate = CANDIDATES[hash % CANDIDATES.length] ?? 'healthy';
    // Spread over [0.40, 0.98] so both the confident and the rejected paths
    // are reachable from ordinary fixtures.
    const confidence = Math.round((0.4 + ((hash >>> 8) % 59) / 100) * 100) / 100;

    return {
      class: confidence < this.rejectionThreshold ? 'rejected' : candidate,
      confidence,
      modelVersion: MockInferenceAdapter.MODEL_VERSION,
    };
  }
}

/** FNV-1a, 32-bit. Chosen for being short, stable and dependency-free. */
function fnv1a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}
