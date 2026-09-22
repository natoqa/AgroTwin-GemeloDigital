import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { startStaticServer, stopStaticServer } from './staticServer.js';

const PORT = 4173;
const LEAF = fileURLToPath(new URL('./fixtures/leaf.png', import.meta.url));

const EXPECTED_LABELS = [
  'Planta sana',
  'Posible tizón temprano',
  'Posible tizón tardío',
  'No pude identificarlo',
];

let server: Server | undefined;

test.beforeEach(async () => {
  server ??= await startStaticServer(PORT);
});

test.afterAll(async () => {
  if (server) await stopStaticServer(server);
  server = undefined;
});

/**
 * Resolves once the app can genuinely survive without the network: the service
 * worker is activated, controls the page, and the whole shell — markup, script
 * and styles — is in the precache.
 *
 * This deliberately does not use `page.waitForFunction`: an async predicate
 * there returns a Promise, which is always truthy, so the wait passes
 * instantly and the test goes offline mid-precache. `expect.poll` around
 * `page.evaluate` awaits the value properly.
 */
async function waitForOfflineReadiness(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          if (registration?.active?.state !== 'activated') return false;
          if (!navigator.serviceWorker.controller) return false;

          const [cacheName] = await caches.keys();
          if (!cacheName) return false;
          const cache = await caches.open(cacheName);
          // Workbox keys entries with a revision in the query string.
          const paths = (await cache.keys()).map((request) => new URL(request.url).pathname);

          return (
            paths.includes('/index.html') &&
            paths.some((path) => path.startsWith('/assets/') && path.endsWith('.js')) &&
            paths.some((path) => path.startsWith('/assets/') && path.endsWith('.css'))
          );
        }),
      {
        timeout: 30_000,
        message: 'the service worker never finished precaching the shell',
      },
    )
    .toBe(true);
}

/** Creates a plot, photographs it, and returns the label the twin board shows. */
async function runSlice(page: Page, plotName: string): Promise<string> {
  await page.getByTestId('plot-name').fill(plotName);
  await page.getByTestId('create-plot').click();

  await expect(page.getByTestId('plot-list')).toContainText(plotName);
  await page.getByTestId('open-plot').filter({ hasText: plotName }).click();

  await expect(page.getByTestId('no-snapshots')).toBeVisible();
  await page.getByTestId('go-capture').click();

  await page.getByTestId('photo-input').setInputFiles(LEAF);

  await expect(page.getByTestId('latest-snapshot')).toBeVisible();
  return ((await page.getByTestId('diagnosis-label').textContent()) ?? '').trim();
}

test.describe('vertical slice', () => {
  test('a photograph of a plot becomes a snapshot of the twin', async ({ page }) => {
    await page.goto('/');

    const label = await runSlice(page, 'Chacra de arriba');

    expect(EXPECTED_LABELS).toContain(label);
    // The diagnosis is never alone: it appears as part of the twin's state.
    await expect(page.getByTestId('confidence')).toBeVisible();
    await expect(page.getByTestId('provenance')).toBeVisible();
    await expect(page.getByTestId('snapshot-history')).toContainText(
      new Date().toISOString().slice(0, 10),
    );
  });

  test('the snapshot survives a reload, because it lives in the device', async ({ page }) => {
    await page.goto('/');
    await runSlice(page, 'Chacra persistente');

    await page.reload();
    await page.getByTestId('open-plot').filter({ hasText: 'Chacra persistente' }).click();

    await expect(page.getByTestId('latest-snapshot')).toBeVisible();
  });

  test('the whole cycle runs with no network at all', async ({ page, context }) => {
    // Load once so the service worker installs and precaches the shell.
    await page.goto('/');
    await waitForOfflineReadiness(page);

    // Cut the network for real: the server stops existing.
    await stopStaticServer(server as Server);
    server = undefined;

    await page.reload();
    // Nothing served this but the service worker.
    await expect(page.getByTestId('plots-screen')).toBeVisible();

    // Belt and braces: the browser context is cut off too for the rest of the
    // cycle, which needs no network of any kind.
    await context.setOffline(true);

    const label = await runSlice(page, 'Chacra sin señal');
    expect(EXPECTED_LABELS).toContain(label);

    await context.setOffline(false);
  });
});
