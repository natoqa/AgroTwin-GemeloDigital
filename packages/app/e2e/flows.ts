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

export const EXPECTED_LABELS = [
  'Planta sana',
  'Posible tizón temprano',
  'Posible tizón tardío',
  'No pude identificarlo',
];

/** Registers a plot and opens a crop cycle on it, landing on the twin board. */
export async function createPlotWithCampaign(page: Page, plotName: string): Promise<void> {
  await page.getByTestId('plot-name').fill(plotName);
  await page.getByTestId('create-plot').click();

  await expect(page.getByTestId('plot-list')).toContainText(plotName);
  await page.getByTestId('open-plot').filter({ hasText: plotName }).click();

  await page.getByTestId('go-campaigns').click();
  await expect(page.getByTestId('no-campaigns')).toBeVisible();

  await page.getByTestId('planting-date').fill(TODAY);
  await page.getByTestId('start-campaign').click();

  await expect(page.getByTestId('twin-screen')).toBeVisible();
}

/** Photographs the plot and returns the label the twin board shows. */
export async function photograph(page: Page): Promise<string> {
  await page.getByTestId('go-capture').click();
  await page.getByTestId('photo-input').setInputFiles(LEAF);

  await expect(page.getByTestId('latest-snapshot')).toBeVisible();
  return ((await page.getByTestId('diagnosis-label').textContent()) ?? '').trim();
}

export async function runSlice(page: Page, plotName: string): Promise<string> {
  await createPlotWithCampaign(page, plotName);
  await expect(page.getByTestId('no-snapshots')).toBeVisible();
  return photograph(page);
}
