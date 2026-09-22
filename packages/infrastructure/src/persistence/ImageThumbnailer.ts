/** The bytes of a derived image, and what they are. */
export interface ThumbnailResult {
  readonly bytes: ArrayBuffer;
  readonly contentType: string;
}

/**
 * Makes the small, permanent copy of a photograph.
 *
 * It is an interface because the twin has to keep working where it cannot be
 * done — a browser without `OffscreenCanvas`, or a Node test — and because a
 * failed thumbnail must never cost the farmer the observation. Every
 * implementation returns `undefined` rather than throwing.
 */
export interface ImageThumbnailer {
  createThumbnail(image: ArrayBuffer, contentType: string): Promise<ThumbnailResult | undefined>;
}

/** Longest side of the stored thumbnail, in pixels. Enough to recognise a leaf. */
const THUMBNAIL_MAX_EDGE = 320;
const THUMBNAIL_QUALITY = 0.72;

/**
 * Thumbnails through `createImageBitmap` and `OffscreenCanvas`.
 *
 * `createImageBitmap` takes the target width, so the browser decodes straight
 * to the size wanted instead of unpacking a 12-megapixel JPEG into the heap
 * first. On the 2 GB reference device that difference is the difference
 * between a thumbnail and an out-of-memory tab, which is why no separate
 * worker is needed here: the expensive part never runs on the main thread.
 */
export class CanvasImageThumbnailer implements ImageThumbnailer {
  constructor(
    private readonly maxEdge = THUMBNAIL_MAX_EDGE,
    private readonly quality = THUMBNAIL_QUALITY,
  ) {}

  static isSupported(): boolean {
    return typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function';
  }

  async createThumbnail(
    image: ArrayBuffer,
    contentType: string,
  ): Promise<ThumbnailResult | undefined> {
    if (!CanvasImageThumbnailer.isSupported()) {
      return undefined;
    }

    let bitmap: ImageBitmap | undefined;
    try {
      const source = new Blob([image], { type: contentType });
      const probe = await createImageBitmap(source);
      const scale = Math.min(1, this.maxEdge / Math.max(probe.width, probe.height));
      const width = Math.max(1, Math.round(probe.width * scale));
      const height = Math.max(1, Math.round(probe.height * scale));
      probe.close();

      bitmap = await createImageBitmap(source, {
        resizeWidth: width,
        resizeHeight: height,
        resizeQuality: 'medium',
      });

      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) return undefined;
      context.drawImage(bitmap, 0, 0);

      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: this.quality });
      return { bytes: await blob.arrayBuffer(), contentType: blob.type };
    } catch {
      // A photograph the decoder cannot read is still a valid observation:
      // the diagnosis and the date stand, and the timeline shows no picture.
      return undefined;
    } finally {
      bitmap?.close();
    }
  }
}
