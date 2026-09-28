import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Server } from 'node:http';
import { LEAF, ensureModelOnCapture, locatedPlotWithCampaign } from './flows.js';
import { startStaticServer, stopStaticServer } from './staticServer.js';

/**
 * RNF-09: no critical axe violations in the main flows.
 *
 * This suite is stricter than the requirement on purpose (Phase 4, D4): it
 * fails on **serious** violations too. For this user, contrast and target
 * size are not polish — a button that cannot be read in the sun is a button
 * that does not exist.
 *
 * Every screen is checked in the state the farmer actually sees it in: with
 * data, with a question answered, with a result on screen. An empty screen
 * passes more easily than a real one.
 */
let server: Server | undefined;

test.beforeAll(async () => {
  server = await startStaticServer(4173);
});

test.afterAll(async () => {
  if (server) await stopStaticServer(server);
  server = undefined;
});

const BLOCKING = new Set(['critical', 'serious']);

async function expectAccessible(page: Page, where: string): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const blocking = results.violations.filter((violation) => BLOCKING.has(violation.impact ?? ''));
  const report = blocking.map(
    (violation) =>
      `${violation.impact}: ${violation.id} — ${violation.help}\n` +
      violation.nodes.map((node) => `    ${node.target.join(' ')}`).join('\n'),
  );
  expect(report, `axe found blocking violations on ${where}`).toEqual([]);
}

test('the main flows have no critical or serious axe violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('plots-screen')).toBeVisible();
  await expectAccessible(page, 'the empty plot list');

  await locatedPlotWithCampaign(page, 'Chacra accesible');
  await expect(page.getByTestId('recommendations')).toBeVisible();
  await expectAccessible(page, 'the twin board');

  await page.getByTestId('scenario-no_irrigation').click();
  await expect(page.getByTestId('scenario-result')).toBeVisible();
  await page.getByTestId('irrigate').click();
  await expect(page.getByTestId('irrigation-saved')).toBeVisible();
  await expectAccessible(page, 'the twin board with a scenario and an irrigation');

  await page.getByTestId('go-capture').click();
  await expect(page.getByTestId('capture-screen')).toBeVisible();
  await expectAccessible(page, 'the capture screen, before the model is downloaded');
  await ensureModelOnCapture(page);
  await expectAccessible(page, 'the capture screen, ready');
  await page.getByTestId('photo-input').setInputFiles(LEAF);
  await expect(page.getByTestId('latest-snapshot')).toBeVisible({ timeout: 30_000 });
  await expectAccessible(page, 'the twin board with a photograph');

  await page.getByTestId('go-weather').click();
  await page.getByTestId('rainfall-a_little').click();
  await page.getByTestId('cold-night-yes').click();
  await expectAccessible(page, 'the weather questions, answered');
  await page.getByRole('button', { name: 'Volver' }).click();

  await page.getByRole('button', { name: 'Volver a las campañas' }).click();
  await expect(page.getByTestId('campaigns-screen')).toBeVisible();
  await expectAccessible(page, 'the campaign list');

  await page.getByRole('button', { name: 'Volver a la parcela' }).click();
  await expect(page.getByTestId('plot-screen')).toBeVisible();
  await expectAccessible(page, 'the plot details');

  await page.getByRole('button', { name: 'Mis parcelas' }).click();
  await expect(page.getByTestId('plot-list')).toContainText('Chacra accesible');
  await expectAccessible(page, 'the plot list');

  await page.getByTestId('go-backup').click();
  await expect(page.getByTestId('backup-screen')).toBeVisible();
  await expectAccessible(page, 'the backup screen');

  await page.getByRole('button', { name: 'Mis parcelas' }).click();
  await page.getByTestId('go-federation').click();
  await page.getByTestId('consent-share_and_receive').click();
  await expect(page.getByTestId('prepare-contribution')).toBeVisible();
  await expectAccessible(page, 'the federated-learning screen');
});
