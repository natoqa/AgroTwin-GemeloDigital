export * from './errors/index.js';
export * from './model/index.js';
export * from './ports/index.js';
export * from './usecases/index.js';

/**
 * The backup file format is public API — the app writes and reads files with
 * it — but its record mappers are not: they exist for the backup use cases and
 * would collide with the persistence mappers if they leaked.
 */
export {
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  parseBackup,
  serializeBackup,
} from './backup/BackupDocument.js';
export type { BackupDocument } from './backup/BackupDocument.js';
