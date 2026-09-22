import type { EpochMillis } from '../model/EpochMillis.js';
import type { ImageRef } from '../model/Ids.js';

/** Full photograph, or the small copy kept permanently. */
export type ImageKind = 'original' | 'thumbnail';

/** What `put` stored: the photograph, and its thumbnail when one could be made. */
export interface StoredImagePair {
  readonly original: ImageRef;
  readonly thumbnail?: ImageRef;
}

/** Metadata about one stored image. The bytes stay behind the port. */
export interface StoredImageInfo {
  readonly ref: ImageRef;
  readonly kind: ImageKind;
  readonly contentType: string;
  readonly byteLength: number;
  readonly storedAt: EpochMillis;
}

/**
 * An image in the form a backup file can carry it: base64 text.
 *
 * The domain cannot encode bytes — it has neither `btoa` nor `Buffer`, by
 * design — so the adapter hands it text already encoded. This is the only
 * shape of image data the domain ever touches, and it is opaque to it.
 */
export interface EncodedImage {
  readonly ref: ImageRef;
  readonly kind: ImageKind;
  readonly contentType: string;
  readonly base64: string;
  readonly storedAt: EpochMillis;
}

/**
 * Stores photographs outside the domain's sight.
 *
 * The domain holds an `ImageRef` and never the bytes, so it stays free of
 * `Blob`, `File` and every other browser type.
 */
export interface ImageStorePort {
  /** Stores the photograph and derives its thumbnail. */
  put(image: ArrayBuffer, contentType: string): Promise<StoredImagePair>;
  get(ref: ImageRef): Promise<ArrayBuffer | undefined>;
  delete(ref: ImageRef): Promise<void>;
  /** Every full photograph still held, oldest first. Retention reads this. */
  listOriginals(): Promise<readonly StoredImageInfo[]>;
  /** The image as base64, for writing into a backup file. */
  exportEncoded(ref: ImageRef): Promise<EncodedImage | undefined>;
  /** Puts an image back under the reference it had when it was exported. */
  importEncoded(image: EncodedImage): Promise<void>;
  deleteAll(): Promise<void>;
}
