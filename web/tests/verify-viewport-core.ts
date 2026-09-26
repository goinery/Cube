import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  createPuzzleSettings,
  PUZZLE_DEFAULTS,
  type StudioPuzzleId,
} from '../lib/puzzle-config';
import { definition } from '../lib/puzzle/model';
import { createFrameLoop } from '../lib/rendering/frame-loop';
import { initialView } from '../lib/rendering/viewport';

for (const id of Object.keys(PUZZLE_DEFAULTS) as StudioPuzzleId[]) {
  const a = createPuzzleSettings(id),
    b = createPuzzleSettings(id);
  a.gap = 99;
  assert.notEqual(
    b.gap,
    a.gap,
    `${id}: defaults must not share mutable settings`,
  );
  const view = initialView(id, id === 'megaminx' ? definition(id).faces : []);
  assert.ok(Math.abs(view.direction.length() - 1) < 1e-12);
  assert.ok(Math.abs(view.up.length() - 1) < 1e-12);
  assert.ok(Math.abs(view.direction.dot(view.up)) < 0.99);
}

const def = definition('megaminx');
const face = def.faces.find((face) => face.color === '#ef2921')!;
const { direction, up } = initialView(def.id, def.faces);
assert.ok(
  direction.dot(new Vector3(...face.normal)) > 1 - 1e-12,
  'initial camera must face the red face squarely',
);
for (const aspect of [0.55, 1, 1.6]) {
  const camera = new PerspectiveCamera(30, aspect, 0.01, 100);
  camera.position.copy(direction).multiplyScalar(10);
  camera.up.copy(up);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const points = face.outline.map(([x, y]) =>
    new Vector3(...face.center)
      .addScaledVector(new Vector3(...face.right), x)
      .addScaledVector(new Vector3(...face.up), y)
      .project(camera),
  );
  const bottom = [...points].sort((a, b) => a.y - b.y).slice(0, 2);
  assert.ok(
    Math.abs(bottom[0].y - bottom[1].y) < 1e-12,
    'bottom edge must be horizontal in portrait and landscape',
  );
  assert.ok(Math.abs(bottom[0].x - bottom[1].x) > 0.01);
}

const callbacks = new Map<number, FrameRequestCallback>();
let nextId = 0;
const listeners = new Set<() => void>();
const fakeDocument = {
  hidden: false,
  addEventListener: (_: string, listener: () => void) =>
    listeners.add(listener),
  removeEventListener: (_: string, listener: () => void) =>
    listeners.delete(listener),
};
const saved = {
  document: globalThis.document,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
};
Object.assign(globalThis, {
  document: fakeDocument,
  requestAnimationFrame: (callback: FrameRequestCallback) => {
    callbacks.set(++nextId, callback);
    return nextId;
  },
  cancelAnimationFrame: (id: number) => callbacks.delete(id),
});
function frame(now: number) {
  const pending = [...callbacks.values()];
  callbacks.clear();
  pending.forEach((callback) => callback(now));
}
try {
  const deltas: number[] = [];
  let animate = true;
  const loop = createFrameLoop((_now, dt) => {
    deltas.push(dt);
    if (animate) loop.invalidate();
  });
  loop.invalidate();
  loop.invalidate();
  loop.invalidate();
  assert.equal(callbacks.size, 1, 'coalesce invalidations');
  frame(1000);
  frame(1010);
  assert.equal(deltas[1], 0.01, 'continuous frames retain elapsed time');
  animate = false;
  frame(1020);
  assert.equal(callbacks.size, 0, 'idle views stop requesting frames');
  loop.invalidate();
  frame(60000);
  assert.ok(deltas.at(-1)! < 0.02, 'idle time must not jump animations');
  loop.invalidate();
  fakeDocument.hidden = true;
  listeners.forEach((listener) => listener());
  assert.equal(callbacks.size, 0, 'hidden tabs stop');
  loop.invalidate();
  assert.equal(callbacks.size, 0);
  fakeDocument.hidden = false;
  listeners.forEach((listener) => listener());
  assert.equal(callbacks.size, 1, 'visible tabs resume');
  frame(120000);
  assert.ok(deltas.at(-1)! < 0.02, 'resume resets elapsed time');
  loop.invalidate();
  loop.dispose();
  loop.invalidate();
  assert.equal(callbacks.size, 0);
  assert.equal(
    listeners.size,
    0,
    'switching puzzles releases visibility listeners',
  );
} finally {
  Object.assign(globalThis, saved);
}
console.log(
  'Viewport core: isolated defaults, red-face camera, horizontal bottom edge, demand rendering and lifecycle passed.',
);
