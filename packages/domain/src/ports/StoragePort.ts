/** What the device says about its own storage. Fields are absent when unknown. */
export interface StorageStatus {
  readonly persisted: boolean;
  readonly usedBytes?: number;
  readonly quotaBytes?: number;
}

/**
 * The device's storage guarantee.
 *
 * With zero cloud (CLAUDE.md §3) the browser's eviction policy is the single
 * largest threat to the farmer's data: everything the twin knows lives in one
 * origin's storage, and nothing anywhere else. Asking for persistence is
 * therefore part of onboarding, not a setting buried in a menu. This is the
 * first of the three legs of risk R-07; retention and backup are the others.
 */
export interface StoragePort {
  status(): Promise<StorageStatus>;
  /**
   * Asks the browser to exempt this origin from eviction.
   *
   * Returns what was granted, not what was asked. Chrome decides on its own
   * signals, so a `false` is an ordinary outcome the UI must handle rather
   * than an error.
   */
  requestPersistence(): Promise<boolean>;
}
