import { expect, test } from '@playwright/test';
import type { Server } from 'node:http';
import { runSlice } from './flows.js';
import { startStaticServer, stopStaticServer } from './staticServer.js';

/**
 * Export, wipe, restore — against a real browser, a real download and a real
 * file picker.
 *
 * The domain proves the round trip in memory; this proves the parts only a
 * browser has: the blob download, the file input, and OPFS surviving the
 * whole thing.
 */
let server: Server | undefined;

test.beforeAll(async () => {
  server = await startStaticServer(4173);
});

test.afterAll(async () => {
  if (server) await stopStaticServer(server);
  server = undefined;
});

test('a backup file restores the twin after everything is erased', async ({ page }) => {
  await page.goto('/');
  await runSlice(page, 'Chacra respaldada');

  await page.getByTestId('twin-screen').waitFor();
  const historyBefore = (await page.getByTestId('snapshot-history').textContent()) ?? '';
  expect(historyBefore.trim()).not.toBe('');

  // --- Export ------------------------------------------------------------
  await page.goto('/');
  await page.getByTestId('go-backup').click();

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-backup').click(),
  ]).then(([event]) => event);

  expect(download.suggestedFilename()).toMatch(/^agrotwin-\d{4}-\d{2}-\d{2}\.json$/u);
  const backupPath = await download.path();
  await expect(page.getByTestId('backup-message')).toBeVisible();

  // --- Erase -------------------------------------------------------------
  await page.getByTestId('erase-confirmation').fill('BORRAR');
  await page.getByTestId('erase-all').click();
  await expect(page.getByTestId('backup-message')).toContainText('borraron');

  await page.getByRole('button', { name: 'Mis parcelas' }).click();
  await expect(page.getByTestId('plot-list')).toBeEmpty();

  // --- Restore -----------------------------------------------------------
  await page.getByTestId('go-backup').click();
  await page.getByTestId('import-backup').setInputFiles(backupPath);
  await expect(page.getByTestId('backup-message')).toContainText('1 parcelas');

  await page.getByRole('button', { name: 'Mis parcelas' }).click();
  await expect(page.getByTestId('plot-list')).toContainText('Chacra respaldada');

  await page.getByTestId('open-plot').filter({ hasText: 'Chacra respaldada' }).click();
  await page.getByTestId('go-campaigns').click();
  await page.getByTestId('open-campaign').first().click();

  await expect(page.getByTestId('latest-snapshot')).toBeVisible();
  expect(((await page.getByTestId('snapshot-history').textContent()) ?? '').trim()).toBe(
    historyBefore.trim(),
  );
});

test('a file that is not a backup is refused without touching the data', async ({ page }) => {
  await page.goto('/');
  await runSlice(page, 'Chacra intacta');

  await page.goto('/');
  await page.getByTestId('go-backup').click();
  await page.getByTestId('import-backup').setInputFiles({
    name: 'cualquier-cosa.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hola":true}', 'utf8'),
  });

  await expect(page.getByTestId('backup-error')).toBeVisible();

  await page.getByRole('button', { name: 'Mis parcelas' }).click();
  await expect(page.getByTestId('plot-list')).toContainText('Chacra intacta');
});

test('the erase button stays disabled until the word is typed', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('go-backup').click();

  await expect(page.getByTestId('erase-all')).toBeDisabled();
  await page.getByTestId('erase-confirmation').fill('borrar');
  await expect(page.getByTestId('erase-all')).toBeDisabled();
  await page.getByTestId('erase-confirmation').fill('BORRAR');
  await expect(page.getByTestId('erase-all')).toBeEnabled();
});
