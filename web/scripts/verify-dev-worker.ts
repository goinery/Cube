import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createContext, runInContext, SourceTextModule } from 'node:vm';
import { createServer } from 'vite';
import {
  apply,
  isPictureSolved,
  isSolved,
  parseAlgorithm,
  solved,
} from '../lib/cube/model';
import type { Solution, SolveMode } from '../lib/cube/solver-core';

const temporaryRoot = resolve(tmpdir());
const cacheDir = await mkdtemp(join(temporaryRoot, 'axis-dev-worker-'));
const server = await createServer({
  cacheDir,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
});
try {
  await server.listen();
  const address = server.httpServer!.address();
  assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  type Message = {
    type: 'progress' | 'error' | 'result';
    message?: string;
    result?: Solution;
  };
  const messages: Message[] = [];
  const context = createContext({
    self: { postMessage: (message: Message) => messages.push(message) },
    performance,
    console,
    setTimeout,
    clearTimeout,
  });
  const modules = new Map<string, Promise<SourceTextModule>>();
  function load(url: string): Promise<SourceTextModule> {
    const existing = modules.get(url);
    if (existing) return existing;
    const pending = (async () => {
      assert.equal(new URL(url).origin, origin);
      const response = await fetch(url);
      assert.equal(response.status, 200, `${url}: ${response.statusText}`);
      return new SourceTextModule(await response.text(), {
        context,
        identifier: url,
        initializeImportMeta: (meta) => {
          meta.url = url;
        },
      });
    })();
    modules.set(url, pending);
    return pending;
  }
  const worker = await load(
    `${origin}/lib/cube/solver.worker.ts?worker_file&type=module`,
  );
  await worker.link((specifier, referring) =>
    load(new URL(specifier, referring.identifier).href),
  );
  await worker.evaluate({ timeout: 60000 });
  const cube = apply(solved(), parseAlgorithm("R U R' U' F2 D L2 B M x"));
  for (const mode of ['fast', 'near', 'cfop'] as SolveMode[]) {
    for (const pictures of [false, true]) {
      messages.length = 0;
      context.request = { cube, mode, pictures };
      runInContext('self.onmessage({ data: request })', context, {
        timeout: 60000,
      });
      assert.equal(
        messages.find((m) => m.type === 'error'),
        undefined,
      );
      const result = messages.find((m) => m.type === 'result')?.result;
      assert.ok(result, `${mode}: no result from the development Worker`);
      assert.ok(isSolved(apply(cube, result.moves)));
      if (pictures) assert.ok(isPictureSolved(apply(cube, result.moves)));
      console.log(
        `PASS Vite development Worker: ${mode}, pictures=${pictures}, ${result.moves.length} moves`,
      );
    }
  }
} finally {
  await server.close();
  assert.equal(dirname(resolve(cacheDir)), temporaryRoot);
  assert.ok(cacheDir.startsWith(join(temporaryRoot, 'axis-dev-worker-')));
  await rm(cacheDir, { recursive: true, force: true });
}
