import { imageRef } from '@agrotwin/domain';
import type {
  ClockPort,
  EncodedImage,
  IdGeneratorPort,
  ImageKind,
  ImageRef,
  ImageStorePort,
  StoredImageInfo,
  StoredImagePair,
} from '@agrotwin/domain';
import type { AgroTwinDb } from './AgroTwinDb.js';
import type { ImageThumbnailer } from './ImageThumbnailer.js';
import { toImageInfo } from './records.js';

/** The OPFS folder the photographs live in, under the origin's private root. */
export const IMAGE_DIRECTORY = 'images';

/**
 * Photographs on the origin private file system, indexed in IndexedDB
 * (ADR-0007).
 *
 * Bytes and index are split because they are read for different reasons. The
 * retention policy and the backup need sizes, ages and kinds — queries, not
 * pixels — and OPFS cannot answer those without opening every file. IndexedDB
 * answers them from an index, and OPFS stores megabytes without the structured
 * clone tax that Phase 1's blob-in-IndexedDB approach paid on every write.
 *
 * The directory handle is injected rather than fetched from
 * `navigator.storage`, so the store is testable outside a browser. `open()` is
 * the convenience the composition root uses.
 */
export class OpfsImageStore implements ImageStorePort {
  constructor(
    private readonly directory: FileSystemDirectoryHandle,
    private readonly db: AgroTwinDb,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
    private readonly thumbnailer: ImageThumbnailer,
  ) {}

  /** Opens (creating if needed) the image folder in the origin's private root. */
  static async open(
    db: AgroTwinDb,
    ids: IdGeneratorPort,
    clock: ClockPort,
    thumbnailer: ImageThumbnailer,
  ): Promise<OpfsImageStore> {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(IMAGE_DIRECTORY, { create: true });
    return new OpfsImageStore(directory, db, ids, clock, thumbnailer);
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
  }

  async put(image: ArrayBuffer, contentType: string): Promise<StoredImagePair> {
    const original = await this.write(image, contentType, 'original');

    // A thumbnail that cannot be produced costs the timeline a picture, never
    // the observation, so its failure is not this method's failure.
    const thumbnail = await this.thumbnailer.createThumbnail(image, contentType);
    if (!thumbnail) {
      return { original };
    }
    return {
      original,
      thumbnail: await this.write(thumbnail.bytes, thumbnail.contentType, 'thumbnail'),
    };
  }

  async get(ref: ImageRef): Promise<ArrayBuffer | undefined> {
    return this.read(ref);
  }

  async delete(ref: ImageRef): Promise<void> {
    await this.removeFile(ref);
    await this.db.images.delete(ref);
  }

  async listOriginals(): Promise<readonly StoredImageInfo[]> {
    const records = await this.db.images.where('kind').equals('original').toArray();
    return records
      .map(toImageInfo)
      .sort((left, right) => left.storedAt - right.storedAt);
  }

  async exportEncoded(ref: ImageRef): Promise<EncodedImage | undefined> {
    const record = await this.db.images.get(ref);
    const bytes = await this.read(ref);
    if (!record || !bytes) return undefined;

    const info = toImageInfo(record);
    return {
      ref: info.ref,
      kind: info.kind,
      contentType: info.contentType,
      base64: encodeBase64(new Uint8Array(bytes)),
      storedAt: info.storedAt,
    };
  }

  async importEncoded(image: EncodedImage): Promise<void> {
    const bytes = decodeBase64(image.base64);
    await this.writeFile(image.ref, bytes);
    await this.db.images.put({
      id: image.ref,
      kind: image.kind,
      contentType: image.contentType,
      byteLength: bytes.byteLength,
      storedAt: image.storedAt,
    });
  }

  /**
   * Removes every stored byte, not only the indexed ones.
   *
   * The directory is enumerated rather than the index: a crash between writing
   * a file and indexing it would otherwise leave a photograph on a phone the
   * farmer believes they wiped.
   */
  async deleteAll(): Promise<void> {
    for await (const name of this.directory.keys()) {
      await this.directory.removeEntry(name).catch(() => undefined);
    }
    await this.db.images.clear();
  }

  private async write(
    bytes: ArrayBuffer,
    contentType: string,
    kind: ImageKind,
  ): Promise<ImageRef> {
    const ref = imageRef(this.ids.newId());
    await this.writeFile(ref, new Uint8Array(bytes));
    await this.db.images.put({
      id: ref,
      kind,
      contentType,
      byteLength: bytes.byteLength,
      storedAt: this.clock.now(),
    });
    return ref;
  }

  private async writeFile(ref: ImageRef, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    const handle = await this.directory.getFileHandle(ref, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(bytes);
    } finally {
      await writable.close();
    }
  }

  private async read(ref: ImageRef): Promise<ArrayBuffer | undefined> {
    try {
      const handle = await this.directory.getFileHandle(ref);
      return await (await handle.getFile()).arrayBuffer();
    } catch {
      // Missing file: a purged original, or bytes the browser evicted.
      return undefined;
    }
  }

  private async removeFile(ref: ImageRef): Promise<void> {
    await this.directory.removeEntry(ref).catch(() => undefined);
  }
}

/** `btoa` takes a string, so the bytes go through it in chunks it can hold. */
const CHUNK = 0x8000;

export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return btoa(binary);
}

export function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
