import { DomainError } from './DomainError.js';

/**
 * Raised when a backup file is not one this version can restore.
 *
 * A backup is the farmer's only copy of the twin, so a malformed one is
 * refused loudly and completely rather than imported halfway: a partial
 * restore would leave snapshots pointing at campaigns that never arrived.
 */
export class BackupFormatError extends DomainError {
  readonly code = 'BACKUP_FORMAT';

  constructor(reason: string) {
    super(`The backup file cannot be restored: ${reason}`);
  }
}
