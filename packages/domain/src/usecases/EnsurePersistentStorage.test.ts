import { describe, expect, it } from 'vitest';
import { ensurePersistentStorageUseCase } from './EnsurePersistentStorage.js';
import { FakeStorage } from '../testing/doubles.js';

describe('ensurePersistentStorageUseCase', () => {
  it('asks the browser when the origin is not yet persisted', async () => {
    const storage = new FakeStorage(false, true);

    const status = await ensurePersistentStorageUseCase({ storage })();

    expect(storage.requests).toBe(1);
    expect(status.persisted).toBe(true);
  });

  it('does not ask twice when persistence is already granted', async () => {
    const storage = new FakeStorage(true, true);

    await ensurePersistentStorageUseCase({ storage })();

    expect(storage.requests).toBe(0);
  });

  it('reports a refusal instead of failing', async () => {
    const storage = new FakeStorage(false, false);

    const status = await ensurePersistentStorageUseCase({ storage })();

    // Chrome decides on its own signals. A "no" is an ordinary outcome the
    // onboarding screen has to explain, not an error to throw.
    expect(status.persisted).toBe(false);
    expect(status.quotaBytes).toBeGreaterThan(0);
  });
});
