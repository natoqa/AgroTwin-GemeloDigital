/**
 * Indicative diagnosis latency, capture → result on screen (RNF-01).
 *
 * NOT a validation of RNF-01: that needs the reference device (CLAUDE.md §12).
 * This runs the production build in Playwright's Chromium on the development
 * machine, with the CPU throttled through the DevTools protocol, and reports
 * what it measured, labelled as such, for docs/nfr/measurements.md.
 *
 * Usage (after `pnpm --filter @agrotwin/app build`):
 *   node scripts/measure-latency.mts [throttle]
 */
import { chromium, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { startStaticServer, stopStaticServer } from '../e2e/staticServer.ts';

const throttle = Number(process.argv[2] ?? '4');
const LEAF = fileURLToPath(new URL('../e2e/fixtures/leaf.png', import.meta.url));
const RUNS = 5;

const server = await startStaticServer(4174);
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'] });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });

await page.goto('http://127.0.0.1:4174/');
await page.getByTestId('download-model').click();
await page.getByTestId('model-ready').waitFor({ timeout: 120_000 });

await page.getByTestId('plot-name').fill('Medición');
await page.getByTestId('create-plot').click();
await page.getByTestId('open-plot').click();
await page.getByTestId('go-campaigns').click();
await page.getByTestId('planting-date').fill(new Date().toISOString().slice(0, 10));
await page.getByTestId('start-campaign').click();

const timings: number[] = [];
for (let run = 0; run < RUNS; run += 1) {
  await page.getByTestId('go-capture').click();
  await page.getByTestId('photo-input').waitFor({ state: 'attached' });
  const started = Date.now();
  await page.getByTestId('photo-input').setInputFiles(LEAF);
  await page.getByTestId('twin-screen').waitFor();
  await page.getByTestId('latest-snapshot').waitFor();
  timings.push(Date.now() - started);
}

const warm = [...timings.slice(1)].sort((a, b) => a - b);
console.log(
  JSON.stringify({
    throttle,
    runsMs: timings,
    // The first photograph also compiles the WASM and creates the session.
    firstMs: timings[0],
    warmMedianMs: warm[Math.floor(warm.length / 2)],
  }),
);

await browser.close();
await stopStaticServer(server);
