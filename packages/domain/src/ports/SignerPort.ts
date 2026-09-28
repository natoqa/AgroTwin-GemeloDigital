/**
 * ECDSA P-256 signatures for federated-learning files (CLAUDE.md §11).
 *
 * Web Crypto lives in infrastructure; the domain only asks for a signature
 * and a verdict. Keys are **ephemeral**: one key pair per delta package, so
 * the signature proves the file was not altered in transit without letting
 * anyone link two packages to the same phone.
 */
export interface EphemeralSigner {
  /** Raw uncompressed P-256 public key, base64. */
  readonly publicKey: string;
  /** Signature over the bytes, IEEE P1363 (r‖s), base64. */
  sign(bytes: Uint8Array): Promise<string>;
}

export interface SignerPort {
  createEphemeralSigner(): Promise<EphemeralSigner>;
  verify(bytes: Uint8Array, signature: string, publicKey: string): Promise<boolean>;
}
