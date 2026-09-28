import { FederationPackageError } from '../errors/FederationPackageError.js';

/**
 * The two files of federated learning (CLAUDE.md §11).
 *
 * - `.agrotwin-delta`: what one phone contributes — the change to the head.
 * - `.agrotwin-model`: what the hub returns — a whole aggregated head.
 *
 * Binary layout, little-endian, the same for both:
 *
 *     magic (4 ASCII bytes)  "AGTD" | "AGTM"
 *     u32  header length
 *     header, JSON, ASCII
 *     u32  signature length
 *     signature, base64 ASCII (ECDSA P-256 over SHA-256, IEEE P1363 r‖s)
 *     body, float32 × parameterCount
 *
 * The signature covers `magic ‖ header ‖ body` exactly as they appear in the
 * file, so verifying never re-serialises anything. Signing and verifying are
 * Web Crypto, and so infrastructure; this module only lays the bytes out.
 */

export const DELTA_MAGIC = 'AGTD';
export const MODEL_MAGIC = 'AGTM';
export const PACKAGE_FORMAT_VERSION = 1;

export interface DeltaHeader {
  readonly format: 'agrotwin-delta';
  readonly formatVersion: number;
  /** The frozen backbone the delta's head sits on (the contract version). */
  readonly backboneVersion: string;
  /** The head the delta was computed from. Deltas only average on one base. */
  readonly baseHeadVersion: string;
  readonly parameterCount: number;
  /** Examples trained on. FedAvg weights by it. */
  readonly sampleCount: number;
  /** L2 norm the delta was clipped to before noise. */
  readonly clipNorm: number;
  /** Standard deviation of the Gaussian noise added to each parameter. */
  readonly noiseSigma: number;
  /** Epoch millis. */
  readonly createdAt: number;
  /** Random, per package: nothing links two packages to one phone. */
  readonly ephemeralId: string;
  /** The package's own ephemeral public key, raw P-256 point, base64. */
  readonly publicKey: string;
}

export interface ModelHeader {
  readonly format: 'agrotwin-model';
  readonly formatVersion: number;
  readonly backboneVersion: string;
  readonly baseHeadVersion: string;
  /** The version of the head in this file. */
  readonly headVersion: string;
  readonly parameterCount: number;
  readonly contributors: number;
  readonly totalSamples: number;
  readonly createdAt: number;
  readonly publicKey: string;
}

export interface PackageParts<H> {
  readonly header: H;
  readonly body: Float32Array;
  /** `magic ‖ header ‖ body`: what the signature covers. */
  readonly signedBytes: Uint8Array;
  readonly signature: string;
}

/** The bytes to sign for a package that does not exist yet. */
export function signedBytesFor(magic: string, header: object, body: Float32Array): Uint8Array {
  return concat(ascii(magic), ascii(JSON.stringify(header)), float32Bytes(body));
}

export function encodePackage(
  magic: string,
  header: object,
  body: Float32Array,
  signature: string,
): Uint8Array {
  const headerBytes = ascii(JSON.stringify(header));
  const signatureBytes = ascii(signature);
  return concat(
    ascii(magic),
    u32(headerBytes.length),
    headerBytes,
    u32(signatureBytes.length),
    signatureBytes,
    float32Bytes(body),
  );
}

export function decodeDeltaPackage(bytes: Uint8Array): PackageParts<DeltaHeader> {
  const parts = decode(bytes, DELTA_MAGIC);
  const header = parts.header;
  if (header['format'] !== 'agrotwin-delta' || header['formatVersion'] !== PACKAGE_FORMAT_VERSION) {
    throw new FederationPackageError('it is not an agrotwin-delta version 1 file');
  }
  const parsed: DeltaHeader = {
    format: 'agrotwin-delta',
    formatVersion: PACKAGE_FORMAT_VERSION,
    backboneVersion: text(header, 'backboneVersion'),
    baseHeadVersion: text(header, 'baseHeadVersion'),
    parameterCount: count(header, 'parameterCount'),
    sampleCount: count(header, 'sampleCount'),
    clipNorm: nonNegative(header, 'clipNorm'),
    noiseSigma: nonNegative(header, 'noiseSigma'),
    createdAt: nonNegative(header, 'createdAt'),
    ephemeralId: text(header, 'ephemeralId'),
    publicKey: text(header, 'publicKey'),
  };
  return withBody(parts, parsed);
}

export function decodeModelPackage(bytes: Uint8Array): PackageParts<ModelHeader> {
  const parts = decode(bytes, MODEL_MAGIC);
  const header = parts.header;
  if (header['format'] !== 'agrotwin-model' || header['formatVersion'] !== PACKAGE_FORMAT_VERSION) {
    throw new FederationPackageError('it is not an agrotwin-model version 1 file');
  }
  const parsed: ModelHeader = {
    format: 'agrotwin-model',
    formatVersion: PACKAGE_FORMAT_VERSION,
    backboneVersion: text(header, 'backboneVersion'),
    baseHeadVersion: text(header, 'baseHeadVersion'),
    headVersion: text(header, 'headVersion'),
    parameterCount: count(header, 'parameterCount'),
    contributors: count(header, 'contributors'),
    totalSamples: count(header, 'totalSamples'),
    createdAt: nonNegative(header, 'createdAt'),
    publicKey: text(header, 'publicKey'),
  };
  return withBody(parts, parsed);
}

// --- Bytes ------------------------------------------------------------------

interface RawParts {
  readonly header: Record<string, unknown>;
  readonly headerBytes: Uint8Array;
  readonly magic: Uint8Array;
  readonly signature: string;
  readonly bodyBytes: Uint8Array;
}

function decode(bytes: Uint8Array, magic: string): RawParts {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || fromAscii(bytes.subarray(0, 4)) !== magic) {
    throw new FederationPackageError(`it does not start with ${magic}`);
  }
  const headerLength = view.getUint32(4, true);
  const headerEnd = 8 + headerLength;
  if (headerEnd + 4 > bytes.length) throw new FederationPackageError('the header is truncated');
  const headerBytes = bytes.subarray(8, headerEnd);
  const signatureLength = view.getUint32(headerEnd, true);
  const signatureEnd = headerEnd + 4 + signatureLength;
  if (signatureEnd > bytes.length) throw new FederationPackageError('the signature is truncated');

  let header: unknown;
  try {
    header = JSON.parse(fromAscii(headerBytes));
  } catch {
    throw new FederationPackageError('the header is not JSON');
  }
  if (typeof header !== 'object' || header === null || Array.isArray(header)) {
    throw new FederationPackageError('the header is not an object');
  }
  return {
    header: header as Record<string, unknown>,
    headerBytes,
    magic: bytes.subarray(0, 4),
    signature: fromAscii(bytes.subarray(headerEnd + 4, signatureEnd)),
    bodyBytes: bytes.subarray(signatureEnd),
  };
}

function withBody<H extends { parameterCount: number }>(parts: RawParts, header: H): PackageParts<H> {
  if (parts.bodyBytes.length !== header.parameterCount * 4) {
    throw new FederationPackageError(
      `the body holds ${parts.bodyBytes.length / 4} values and the header promises ${header.parameterCount}`,
    );
  }
  const view = new DataView(parts.bodyBytes.buffer, parts.bodyBytes.byteOffset, parts.bodyBytes.byteLength);
  const body = new Float32Array(header.parameterCount);
  for (let index = 0; index < body.length; index += 1) {
    const value = view.getFloat32(index * 4, true);
    if (!Number.isFinite(value)) throw new FederationPackageError('the body holds a value that is not finite');
    body[index] = value;
  }
  return {
    header,
    body,
    signedBytes: concat(parts.magic, parts.headerBytes, parts.bodyBytes),
    signature: parts.signature,
  };
}

function ascii(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code > 0x7e) throw new FederationPackageError('package text must be plain ASCII');
    bytes[index] = code;
  }
  return bytes;
}

function fromAscii(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    if (byte > 0x7e) throw new FederationPackageError('package text must be plain ASCII');
    text += String.fromCharCode(byte);
  }
  return text;
}

function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function float32Bytes(values: Float32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return bytes;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function text(header: Record<string, unknown>, key: string): string {
  const value = header[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new FederationPackageError(`${key} is not text`);
  }
  return value;
}

function nonNegative(header: Record<string, unknown>, key: string): number {
  const value = header[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new FederationPackageError(`${key} is not a non-negative number`);
  }
  return value;
}

function count(header: Record<string, unknown>, key: string): number {
  const value = nonNegative(header, key);
  if (!Number.isInteger(value) || value === 0) {
    throw new FederationPackageError(`${key} is not a positive integer`);
  }
  return value;
}
