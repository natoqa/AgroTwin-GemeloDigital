import type { RandomPort } from '@agrotwin/domain';

/**
 * Randomness from the operating system's CSPRNG.
 *
 * Used for training order and, above all, for the Gaussian noise of
 * differential privacy and the packages' ephemeral identifiers: noise anyone
 * could reproduce from a seed would protect nothing.
 */
export class CryptoRandom implements RandomPort {
  private readonly buffer = new Uint32Array(256);
  private index = this.buffer.length;

  next(): number {
    if (this.index >= this.buffer.length) {
      crypto.getRandomValues(this.buffer);
      this.index = 0;
    }
    const value = this.buffer[this.index] ?? 0;
    this.index += 1;
    return value / 4_294_967_296;
  }
}
