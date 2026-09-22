import type { StoragePort, StorageStatus } from '@agrotwin/domain';

/**
 * The browser's own answer about eviction and quota.
 *
 * Every call is guarded: `navigator.storage` is absent in non-secure contexts
 * and the individual methods came in at different Chrome versions, and
 * CLAUDE.md §3 fixes Chrome 138 as the floor for Android 8–9. A device that
 * cannot answer reports "not persisted", which is the honest reading — the
 * data is evictable and the farmer should keep a backup.
 */
export class NavigatorStorageAdapter implements StoragePort {
  async status(): Promise<StorageStatus> {
    const storage = globalThis.navigator?.storage;

    const persisted = typeof storage?.persisted === 'function' ? await storage.persisted() : false;
    const estimate = typeof storage?.estimate === 'function' ? await storage.estimate() : undefined;

    return {
      persisted,
      ...(estimate?.usage === undefined ? {} : { usedBytes: estimate.usage }),
      ...(estimate?.quota === undefined ? {} : { quotaBytes: estimate.quota }),
    };
  }

  async requestPersistence(): Promise<boolean> {
    const storage = globalThis.navigator?.storage;
    if (typeof storage?.persist !== 'function') {
      return false;
    }
    try {
      return await storage.persist();
    } catch {
      return false;
    }
  }
}
