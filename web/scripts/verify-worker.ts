import { Worker } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';
import { readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import {
  solved,
  apply,
  parseAlgorithm,
  isPictureSolved,
} from '../lib/cube/model';
const file = readdirSync('dist/assets').find(
  (f) => f.startsWith('solver.worker-') && f.endsWith('.js'),
)!;
const url = pathToFileURL(process.cwd() + '/dist/assets/' + file).href;
const source = `import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:m=>parentPort.postMessage(m)};await import(${JSON.stringify(url)});parentPort.on('message',data=>self.onmessage({data}));`;
const cube = apply(solved(), parseAlgorithm("R U R' U' F2 D L2 B"));
for (const mode of ['fast', 'near', 'cfop']) {
  const w = new Worker(
    new URL('data:text/javascript,' + encodeURIComponent(source)),
  );
  const result = await new Promise<any>((resolve, reject) => {
    w.on('message', (m) => {
      if (m.type === 'result') resolve(m.result);
      if (m.type === 'error') reject(new Error(m.message));
    });
    w.on('error', reject);
    w.postMessage({ cube, mode, pictures: true });
  });
  await w.terminate();
  assert.ok(isPictureSolved(apply(cube, result.moves)));
  console.log(
    'PASS production Web Worker bundle:',
    mode,
    result.moves.length,
    'moves',
  );
}
