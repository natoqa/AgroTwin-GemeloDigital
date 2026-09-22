import { describe, expect, it } from 'vitest';

import { epochMillis, type EpochMillis } from '../model/EpochMillis.js';
import type { ClockPort } from './ClockPort.js';

/**
 * Proves the shape a test double takes in every later phase: the domain never
 * reads the wall clock, so behaviour under test is fully deterministic.
 */
class FixedClock implements ClockPort {
  constructor(private readonly instant: EpochMillis) {}

  now(): EpochMillis {
    return this.instant;
  }
}

describe('ClockPort', () => {
  it('is satisfied by a deterministic test double', () => {
    const clock: ClockPort = new FixedClock(epochMillis(1_726_900_000_000));

    expect(clock.now()).toBe(1_726_900_000_000);
    expect(clock.now()).toBe(clock.now());
  });
});

describe('domain runtime', () => {
  it('executes on plain Node', () => {
    const clock: ClockPort = new FixedClock(epochMillis(0));

    expect(clock.now()).toBe(0);
  });

  it('runs with no browser globals in scope', () => {
    expect('window' in globalThis).toBe(false);
    expect('document' in globalThis).toBe(false);
  });
});
