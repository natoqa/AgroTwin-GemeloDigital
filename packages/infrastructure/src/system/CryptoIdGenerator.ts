import type { IdGeneratorPort } from '@agrotwin/domain';

/**
 * The single place allowed to reach for `crypto`, which lint bans inside the
 * domain. Identifiers stay on the device: they are never sent anywhere.
 */
export class CryptoIdGenerator implements IdGeneratorPort {
  newId(): string {
    return crypto.randomUUID();
  }
}
