import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
const url = process.env.AFTER_URL || 'http://127.0.0.1:3100/';
const output = resolve('.performance/refactor');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
const results = [];
async function settle(page) {
  let stable = 0;
  for (let i = 0; i < 80 && stable < 3; i++) {
    const draws = await page.evaluate(() => window.__draws);
    await page.waitForTimeout(150);
    stable = await page.evaluate(() => window.__draws) === draws ? stable + 1 : 0;
  }
  assert.equal(stable, 3, 'view must stop drawing after transitions');
}
try {
  for (const id of ['cube-2', 'cube', 'cube-4', 'cube-5', 'megaminx', 'pyraminx']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(id => {
      localStorage.clear(); localStorage.setItem('axis-active-puzzle', id);
      window.__draws = 0;
      for (const name of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const original = WebGL2RenderingContext.prototype[name];
        WebGL2RenderingContext.prototype[name] = function (...args) { window.__draws++; return original.apply(this, args); };
      }
    }, id);
    await page.goto(url);
    await page.waitForSelector('.viewport canvas');
    await page.evaluate(async id => {
      if (id === 'cube' || id === 'pyraminx') {
        const store = await import(`/lib/${id}/store.ts`);
        window.__state = () => JSON.stringify(id === 'cube' ? store.getState().cube : store.getState().puzzle);
        window.__set = (settings, view) => store.patch({ settings: { ...store.getState().settings, ...settings }, view });
        window.__reset = () => { (store.resetCube || store.resetPuzzle)(); store.cameraActions.reset(); };
        window.__ready = () => store.getState().ready;
      } else {
        const { getSession } = await import('/lib/puzzle/session.ts');
        const session = getSession(id);
        window.__state = () => JSON.stringify(session.state.puzzle);
        window.__set = (settings, view) => session.patch({ settings: { ...session.state.settings, ...settings }, view });
        window.__reset = () => session.camera.reset();
        window.__ready = () => true;
      }
      window.__set({ autoRotate: false }, 'normal');
    }, id);
    await page.waitForFunction(() => window.__ready());
    await settle(page);
    await page.screenshot({ path: `${output}/${id}-desktop.png` });
    const canvas = page.locator('.viewport canvas').first();
    const box = await canvas.boundingBox();
    const original = await page.evaluate(() => window.__state());
    let dragged = false;
    for (const [x, y, dx, dy] of [[0.54, 0.44, 260, 0], [0.45, 0.53, 0, -260], [0.5, 0.58, 260, 0]]) {
      await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * x + dx, box.y + box.height * y + dy, { steps: 15 });
      await page.mouse.up();
      await settle(page);
      if (await page.evaluate(() => window.__state()) !== original) { dragged = true; break; }
    }
    assert.ok(dragged, `${id}: pointer drag must turn a layer`);
    for (const view of ['hidden', id === 'cube' || id === 'pyraminx' ? 'six' : 'all', 'net', 'normal']) {
      await page.evaluate(view => window.__set({}, view), view);
      await settle(page);
    }
    await page.evaluate(() => window.__set({ explode: 2.2 }, 'normal'));
    await settle(page);
    await page.evaluate(() => window.__set({ explode: 0, minimal: true }, 'normal'));
    await settle(page);
    await page.evaluate(() => { window.__set({ minimal: false }, 'normal'); window.__reset(); });
    await settle(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await settle(page);
    await page.screenshot({ path: `${output}/${id}-mobile.png` });
    assert.equal(await page.locator('.fatal-error, .webgl-error').count(), 0);
    assert.deepEqual(errors, []);
    const row = { id, pointerDrag: true, viewModes: true, explodeAndMinimal: true, mobile: true, errors };
    results.push(row); console.log(JSON.stringify(row));
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  for (const index of [0, 2, 3, 4, 5, 1, 4, 1]) {
    await page.locator('.puzzle-switch-trigger').click();
    await page.locator('.puzzle-switch-menu button').nth(index).click();
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('.viewport').count(), 1);
    assert.equal(await page.locator('.fatal-error, .webgl-error').count(), 0);
  }
  assert.deepEqual(errors, []);
  await page.close();
  results.push({ repeatedSwitches: 8, errors });
  await writeFile(`${output}/browser-results.json`, JSON.stringify(results, null, 2));
} finally { await browser.close(); }
