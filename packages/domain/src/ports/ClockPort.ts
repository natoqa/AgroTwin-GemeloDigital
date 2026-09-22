import type { EpochMillis } from '../model/EpochMillis.js';

/**
 * The only way time enters the domain.
 *
 * Lint forbids `Date.now()` and argument-less `new Date()` inside this package,
 * so every instant is injected and every behaviour stays deterministic under
 * test.
 */
export interface ClockPort {
  /** The current instant, as milliseconds since the Unix epoch (UTC). */
  now(): EpochMillis;
}
