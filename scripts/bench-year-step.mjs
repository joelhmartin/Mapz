// Measure how long a year step takes, so performance changes can be judged on numbers.
//
//   npx vite preview &            # or point --url at the deployed site
//   npm run bench [-- --url http://localhost:4173/ --runs 3 --throttle]
//
// For each run it opens a fresh page (with `?bench`, which exposes the map object), then
// reports medians of:
//   repaint   a repaint with nothing changed (the floor set by the GPU or software renderer)
//   reload    a year step until every year-dependent source has finished reloading (worker time,
//             plus waiting for the frame the step lands in)
//   step      a year step, by keyboard, until the map is idle (what a user waits for)
//   crossing  a step across an era boundary until idle (loads a new era slice)
// --throttle emulates a 120 ms, 8 Mbit/s connection. Needs Playwright with Chromium (preinstalled
// in the dev container; it is looked up in the global node_modules if it is not a dependency).

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? fallback : args[i + 1];
};
const BASE = opt('url', 'http://localhost:4173/');
const RUNS = Number(opt('runs', 3));
const THROTTLE = args.includes('--throttle');

let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = createRequire(`${root}/`)('playwright'));
}

const median = (a) => Math.round([...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]);
const url = (year, at) => `${BASE}${BASE.includes('?') ? '&' : '?'}bench&year=${year}&at=${at}`;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function open(year) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  if (THROTTLE) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 120,
      downloadThroughput: 1e6,
      uploadThroughput: 5e5,
    });
  }
  await page.goto(url(year, '20,30,2.3'));
  await page.waitForFunction(() => window.__map?.loaded() && window.__map.getSource('battles'), null, {
    timeout: 120000,
  });
  await page.waitForTimeout(4000);
  await page.locator('.slider').focus();
  return page;
}

// Steps the year with the arrow key (as a user does) and times it in the page.
const step = (page, until) =>
  page.evaluate(
    (until) =>
      new Promise((resolve) => {
        const m = window.__map;
        const t0 = performance.now();
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        if (until === 'idle') {
          setTimeout(() => m.once('idle', () => resolve(performance.now() - t0)), 0);
          return;
        }
        // The key goes through React and an animation frame before the map sees the new year, so
        // wait for that first; then for every source whose layers read the year (the active era
        // slice and the overlays) to finish reloading.
        const before = m.getGlobalState().year;
        const reloaded = () => {
          const sources = Object.keys(m.getStyle().sources).filter(
            (s) => s === `era-${m.getGlobalState().era}` || ['battles', 'wars', 'movements'].includes(s),
          );
          return sources.every((s) => m.isSourceLoaded(s));
        };
        const check = () =>
          m.getGlobalState().year !== before && reloaded() ? resolve(performance.now() - t0) : setTimeout(check, 2);
        setTimeout(check, 2);
      }),
    until,
  );

const idleAgain = (page) =>
  page.evaluate(() => new Promise((r) => (window.__map.triggerRepaint(), window.__map.once('idle', r))));

const results = { repaint: [], reload: [], step: [], crossing: [] };
for (let run = 0; run < RUNS; run++) {
  const page = await open(1310);
  for (let i = 0; i < 6; i++) {
    results.repaint.push(
      await page.evaluate(
        () =>
          new Promise((r) => {
            const t0 = performance.now();
            window.__map.triggerRepaint();
            window.__map.once('idle', () => r(performance.now() - t0));
          }),
      ),
    );
    results.reload.push(await step(page, 'sources'));
    await idleAgain(page);
    results.step.push(await step(page, 'idle'));
  }
  await page.close();
  for (const year of [1590, 1890]) {
    const p = await open(year);
    results.crossing.push(await step(p, 'idle'));
    await p.close();
  }
}
await browser.close();

console.log(`${BASE}${THROTTLE ? ' (throttled)' : ''}, ${RUNS} runs, medians in ms:`);
for (const [k, v] of Object.entries(results)) console.log(`  ${k.padEnd(9)} ${median(v)}  (${v.length} samples)`);
