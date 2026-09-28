import type { EphemeralSigner, SignerPort } from '@agrotwin/domain';

const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIGNATURE = { name: 'ECDSA', hash: 'SHA-256' } as const;

/**
 * ECDSA P-256 with Web Crypto (CLAUDE.md §11), supported across the whole
 * platform matrix, Chrome 138 included.
 *
 * One key pair per package: the private key is generated non-extractable,
 * used once and dropped with the signer. Web Crypto returns signatures in
 * IEEE P1363 form (r‖s), which the hub converts for its own library.
 */
export class WebCryptoSigner implements SignerPort {
  async createEphemeralSigner(): Promise<EphemeralSigner> {
    const pair = await crypto.subtle.generateKey(ALGORITHM, false, ['sign', 'verify']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
    return {
      publicKey: toBase64(raw),
      sign: async (bytes) =>
        toBase64(new Uint8Array(await crypto.subtle.sign(SIGNATURE, pair.privateKey, copy(bytes)))),
    };
  }

  async verify(bytes: Uint8Array, signature: string, publicKey: string): Promise<boolean> {
    try {
      const key = await crypto.subtle.importKey('raw', fromBase64(publicKey), ALGORITHM, false, [
        'verify',
      ]);
      return await crypto.subtle.verify(SIGNATURE, key, fromBase64(signature), copy(bytes));
    } catch {
      // A key or signature that does not even parse is simply not valid.
      return false;
    }
  }
}

/** A standalone copy: Web Crypto wants an ArrayBuffer-backed view of exactly these bytes. */
function copy(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
