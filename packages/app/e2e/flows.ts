import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * The flows more than one spec walks through.
 *
 * They live outside the spec files on purpose: importing a spec from another
 * spec would register its tests twice.
 */
export const LEAF = fileURLToPath(new URL('./fixtures/leaf.png', import.meta.url));

export const TODAY = new Date().toISOString().slice(0, 10);

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
];

/**
 * Today as the history shows it: "28 de setiembre".
 *
 * Written out here rather than imported from the app, so a wrong month name
 * in the app is a failing test and not a shared mistake.
 */
export const TODAY_LABEL = (() => {
  const [, month, day] = TODAY.split('-').map(Number);
  return `${day ?? ''} de ${MONTHS[(month ?? 1) - 1] ?? ''}`;
})();

export const EXPECTED_LABELS = [
  'Planta sana',
  'Posible tizón temprano',
  'Posible tizón tardío',
  'No pude identificarlo',
];

/** The ISO date `days` before today, in the same UTC calendar as `TODAY`. */
export const daysAgo = (days: number): string =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

/** Registers a plot and opens a crop cycle on it, landing on the twin board. */
export async function createPlotWithCampaign(
  page: Page,
  plotName: string,
  plantingDate: string = TODAY,
): Promise<void> {
  await page.getByTestId('plot-name').fill(plotName);
  await page.getByTestId('create-plot').click();

  await expect(page.getByTestId('plot-list')).toContainText(plotName);
  await page.getByTestId('open-plot').filter({ hasText: plotName }).click();

  await page.getByTestId('go-campaigns').click();
  await expect(page.getByTestId('no-campaigns')).toBeVisible();

  await page.getByTestId('planting-date').fill(plantingDate);
  await page.getByTestId('start-campaign').click();

  await expect(page.getByTestId('twin-screen')).toBeVisible();
}

/**
 * On the capture screen, downloads the leaf-recognition model if this browser
 * does not have it yet (Phase 5, D1), and waits until the camera is offered.
 */
export async function ensureModelOnCapture(page: Page): Promise<void> {
  const download = page.getByTestId('download-model');
  const input = page.getByTestId('photo-input');
  await expect(download.or(input)).toBeAttached();
  if (await download.isVisible()) await download.click();
  await expect(input).toBeAttached({ timeout: 60_000 });
}

/** Downloads the model from the plot list, where the onboarding offers it. */
export async function downloadModel(page: Page): Promise<void> {
  await page.getByTestId('download-model').click();
  await expect(page.getByTestId('model-ready')).toBeVisible({ timeout: 60_000 });
}

/** Photographs the plot and returns the label the twin board shows. */
export async function photograph(page: Page): Promise<string> {
  await page.getByTestId('go-capture').click();
  await ensureModelOnCapture(page);
  await page.getByTestId('photo-input').setInputFiles(LEAF);

  // The first diagnosis also starts ONNX Runtime in its worker.
  await expect(page.getByTestId('latest-snapshot')).toBeVisible({ timeout: 30_000 });
  return ((await page.getByTestId('diagnosis-label').textContent()) ?? '').trim();
}

/** Fills in where the plot is, from its own screen. */
export async function giveThePlotALocation(page: Page): Promise<void> {
  await page.getByTestId('plot-latitude').fill('-8.11');
  await page.getByTestId('plot-longitude').fill('-78.01');
  await page.getByTestId('plot-altitude').fill('3100');
  await page.getByTestId('save-plot-details').click();
  await expect(page.getByTestId('plot-saved')).toBeVisible();
}

/** A located plot with an open campaign, landing on its twin board. */
export async function locatedPlotWithCampaign(
  page: Page,
  plotName: string,
  plantingDate: string = TODAY,
): Promise<void> {
  await createPlotWithCampaign(page, plotName, plantingDate);
  await page.getByRole('button', { name: 'Volver a las campañas' }).click();
  await page.getByRole('button', { name: 'Volver a la parcela' }).click();
  await giveThePlotALocation(page);
  await page.getByTestId('go-campaigns').click();
  await page.getByTestId('open-campaign').first().click();
  await expect(page.getByTestId('twin-screen')).toBeVisible();
}

export async function runSlice(page: Page, plotName: string): Promise<string> {
  await createPlotWithCampaign(page, plotName);
  await expect(page.getByTestId('no-snapshots')).toBeVisible();
  return photograph(page);
}
