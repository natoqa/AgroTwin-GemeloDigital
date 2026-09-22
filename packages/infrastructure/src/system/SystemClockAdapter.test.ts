import { describe, expect, it } from 'vitest';

import { isEpochMillis } from '@agrotwin/domain';
import { SystemClockAdapter } from './SystemClockAdapter.js';

describe('SystemClockAdapter', () => {
  it('produces a valid instant', () => {
    const clock = new SystemClockAdapter();

    expect(isEpochMillis(clock.now())).toBe(true);
  });

  it('never moves backwards between reads', () => {
    const clock = new SystemClockAdapter();

    const first = clock.now();
    const second = clock.now();

    expect(second).toBeGreaterThanOrEqual(first);
  });
});
