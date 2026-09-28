import { expect, test } from '@playwright/test';
import type { Server } from 'node:http';
import { createPlotWithCampaign, daysAgo, locatedPlotWithCampaign } from './flows.js';
import { startStaticServer, stopStaticServer } from './staticServer.js';

/**
 * The TwinBoard of Phase 4, end to end: the Advisor's list, the farmer telling
 * the twin what happened, and the three what-if questions of CLAUDE.md §8.3.
 *
 * What these check is mostly honesty on screen: that weak advice says it is
 * weak, that the fungicide question says why it cannot be answered, and that
 * the harvest date says what it is made of.
 */
let server: Server | undefined;

test.beforeAll(async () => {
  server = await startStaticServer(4173);
});

test.afterAll(async () => {
  if (server) await stopStaticServer(server);
  server = undefined;
});

test('the board leads with what to do, and says when it is not sure', async ({ page }) => {
  await page.goto('/');
  await locatedPlotWithCampaign(page, 'Chacra con consejos');

  const list = page.getByTestId('recommendations');
  await expect(list).toBeVisible();
  // Nothing photographed and nothing answered yet: the twin asks for both.
  await expect(page.getByTestId('recommendation-take_photo')).toBeVisible();
  await expect(page.getByTestId('recommendation-report_weather')).toBeVisible();

  // The water advice rests on the synthetic climate, and says so in words.
  const water = page.getByTestId('recommendation-water_ok');
  await expect(water).toContainText('poca certeza');
  await expect(water).toContainText('uso un clima de ejemplo');
  await expect(page.getByTestId('synthetic-warning')).toBeVisible();
});

test('telling the twin about watering and weather changes its advice and history', async ({
  page,
}) => {
  await page.goto('/');
  // Planted a few days ago, so "yesterday" falls inside the campaign.
  await locatedPlotWithCampaign(page, 'Chacra regada', daysAgo(5));

  await page.getByTestId('irrigate').click();
  await expect(page.getByTestId('irrigation-saved')).toBeVisible();
  await expect(page.getByTestId('snapshot-history')).toContainText('Regaste');

  await page.getByTestId('go-weather').click();
  await page.getByTestId('rainfall-a_lot').click();
  await page.getByTestId('cold-night-no').click();
  await page.getByTestId('save-weather').click();
  await expect(page.getByTestId('weather-saved')).toBeVisible();
  await page.getByRole('button', { name: 'Volver' }).click();

  await expect(page.getByTestId('snapshot-history')).toContainText('llovió mucho');
  await expect(page.getByTestId('recommendation-report_weather')).toHaveCount(0);
});

test('the what-if questions answer, and refuse honestly where they cannot', async ({ page }) => {
  await page.goto('/');
  await locatedPlotWithCampaign(page, 'Chacra simulada');

  const result = page.getByTestId('scenario-result');

  await page.getByTestId('scenario-no_irrigation').click();
  await expect(result).toContainText('mm de agua');
  await expect(result).toContainText('año típico');
  await page.getByTestId('scenario-days-14').click();
  await expect(page.getByTestId('scenario-days-14')).toHaveAttribute('aria-pressed', 'true');
  await expect(result).toContainText('14 días');

  await page.getByTestId('scenario-fungicide_today').click();
  await expect(result).toContainText('nadie mide cuántas horas se moja la hoja');

  await page.getByTestId('scenario-harvest_date').click();
  await expect(result).toContainText('Fecha aproximada de cosecha');
  await expect(result).toContainText('en 130 días');
  await expect(result).toContainText('no con el clima de este año');
});

test('a plot without a location is asked for one, first', async ({ page }) => {
  await page.goto('/');
  await createPlotWithCampaign(page, 'Chacra sin sitio');

  await expect(page.getByTestId('recommendations').locator('li').first()).toHaveAttribute(
    'data-testid',
    'recommendation-add_location',
  );

  await page.getByTestId('scenario-harvest_date').click();
  await expect(page.getByTestId('scenario-result')).toContainText('dónde queda tu parcela');
});
