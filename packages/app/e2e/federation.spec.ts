import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadModel, locatedPlotWithCampaign, photograph } from './flows.js';
import { startStaticServer, stopStaticServer } from './staticServer.js';

/**
 * Phase 6, end to end: three phones and the hub, by file (the sneakernet
 * path, CLAUDE.md §11). Each phone labels its own photos, trains, and exports
 * a signed delta; the real Python hub averages them; each phone judges the
 * aggregate against its own holdout before adopting it.
 */
const HUB = fileURLToPath(new URL('../../../services/edge-hub/', import.meta.url));
const DIST_MODEL = fileURLToPath(new URL('../dist/model/', import.meta.url));

let server: Server | undefined;

test.beforeAll(async () => {
  server = await startStaticServer(4173);
});
test.afterAll(async () => {
  if (server) await stopStaticServer(server);
  server = undefined;
});

async function openFederation(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Volver a las campañas' }).click();
  await page.getByRole('button', { name: 'Volver a la parcela' }).click();
  await page.getByRole('button', { name: 'Mis parcelas' }).click();
  await page.getByTestId('go-federation').click();
  await expect(page.getByTestId('federation-status')).toBeVisible();
}

async function backToBoard(page: Page, plot: string): Promise<void> {
  await page.getByRole('button', { name: 'Mis parcelas' }).click();
  await page.getByTestId('open-plot').filter({ hasText: plot }).click();
  await page.getByTestId('go-campaigns').click();
  await page.getByTestId('open-campaign').first().click();
}

/** Counts from the status line: "Fotos confirmadas: N (T para aprender, H para comprobar)". */
async function counts(page: Page): Promise<{ train: number; holdout: number }> {
  const text = (await page.getByTestId('federation-status').textContent()) ?? '';
  const match = /\((\d+) para aprender, (\d+) para comprobar\)/u.exec(text);
  return { train: Number(match?.[1] ?? 0), holdout: Number(match?.[2] ?? 0) };
}

/** One phone: labels photos until it has enough to train and to check, then exports. */
async function phone(browser: Browser, name: string, out: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/');
  await downloadModel(page);
  await locatedPlotWithCampaign(page, name);

  await openFederation(page);
  await page.getByTestId('consent-share_and_receive').click();
  await expect(page.getByTestId('consent-share_and_receive')).toHaveAttribute('aria-pressed', 'true');

  // The holdout is chosen by a hash of each observation's random id, so the
  // number of photos needed varies: label until both sides are populated.
  for (let taken = 0; taken < 24; taken += 1) {
    const now = await counts(page);
    if (now.train >= 4 && now.holdout >= 1) break;
    await backToBoard(page, name);
    await photograph(page);
    await page.getByTestId('label-late_blight').click();
    await expect(page.getByTestId('diagnosis-confirmed')).toBeVisible();
    await openFederation(page);
  }

  const download = page.waitForEvent('download');
  await page.getByTestId('prepare-contribution').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.agrotwin-delta$/u);
  await file.saveAs(out);
  return { context, page };
}

test('three phones, one hub: train, share, aggregate, check and adopt', async ({ browser }) => {
  test.setTimeout(240_000);
  const dir = mkdtempSync(join(tmpdir(), 'agrotwin-fed-'));
  const phones = [];
  for (const name of ['Chacra A', 'Chacra B', 'Chacra C']) {
    phones.push(await phone(browser, name, join(dir, `${name.at(-1)}.agrotwin-delta`)));
  }

  // The hub: the real FedAvg, over the three files.
  const model = join(dir, 'ronda-1.agrotwin-model');
  const report = execFileSync(
    'uv',
    [
      'run', 'python', '-m', 'edge_hub.aggregate',
      join(dir, 'A.agrotwin-delta'), join(dir, 'B.agrotwin-delta'), join(dir, 'C.agrotwin-delta'),
      '--contract', join(DIST_MODEL, 'model-contract.json'),
      '--head', join(DIST_MODEL, 'head.json'),
      '--out', model,
      '--key', join(dir, 'hub.pem'),
      '--min-contributors', '3',
    ],
    { cwd: HUB, encoding: 'utf-8' },
  );
  expect(report).toContain('ACEPTADO  A.agrotwin-delta');
  expect(report).not.toContain('RECHAZADO');

  // A tampered copy is refused on the phone, whatever the hub says.
  const tampered = readFileSync(model);
  tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 0x01;
  const forged = join(dir, 'alterado.agrotwin-model');
  writeFileSync(forged, tampered);

  for (const { page, context } of phones) {
    await page.getByTestId('import-model').setInputFiles(forged);
    await expect(page.getByTestId('federation-message')).toContainText('alterado');

    await page.getByTestId('import-model').setInputFiles(model);
    await expect(page.getByTestId('federation-message')).toContainText('Mejora aceptada');
    await expect(page.getByTestId('federation-model')).toContainText('+fed-');
    await context.close();
  }
});
