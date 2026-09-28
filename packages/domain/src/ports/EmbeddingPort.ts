/**
 * Turns a photograph into the backbone's embedding (ADR-0005).
 *
 * The backbone is ONNX, runs in a Web Worker and lives in infrastructure. It
 * stops at the embedding on purpose: everything after it — the head, the
 * softmax, the rejection threshold — is domain code, testable in Node and,
 * from Phase 6, trainable on the device.
 */
export interface EmbeddingPort {
  embed(image: ArrayBuffer): Promise<Float32Array>;
}
