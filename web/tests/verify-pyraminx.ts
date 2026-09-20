import assert from 'node:assert/strict';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import {
  AXES,
  AXIS_ROTATIONS,
  COMPOSE,
  INVERSE,
  PIECES,
  ROTATIONS,
  TILES,
  TURN,
  affects,
  apply,
  dragCandidates,
  inverseMove,
  isSolved,
  moveToken,
  parseAlgorithm,
  parseMove,
  solved,
  turn,
} from '../lib/pyraminx/model';
import { prepareSolver, solvePuzzle } from '../lib/pyraminx/solver';
import {
  beginDrag,
  captureProject,
  defaultKeys,
  defaultPyraminxSettings,
  applyInstant,
  finishDrag,
  getState,
  importProject,
  loadPlayer,
  next,
  patch,
  perform,
  previous,
  redo,
  resetPuzzle,
  seek,
  setAnimator,
  settings,
  undo,
  validateProject,
} from '../lib/pyraminx/store';
import { quaternions, vertices } from '../lib/pyraminx/geometry';
import * as cube from '../lib/cube/model';
import { defaultSettings as cubeSettings } from '../lib/cube/store';
import { INITIAL_DIRECTION, INITIAL_UP } from '../lib/pyraminx/camera';
import {
  FACE_BASES,
  facesProjection,
  projectionTransform,
} from '../lib/pyraminx/projection';

assert.equal(cubeSettings().turnTolerance, 45);
assert.equal(defaultPyraminxSettings().turnTolerance, 120);
const camera = new PerspectiveCamera(31, 1, 0.01, 100);
camera.position.copy(INITIAL_DIRECTION).multiplyScalar(10);
camera.up.copy(INITIAL_UP);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld(true);
const redYellowEdge = [
  vertices[2].clone().project(camera),
  vertices[3].clone().project(camera),
];
assert.ok(Math.abs(redYellowEdge[0].y - redYellowEdge[1].y) < 1e-8);
assert.ok(redYellowEdge.every((p) => p.y < 0));
assert.deepEqual(
  FACE_BASES.map((basis, face) => ({
    face,
    visible: basis.center.dot(INITIAL_DIRECTION) > 0,
  }))
    .filter((f) => !f.visible)
    .map((f) => f.face),
  [0],
);
for (let face = 0; face < 4; face++) {
  const transform = projectionTransform(face);
  assert.ok(
    FACE_BASES[face].center.clone().applyMatrix4(transform).length() < 1e-8,
  );
  const backToWorld = FACE_BASES[face].basis
    .clone()
    .multiply(new Matrix4().makeTranslation(0, 0, 0.8));
  const point = new Vector3(0.23, -0.67, 1.18);
  assert.ok(
    point
      .clone()
      .applyMatrix4(transform)
      .applyMatrix4(backToWorld)
      .distanceTo(point) < 1e-8,
  );
  for (let sourceFace = 0; sourceFace < 4; sourceFace++)
    assert.equal(
      facesProjection(FACE_BASES[sourceFace].basis, face),
      sourceFace === face,
    );
}

assert.equal(ROTATIONS.length, 12);
assert.ok(AXIS_ROTATIONS.every((r) => r >= 0));
assert.equal(TILES.length, 36);
assert.equal(new Set(TILES.map((t) => t.id)).size, 36);
for (let f = 0; f < 4; f++)
  assert.equal(TILES.filter((t) => t.face === f).length, 9);
for (let p = 0; p < 14; p++)
  assert.equal(TILES.filter((t) => t.piece === p).length, p < 8 ? 3 : 2);
for (let r = 0; r < ROTATIONS.length; r++) {
  assert.equal(COMPOSE[r][INVERSE[r]], 0);
  vertices.forEach((v, i) =>
    assert.ok(
      v
        .clone()
        .applyQuaternion(quaternions[r])
        .distanceTo(vertices[ROTATIONS[r][i]]) < 1e-8,
    ),
  );
}
const tokens = AXES.flatMap((_, axis) =>
  (['tip', 'body', 'base'] as const).flatMap((layer) => [
    moveToken(axis, layer),
    moveToken(axis, layer, -1),
  ]),
);
for (const token of tokens) {
  assert.deepEqual(
    apply(solved(), [token, token, token]),
    solved(),
    `threefold identity ${token}`,
  );
  assert.deepEqual(
    apply(solved(), [token, inverseMove(token)]),
    solved(),
    `inverse ${token}`,
  );
  const move = parseMove(token),
    selected = PIECES.filter((_, p) => affects(p, 0, move));
  assert.equal(
    selected.length,
    move.layer === 'tip' ? 1 : move.layer === 'body' ? 5 : 9,
  );
  assert.equal(
    selected.filter((p) => p.kind === 'edge').length,
    move.layer === 'tip' ? 0 : 3,
  );
}
for (const bad of ['F', 'M', 'Rw2', 'uw', 'R2', "R''", 'u U', 'X'])
  assert.throws(() => parseMove(bad));
assert.deepEqual(parseAlgorithm('u R’ Uw'), ['u', "R'", 'Uw']);
let seed = 17946;
function random(n: number) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed % n;
}
let mixed = solved();
for (let n = 0; n < 300; n++) {
  mixed = turn(mixed, tokens[random(tokens.length)]);
  for (const tile of TILES) {
    const face = ROTATIONS[mixed.rotations[tile.piece]][tile.face],
      move = dragCandidates(mixed, tile.piece, face)[0];
    assert.ok(
      affects(tile.piece, mixed.rotations[tile.piece], move),
      `drag must include hit piece ${tile.id}`,
    );
    assert.equal(
      move.layer,
      PIECES[tile.piece].kind === 'tip'
        ? 'tip'
        : PIECES[tile.piece].kind === 'center'
          ? 'body'
          : 'base',
    );
  }
}
const start = performance.now(),
  table = prepareSolver();
assert.equal(table.edges.index.size, 11520);
assert.equal(table.centers.index.size, 81);
assert.equal(table.distance.length, 933120);
assert.ok(table.distance.every((d) => d !== 255));
let maxDepth = 0;
for (const d of table.distance) maxDepth = Math.max(maxDepth, d);
assert.equal(maxDepth, 11);
console.log(
  `Distance table: 933120 body states, max depth ${maxDepth}, ${Math.round(performance.now() - start)} ms`,
);
for (let sample = 0; sample < 150; sample++) {
  const moves = Array.from({ length: 40 }, () => tokens[random(tokens.length)]),
    state = apply(solved(), moves);
  const result = solvePuzzle(state);
  assert.ok(
    isSolved(apply(state, result.moves)),
    `mixed base/tip/body scramble ${sample}`,
  );
  assert.ok(result.bodyLength <= 11);
  assert.ok(result.moves.length <= 15);
}
setAnimator(async (a) => a.to);
resetPuzzle();
await perform('R');
await perform('Uw');
const state = getState().puzzle;
await undo();
await redo();
assert.deepEqual(getState().puzzle, state);
const project = captureProject();
assert.equal(
  validateProject({
    ...project,
    settings: { ...project.settings, turnTolerance: 120 },
  }).settings.turnTolerance,
  120,
);
assert.equal(
  validateProject({
    ...project,
    settings: { ...project.settings, turnTolerance: undefined },
  }).settings.turnTolerance,
  120,
);
assert.throws(() =>
  validateProject({
    ...project,
    settings: { ...project.settings, turnTolerance: 121 },
  }),
);
resetPuzzle();
importProject(project);
assert.deepEqual(getState().puzzle, state);
assert.throws(() => validateProject({ ...project, puzzle: 'cube' }));
assert.throws(() =>
  validateProject({
    ...project,
    partial: { axis: 4, layer: 'tip', angle: 0.1 },
  }),
);
assert.throws(() => validateProject({ ...project, cursor: 99 }));
assert.throws(() =>
  validateProject({
    ...project,
    settings: { ...project.settings, magnetStrength: NaN },
  }),
);
assert.equal(
  new Set(Object.values(defaultKeys())).size,
  Object.keys(defaultKeys()).length,
);
resetPuzzle();
loadPlayer(['U', 'r', "Bw'", 'L'], 'Test');
await next();
await next();
await previous();
assert.equal(getState().player?.index, 1);
assert.deepEqual(getState().puzzle, turn(solved(), 'U'));
await seek(4);
assert.deepEqual(getState().puzzle, apply(solved(), ['U', 'r', "Bw'", 'L']));
await seek(0);
assert.ok(isSolved(getState().puzzle));
resetPuzzle();
settings({ magnetStrength: 0 });
const drag = parseMove('R');
assert.ok(await beginDrag(drag));
finishDrag(drag, -TURN - 0.13);
assert.deepEqual(getState().puzzle, turn(solved(), 'R'));
assert.ok(Math.abs(getState().partial!.angle + 0.13) < 1e-8);
assert.ok(await beginDrag(drag));
finishDrag(drag, 0);
assert.equal(getState().partial, null);
patch({ partial: { axis: 2, layer: 'body', angle: 0.6 } });
settings({ turnTolerance: 10 });
assert.equal(await perform('U'), false);
settings({ turnTolerance: 120 });
assert.equal(await perform('U'), true);
for (const token of tokens) {
  patch({
    partial: {
      axis: (parseMove(token).axis + 1) % 4,
      layer: 'body',
      angle: TURN / 2,
    },
  });
  assert.equal(
    await perform(token),
    true,
    `maximum tolerance must allow ${token}`,
  );
  assert.equal(getState().partial, null);
}
patch({ partial: { axis: 2, layer: 'body', angle: -TURN / 2 } });
await applyInstant(['U', 'Rw']);
assert.equal(getState().partial, null);
resetPuzzle();
const sequence = cube.parseAlgorithm("R U F2 L D' B Rw M E S x y z");
assert.ok(
  cube.isSolved(
    cube.apply(
      cube.apply(cube.solved(), sequence),
      sequence.slice().reverse().map(cube.inverseMove),
    ),
  ),
);
console.log(
  'PASS: geometry, all layer mappings, 150 state-based solves, persistence, player, history, free-angle turns and cube regression.',
);
