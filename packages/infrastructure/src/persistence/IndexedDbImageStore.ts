import { imageRef } from '@agrotwin/domain';
import type { ClockPort, IdGeneratorPort, ImageRef, ImageStorePort } from '@agrotwin/domain';
import type { AgroTwinDb } from './AgroTwinDb.js';

/**
 * Phase 1's image store: blobs in IndexedDB.
 *
 * This is deliberately the simple option. Phase 2 replaces it with
 * `OpfsImageStore`, which owns the retention policy (a permanent thumbnail
 * plus a purgeable original). Because both sit behind `ImageStorePort`, that
 * swap is one line in the composition root.
 */
export class IndexedDbImageStore implements ImageStorePort {
  constructor(
    private readonly db: AgroTwinDb,
    private readonly ids: IdGeneratorPort,
    private readonly clock: ClockPort,
  ) {}

  async put(image: ArrayBuffer, contentType: string): Promise<ImageRef> {
    const id = this.ids.newId();
    await this.db.images.put({ id, data: image, contentType, storedAt: this.clock.now() });
    return imageRef(id);
  }

  async get(ref: ImageRef): Promise<ArrayBuffer | undefined> {
    return (await this.db.images.get(ref))?.data;
  }

  async delete(ref: ImageRef): Promise<void> {
    await this.db.images.delete(ref);
  }
}
