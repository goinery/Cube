import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE
    ? pathToFileURL(resolve(process.env.PLAYWRIGHT_MODULE)).href
    : 'playwright'
);
import { writeFile, mkdir } from 'node:fs/promises';
const output = process.env.BENCHMARK_OUTPUT
  ? resolve(process.env.BENCHMARK_OUTPUT)
  : fileURLToPath(new URL('../.performance/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'msedge',
  headless: true,
});
const results = [];
try {
  for (const id of [
    'cube-2',
    'cube-4',
    'cube-5',
    'megaminx',
    'cube',
    'pyraminx',
  ]) {
    for (const [version, url] of [
      ['before', process.env.BEFORE_URL || 'http://127.0.0.1:3101/'],
      ['after', process.env.AFTER_URL || 'http://127.0.0.1:3100/'],
    ]) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(
        ({ id }) => {
          localStorage.clear();
          localStorage.setItem('axis-active-puzzle', id);
          let seed = 12345;
          Math.random = () => {
            seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
            return seed / 4294967296;
          };
          window.__perf = { samples: [], record: false, draws: 0 };
          for (const name of [
            'drawArrays',
            'drawElements',
            'drawArraysInstanced',
            'drawElementsInstanced',
          ]) {
            const original = WebGL2RenderingContext.prototype[name];
            WebGL2RenderingContext.prototype[name] = function (...args) {
              window.__perf.draws++;
              return original.apply(this, args);
            };
          }
          const raf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = (callback) =>
            raf((time) => {
              const p = window.__perf,
                start = performance.now(),
                draws = p.draws;
              callback(time);
              if (p.record && p.draws > draws)
                p.samples.push({
                  ms: performance.now() - start,
                  draws: p.draws - draws,
                  time,
                });
            });
        },
        { id },
      );
      await page.goto(url);
      await page.waitForSelector('.viewport canvas');
      await page.evaluate(async ({ id, canonicalView }) => {
        if (id === 'cube' || id === 'pyraminx') {
          const store = await import(`/lib/${id}/store.ts`);
          window.__configure = (settings, view) =>
            store.patch({
              settings: { ...store.getState().settings, ...settings },
              view,
            });
          if (canonicalView) store.cameraActions.face(id === 'pyraminx' ? 0 : 'F');
        } else {
          const { getSession } = await import('/lib/puzzle/session.ts');
          const session = getSession(id);
          window.__configure = (settings, view) =>
            session.patch({
              settings: { ...session.state.settings, ...settings },
              view,
            });
          if (canonicalView) session.camera.face('F');
        }
        window.__configure({ autoRotate: false }, 'normal');
      }, { id, canonicalView: process.env.CANONICAL_CAMERA === '1' });
      await page.waitForTimeout(4000);
      const gpu = await page.evaluate(() => {
        const gl = document
          .querySelector('.viewport canvas')
          .getContext('webgl2');
        const info = gl.getExtension('WEBGL_debug_renderer_info');
        return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      for (const [scenario, explode, view] of [
        ['assembled', 0, 'normal'],
        ['hidden', 0, 'hidden'],
        ['exploded', 2.2, 'normal'],
      ]) {
        await page.evaluate(
          ({ explode, view }) =>
            window.__configure({ autoRotate: false, explode }, view),
          { explode, view },
        );
        await page.waitForTimeout(1400);
        await page
          .locator('.viewport')
          .screenshot({ path: `${output}/${id}-${version}-${scenario}.png` });
        await page.evaluate(
          (view) => window.__configure({ autoRotate: true }, view),
          view,
        );
        await page.waitForTimeout(500);
        await page.evaluate(() => {
          window.__perf.samples = [];
          window.__perf.record = true;
        });
        await page.waitForFunction(
          () => window.__perf.samples.length >= 180,
          null,
          { timeout: 90000 },
        );
        const samples = await page.evaluate(() => {
          window.__perf.record = false;
          return window.__perf.samples.slice(0, 180);
        });
        const times = samples.map((s) => s.ms).sort((a, b) => a - b);
        const row = {
          id,
          version,
          scenario,
          cpuMedian: times[90],
          cpuP95: times[171],
          draws: Math.round(
            samples.reduce((s, x) => s + x.draws, 0) / samples.length,
          ),
          fps: 179000 / (samples[179].time - samples[0].time),
          gpu,
          errors,
        };
        results.push(row);
        console.log(JSON.stringify(row));
        await writeFile(
          `${output}/results.json`,
          JSON.stringify(results, null, 2),
        );
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}
