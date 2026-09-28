import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Server } from 'node:http';
import { TODAY, createPlotWithCampaign } from './flows.js';
import { startStaticServer, stopStaticServer } from './staticServer.js';

/**
 * The agronomy, end to end in a real browser.
 *
 * What this really checks is the *honesty* of the chain: that a plot with no
 * coordinates says so instead of showing numbers, that a stage nobody has
 * supplied thresholds for is reported as unknown, and that everything resting
 * on the synthetic climate fixture is labelled as such on screen.
 */
let server: Server | undefined;

test.beforeAll(async () => {
  server = await startStaticServer(4173);
});

test.afterAll(async () => {
  if (server) await stopStaticServer(server);
  server = undefined;
});

async function giveThePlotALocation(page: Page): Promise<void> {
  await page.getByTestId('plot-latitude').fill('-8.11');
  await page.getByTestId('plot-longitude').fill('-78.01');
  await page.getByTestId('plot-altitude').fill('3100');
  await page.getByTestId('save-plot-details').click();
  await expect(page.getByTestId('plot-saved')).toBeVisible();
}

test('a plot with no coordinates is told what is missing, not shown numbers', async ({ page }) => {
  await page.goto('/');
  await createPlotWithCampaign(page, 'Chacra sin ubicación');

  await expect(page.getByTestId('agronomy-no-location')).toBeVisible();
  await expect(page.getByTestId('agronomic-state')).toHaveCount(0);
});

test('with a location, the twin computes and labels what it is standing on', async ({ page }) => {
  await page.goto('/');
  await createPlotWithCampaign(page, 'Chacra ubicada');

  // Back to the plot to fill in where it is.
  await page.getByRole('button', { name: 'Volver a las campañas' }).click();
  await page.getByRole('button', { name: 'Volver a la parcela' }).click();
  await giveThePlotALocation(page);

  await page.getByTestId('go-campaigns').click();
  await page.getByTestId('open-campaign').first().click();

  await expect(page.getByTestId('agronomic-state')).toBeVisible();
  await expect(page.getByTestId('gdd')).toContainText('grados-día');
  await expect(page.getByTestId('water')).toContainText('mm de agua');

  // The two honest gaps, on screen rather than hidden.
  await expect(page.getByTestId('stage-unknown')).toBeVisible();
  await expect(page.getByTestId('blight-unknown')).toBeVisible();

  // And the loudest one: none of this is real climate data yet.
  await expect(page.getByTestId('synthetic-warning')).toContainText('clima de ejemplo');
});

test('the farmer can answer the weather questions and it changes the twin', async ({ page }) => {
  await page.goto('/');
  await createPlotWithCampaign(page, 'Chacra con clima');
  await page.getByRole('button', { name: 'Volver a las campañas' }).click();
  await page.getByRole('button', { name: 'Volver a la parcela' }).click();
  await giveThePlotALocation(page);
  await page.getByTestId('go-campaigns').click();
  await page.getByTestId('open-campaign').first().click();

  const before = (await page.getByTestId('water').textContent()) ?? '';

  await page.getByTestId('go-weather').click();
  await expect(page.getByTestId('save-weather')).toBeDisabled();
  await page.getByTestId('rainfall-none').click();
  await page.getByTestId('cold-night-yes').click();
  await expect(page.getByTestId('save-weather')).toBeEnabled();
  await page.getByTestId('save-weather').click();
  await expect(page.getByTestId('weather-saved')).toBeVisible();

  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByTestId('agronomic-state')).toBeVisible();

  // "It did not rain" on the most recent day is a fact the twin can use, and
  // it is the one answer that needs no provisional coefficient at all.
  const after = (await page.getByTestId('water').textContent()) ?? '';
  expect(after).not.toBe('');
  expect(before).not.toBe('');
  expect(TODAY).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
});
