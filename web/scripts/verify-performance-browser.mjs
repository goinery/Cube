import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.AXIS_PLAYWRIGHT_MODULE || 'playwright',
);
const output = resolve(process.env.AXIS_PERF_OUTPUT || '.performance/current');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error(error.stack);
  });
  await page.addInitScript(() => {
    window.perfCounts = { frames: 0, draws: 0, uploads: 0 };
    const raf = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) =>
      raf.call(window, (time) => {
        window.perfCounts.frames++;
        callback(time);
      });
    for (const name of [
      'drawElements',
      'drawArrays',
      'drawElementsInstanced',
      'drawArraysInstanced',
      'texImage2D',
      'texSubImage2D',
    ]) {
      const original = WebGL2RenderingContext.prototype[name];
      WebGL2RenderingContext.prototype[name] = function (...args) {
        window.perfCounts[name.startsWith('tex') ? 'uploads' : 'draws']++;
        return original.apply(this, args);
      };
    }
  });
  await page.goto(process.env.AXIS_PERF_URL || 'http://127.0.0.1:3017/');
  await page.waitForSelector('.viewport canvas');
  await page.evaluate(async () => {
    // Follow Vite's current module URL, including its HMR timestamp.
    const url = performance
      .getEntriesByType('resource')
      .find((e) => /\/lib\/cube\/store\.ts(?:\?|$)/.test(e.name))?.name;
    window.cubeStore = await import(url || '/lib/cube/store.ts');
  });
  await page.waitForFunction(() => window.cubeStore.getState().ready);
  await page.waitForTimeout(4000);
  const metrics = {};
  async function sample(name, duration = 1200) {
    await page.evaluate(() => {
      window.perfCounts = { frames: 0, draws: 0, uploads: 0 };
    });
    await page.waitForTimeout(duration);
    metrics[name] = await page.evaluate(() => ({ ...window.perfCounts }));
  }
  await page
    .locator('.stage')
    .screenshot({ path: resolve(output, 'assembled.png') });
  await sample('idle');
  await page.evaluate(async () =>
    window.cubeStore.settings({ autoRotate: true }),
  );
  await sample('rotating');
  assert.ok(
    metrics.rotating.draws > 0,
    'Automatic rotation must wake rendering',
  );
  await page.evaluate(async () => {
    const s = window.cubeStore;
    s.settings({ autoRotate: false });
    s.cameraActions.reset();
  });
  await page.waitForTimeout(2000);
  await page.keyboard.press('r');
  await page.waitForFunction(() => {
    const s = window.cubeStore.getState();
    return !s.busy && s.cursor === 1;
  });
  await page.evaluate(async () => {
    const s = window.cubeStore;
    s.settings({ explode: 3 });
    s.cameraActions.fit();
  });
  await page.waitForTimeout(3000);
  await page
    .locator('.stage')
    .screenshot({ path: resolve(output, 'exploded.png') });
  await sample('explodedIdle');
  await page.evaluate(async () => {
    const s = window.cubeStore;
    s.settings({ explode: 0, magnetStrength: 0 });
    s.finishLayerTurn(0, 1, 0.38);
    s.cameraActions.reset();
  });
  await page.waitForTimeout(3000);
  await page
    .locator('.stage')
    .screenshot({ path: resolve(output, 'partial.png') });
  await sample('partialIdle');
  await page.evaluate(async () =>
    window.cubeStore.settings({ magnetStrength: 1 }),
  );
  await page.waitForFunction(() => {
    const s = window.cubeStore.getState();
    return !s.busy && !s.partialTurns;
  });
  await page.waitForTimeout(1800);
  await sample('settledIdle');
  assert.deepEqual(errors, [], 'Browser must have no uncaught errors');
  if (process.env.AXIS_PERF_ASSERT === '1') {
    for (const name of ['idle', 'explodedIdle', 'partialIdle', 'settledIdle'])
      assert.equal(metrics[name].draws, 0, `${name} must stop drawing`);
  }
  await writeFile(
    resolve(output, 'metrics.json'),
    JSON.stringify(metrics, null, 2),
  );
  console.log(JSON.stringify(metrics, null, 2));
} finally {
  await browser.close();
}
