import type { ImageRef } from '../model/Ids.js';

/**
 * Stores photographs outside the domain's sight.
 *
 * The domain holds an `ImageRef` and never the bytes, so it stays free of
 * `Blob`, `File` and every other browser type. Phase 1 stores blobs in
 * IndexedDB; Phase 2 replaces the adapter with OPFS plus a retention policy,
 * and nothing in the domain notices.
 */
export interface ImageStorePort {
  /** Stores the image and returns the handle to it. */
  put(image: ArrayBuffer, contentType: string): Promise<ImageRef>;
  get(ref: ImageRef): Promise<ArrayBuffer | undefined>;
  delete(ref: ImageRef): Promise<void>;
}
