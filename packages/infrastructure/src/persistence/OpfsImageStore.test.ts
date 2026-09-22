import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { epochMillis, imageRef } from '@agrotwin/domain';
import type { ClockPort, EpochMillis, IdGeneratorPort } from '@agrotwin/domain';
import { AgroTwinDb } from './AgroTwinDb.js';
import { OpfsImageStore, decodeBase64, encodeBase64 } from './OpfsImageStore.js';
import type { ImageThumbnailer, ThumbnailResult } from './ImageThumbnailer.js';
import { InMemoryDirectoryHandle, asDirectoryHandle } from '../testing/InMemoryDirectoryHandle.js';

const AT = epochMillis(1_790_028_000_000);

const countingIds = (): IdGeneratorPort => {
  let next = 0;
  return {
    newId: () => {
      next += 1;
      return `id-${next}`;
    },
  };
};

class MovableClock implements ClockPort {
  constructor(private at: EpochMillis) {}
  now(): EpochMillis {
    return this.at;
  }
  set(at: EpochMillis): void {
    this.at = at;
  }
}

/** Halves the bytes and calls it a thumbnail: the store never looks inside. */
const halvingThumbnailer: ImageThumbnailer = {
  createThumbnail: async (image, contentType): Promise<ThumbnailResult> => ({
    bytes: image.slice(0, Math.ceil(image.byteLength / 2)),
    contentType,
  }),
};

const noThumbnailer: ImageThumbnailer = { createThumbnail: async () => undefined };

let db: AgroTwinDb;
let directory: InMemoryDirectoryHandle;
let clock: MovableClock;
let unique = 0;

const storeWith = (thumbnailer: ImageThumbnailer) =>
  new OpfsImageStore(asDirectoryHandle(directory), db, countingIds(), clock, thumbnailer);

beforeEach(async () => {
  unique += 1;
  db = new AgroTwinDb(`agrotwin-opfs-${unique}`);
  await db.open();
  directory = new InMemoryDirectoryHandle();
  clock = new MovableClock(AT);
});

afterEach(async () => {
  db.close();
  await AgroTwinDb.delete(`agrotwin-opfs-${unique}`);
});

describe('OpfsImageStore', () => {
  it('returns the same bytes it was given', async () => {
    const store = storeWith(halvingThumbnailer);
    const bytes = new Uint8Array([1, 2, 3, 250]);

    const stored = await store.put(bytes.buffer, 'image/jpeg');
    const back = await store.get(stored.original);

    expect(back).toBeDefined();
    expect(new Uint8Array(back as ArrayBuffer)).toEqual(bytes);
  });

  it('derives a thumbnail and keeps it under its own reference', async () => {
    const store = storeWith(halvingThumbnailer);

    const stored = await store.put(new Uint8Array([1, 2, 3, 4]).buffer, 'image/jpeg');

    expect(stored.thumbnail).toBeDefined();
    expect(stored.thumbnail).not.toBe(stored.original);
    expect(new Uint8Array((await store.get(stored.thumbnail!)) as ArrayBuffer)).toEqual(
      new Uint8Array([1, 2]),
    );
  });

  it('still stores the photograph when no thumbnail can be made', async () => {
    const store = storeWith(noThumbnailer);

    const stored = await store.put(new Uint8Array([7]).buffer, 'image/heic');

    // A decoder that cannot read the file must not cost the farmer the
    // observation behind it.
    expect(stored.thumbnail).toBeUndefined();
    expect(await store.get(stored.original)).toBeDefined();
  });

  it('indexes only the originals for retention, with their size and age', async () => {
    const store = storeWith(halvingThumbnailer);
    await store.put(new Uint8Array(100).buffer, 'image/jpeg');
    clock.set(epochMillis(AT + 1_000));
    await store.put(new Uint8Array(40).buffer, 'image/jpeg');

    const originals = await store.listOriginals();

    expect(originals.map((image) => image.byteLength)).toEqual([100, 40]);
    expect(originals.every((image) => image.kind === 'original')).toBe(true);
    // Oldest first: the order retention purges in.
    expect(originals[0]?.storedAt).toBeLessThan(originals[1]?.storedAt ?? 0);
  });

  it('forgets both the bytes and the index entry on delete', async () => {
    const store = storeWith(halvingThumbnailer);
    const stored = await store.put(new Uint8Array([9]).buffer, 'image/jpeg');

    await store.delete(stored.original);

    expect(await store.get(stored.original)).toBeUndefined();
    expect(await store.listOriginals()).toHaveLength(0);
    expect(directory.files.has(stored.original)).toBe(false);
  });

  it('exports and re-imports an image under the same reference', async () => {
    const store = storeWith(halvingThumbnailer);
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    const stored = await store.put(bytes.buffer, 'image/jpeg');

    const encoded = await store.exportEncoded(stored.original);
    await store.delete(stored.original);
    expect(await store.get(stored.original)).toBeUndefined();

    await store.importEncoded(encoded!);

    expect(new Uint8Array((await store.get(stored.original)) as ArrayBuffer)).toEqual(bytes);
    expect((await store.listOriginals())[0]?.storedAt).toBe(AT);
  });

  it('reports nothing for an image it never held', async () => {
    const store = storeWith(halvingThumbnailer);

    expect(await store.exportEncoded(imageRef('ghost'))).toBeUndefined();
    expect(await store.get(imageRef('ghost'))).toBeUndefined();
  });

  it('wipes stray files too, not only the ones it has indexed', async () => {
    const store = storeWith(halvingThumbnailer);
    await store.put(new Uint8Array([1]).buffer, 'image/jpeg');
    // A file written before a crash interrupted its indexing.
    directory.files.set('orphan', new Uint8Array([2]));

    await store.deleteAll();

    expect(directory.files.size).toBe(0);
    expect(await store.listOriginals()).toHaveLength(0);
  });
});

describe('base64 helpers', () => {
  it('round-trips every byte value', () => {
    const bytes = new Uint8Array(256).map((_, index) => index);

    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
  });

  it('handles an empty image without producing padding noise', () => {
    expect(encodeBase64(new Uint8Array())).toBe('');
    expect(decodeBase64('')).toEqual(new Uint8Array());
  });
});
