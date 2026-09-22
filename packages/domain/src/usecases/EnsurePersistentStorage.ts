import type { StoragePort, StorageStatus } from '../ports/StoragePort.js';

export interface EnsurePersistentStorageDependencies {
  readonly storage: StoragePort;
}

/**
 * Asks the browser not to evict the twin, once.
 *
 * Runs at onboarding, because by the time storage is under pressure the
 * request is far less likely to be granted. A refusal is not an error: the app
 * keeps working and the farmer is told, in plain words, that keeping a backup
 * matters more on this device (risk R-07).
 */
export function ensurePersistentStorageUseCase(deps: EnsurePersistentStorageDependencies) {
  return async function execute(): Promise<StorageStatus> {
    const current = await deps.storage.status();
    if (current.persisted) {
      return current;
    }
    await deps.storage.requestPersistence();
    return deps.storage.status();
  };
}
