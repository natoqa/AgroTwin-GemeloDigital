import { afterEach, describe, expect, it, vi } from 'vitest';
import { NavigatorStorageAdapter } from './NavigatorStorageAdapter.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('NavigatorStorageAdapter', () => {
  it('reports what the browser granted, not what was asked', async () => {
    let persisted = false;
    vi.stubGlobal('navigator', {
      storage: {
        persisted: async () => persisted,
        persist: async () => {
          persisted = false; // Chrome decided no.
          return false;
        },
        estimate: async () => ({ usage: 2_048, quota: 1_000_000 }),
      },
    });
    const adapter = new NavigatorStorageAdapter();

    expect(await adapter.requestPersistence()).toBe(false);
    expect(await adapter.status()).toEqual({
      persisted: false,
      usedBytes: 2_048,
      quotaBytes: 1_000_000,
    });
  });

  it('passes a granted request through', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        persisted: async () => true,
        persist: async () => true,
        estimate: async () => ({ usage: 1, quota: 2 }),
      },
    });

    expect(await new NavigatorStorageAdapter().requestPersistence()).toBe(true);
    expect((await new NavigatorStorageAdapter().status()).persisted).toBe(true);
  });

  it('answers "not persisted" where the API does not exist', async () => {
    // Chrome 138 on Android 8–9 is the floor (CLAUDE.md §3), and an insecure
    // context has no `navigator.storage` at all. Evictable is the honest read.
    vi.stubGlobal('navigator', {});
    const adapter = new NavigatorStorageAdapter();

    expect(await adapter.status()).toEqual({ persisted: false });
    expect(await adapter.requestPersistence()).toBe(false);
  });

  it('treats a throwing request as a refusal', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        persisted: async () => false,
        persist: async () => {
          throw new Error('denied');
        },
      },
    });

    expect(await new NavigatorStorageAdapter().requestPersistence()).toBe(false);
  });
});
