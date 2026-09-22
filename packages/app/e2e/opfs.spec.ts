import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Server } from 'node:http';
import { runSlice } from './flows.js';
import { startStaticServer, stopStaticServer } from './staticServer.js';

/**
 * OPFS, for real.
 *
 * `OpfsImageStore` takes its directory handle by constructor so the unit tests
 * can hand it a double, which means those tests say nothing about whether the
 * origin private file system works in the browser. This does: it photographs a
 * plot and then looks inside OPFS from the page.
 */
let server: Server | undefined;

test.beforeAll(async () => {
  server = await startStaticServer(4173);
});

test.afterAll(async () => {
  if (server) await stopStaticServer(server);
  server = undefined;
});

async function storedImages(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const images = await root.getDirectoryHandle('images');
    const names: string[] = [];
    for await (const name of images.keys()) names.push(name);
    return names.length;
  });
}

test('the photograph and its thumbnail land in the origin private file system', async ({
  page,
}) => {
  await page.goto('/');
  await runSlice(page, 'Chacra con fotos');

  // One original and one thumbnail: the thumbnailer ran in a real browser,
  // which is the part no Node test can show.
  expect(await storedImages(page)).toBe(2);
});

test('erasing everything leaves no bytes behind', async ({ page }) => {
  await page.goto('/');
  await runSlice(page, 'Chacra que se borra');
  expect(await storedImages(page)).toBeGreaterThan(0);

  await page.goto('/');
  await page.getByTestId('go-backup').click();
  await page.getByTestId('erase-confirmation').fill('BORRAR');
  await page.getByTestId('erase-all').click();
  await expect(page.getByTestId('backup-message')).toBeVisible();

  expect(await storedImages(page)).toBe(0);
});
