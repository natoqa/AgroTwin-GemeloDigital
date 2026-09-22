import { expect, test } from '@playwright/test';
import type { Server } from 'node:http';
import { startStaticServer, stopStaticServer } from './staticServer.js';

/**
 * Installability, checked mechanically.
 *
 * Lighthouse dropped its PWA category and its `installable-manifest` audit in
 * version 12, so the DoD's "Lighthouse: PWA instalable" cannot be run as
 * written any more. This asserts the criteria Chrome actually applies, and
 * records whether Chrome fires `beforeinstallprompt` — its own verdict — when
 * the browser is willing to give one.
 */
let server: Server | undefined;

test.beforeAll(async () => {
  server = await startStaticServer(4173);
});

test.afterAll(async () => {
  if (server) await stopStaticServer(server);
  server = undefined;
});

test('the app meets Chrome installability criteria', async ({ page }) => {
  // The event fires early, so the listener has to exist before any page code.
  await page.addInitScript(() => {
    (window as unknown as { __installPrompt?: boolean }).__installPrompt = false;
    window.addEventListener('beforeinstallprompt', () => {
      (window as unknown as { __installPrompt?: boolean }).__installPrompt = true;
    });
  });

  await page.goto('/');

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href;
    return href ? ((await (await fetch(href)).json()) as Record<string, unknown>) : undefined;
  });

  expect(manifest, 'the page must link a web app manifest').toBeDefined();
  expect(manifest).toMatchObject({ display: 'standalone', start_url: '/', lang: 'es' });
  expect(manifest?.name).toBeTruthy();
  expect(manifest?.short_name).toBeTruthy();

  const icons = (manifest?.icons ?? []) as { src: string; sizes: string; purpose?: string }[];
  expect(icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );
  expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);

  // Every icon must actually be served, not merely declared.
  for (const icon of icons) {
    const response = await page.request.get(new URL(icon.src, page.url()).toString());
    expect(response.status(), `${icon.src} must be served`).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  }

  // A service worker with a fetch handler is the other half of the criteria.
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state),
    )
    .toBe('activated');

  const chromeOffered = await page.evaluate(
    () => (window as unknown as { __installPrompt?: boolean }).__installPrompt === true,
  );
  // Headless Chromium does not always offer the prompt; the criteria above are
  // the contract, and the phone check in docs/nfr/measurements.md is the proof.
  console.log(`beforeinstallprompt fired: ${chromeOffered}`);
});
