/**
 * The only way randomness enters the domain (CLAUDE.md §7).
 *
 * Tests inject a seeded generator, so training is reproducible in Node. The
 * app injects one backed by the operating system's CSPRNG: the Gaussian noise
 * of differential privacy is only private if nobody can predict it.
 */
export interface RandomPort {
  /** Uniform in [0, 1). */
  next(): number;
}
