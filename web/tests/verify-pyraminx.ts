import assert from 'node:assert/strict';
import {
  Matrix4,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
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
  releaseDrag,
  resetPuzzle,
  seek,
  setAnimator,
  setAlignmentAnimator,
  settings,
  undo,
  validateProject,
  type Animation,
  type PartialTurn,
} from '../lib/pyraminx/store';
import { quaternions, vertices } from '../lib/pyraminx/geometry';
import {
  applyAlignment,
  captureAlignment,
  updateDragTransition,
  type DragMotion,
} from '../lib/pyraminx/motion';
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
function piecePose(orientation: number, piece: number) {
  const root = new Object3D();
  root.quaternion.copy(quaternions[orientation]);
  root.position
    .set(0.4 + piece * 0.13, -0.9 + piece * 0.09, 0.7 - piece * 0.12)
    .applyQuaternion(root.quaternion);
  return root;
}
function rotatePose(root: Object3D, rotation: Quaternion) {
  root.position.applyQuaternion(rotation);
  root.quaternion.premultiply(rotation);
}
function samePose(a: Object3D, b: Object3D, reason: string) {
  assert.ok(a.position.distanceTo(b.position) < 1e-7, `${reason}: position`);
  assert.ok(
    a.quaternion.angleTo(b.quaternion) < 1e-6,
    `${reason}: orientation`,
  );
}
const motionState = apply(solved(), ['R', 'Uw', "L'", 'b']);
for (const oldToken of ['R', 'Rw', 'r'])
  for (const newToken of ['U', 'Uw', 'u']) {
    const oldMove = parseMove(oldToken),
      newMove = parseMove(newToken);
    const partial = { ...oldMove, angle: 0.6 };
    const visual = captureAlignment(motionState, partial);
    const oldRotation = new Quaternion().setFromAxisAngle(
      vertices[oldMove.axis].clone().normalize(),
      partial.angle,
    );
    const newRotation = new Quaternion().setFromAxisAngle(
      vertices[newMove.axis].clone().normalize(),
      -TURN,
    );
    const committed = turn(motionState, newToken);
    const nextPartial = { ...newMove, angle: -0.37 };
    visual.progress = 0.4;
    const combined = captureAlignment(motionState, nextPartial, visual);
    const nextRotation = new Quaternion().setFromAxisAngle(
      vertices[newMove.axis].clone().normalize(),
      nextPartial.angle,
    );
    for (let piece = 0; piece <= PIECES.length; piece++) {
      const core = piece === PIECES.length;
      const beforeOrientation = core
        ? motionState.frame
        : motionState.rotations[piece];
      const afterOrientation = core
        ? committed.frame
        : committed.rotations[piece];
      const oldAffected = core
        ? oldMove.layer === 'base'
        : affects(piece, beforeOrientation, oldMove);
      const newAffected = core
        ? newMove.layer === 'base'
        : affects(piece, beforeOrientation, newMove);
      const visible = piecePose(beforeOrientation, piece);
      if (oldAffected) rotatePose(visible, oldRotation);
      const captured = piecePose(beforeOrientation, piece);
      applyAlignment(captured, visual.rotations[piece], 0);
      samePose(captured, visible, 'no jump when a conflicting turn starts');

      const beforeCommit = piecePose(beforeOrientation, piece);
      applyAlignment(beforeCommit, visual.rotations[piece], visual.progress);
      if (newAffected) rotatePose(beforeCommit, newRotation);
      const afterCommit = piecePose(afterOrientation, piece);
      applyAlignment(afterCommit, visual.rotations[piece], visual.progress);
      samePose(
        beforeCommit,
        afterCommit,
        'new turn commits while old layer is still aligning',
      );

      const beforeRetarget = piecePose(beforeOrientation, piece);
      applyAlignment(beforeRetarget, visual.rotations[piece], visual.progress);
      if (newAffected) rotatePose(beforeRetarget, nextRotation);
      const afterRetarget = piecePose(beforeOrientation, piece);
      applyAlignment(afterRetarget, combined.rotations[piece], 0);
      samePose(
        beforeRetarget,
        afterRetarget,
        'rapid successive handoffs preserve the visible pose',
      );

      const finished = piecePose(afterOrientation, piece);
      applyAlignment(finished, visual.rotations[piece], 1);
      samePose(
        finished,
        piecePose(afterOrientation, piece),
        'alignment ends on the current logical pose',
      );
    }
  }
const dragMotion: DragMotion = {
  angle: 0,
  initial: 0,
  targetAngle: 0.8,
  transition: { start: 0, duration: 120 },
};
updateDragTransition(dragMotion, 30);
assert.ok(
  dragMotion.angle > 0 && dragMotion.angle < dragMotion.targetAngle,
  'new layer moves before old alignment completes',
);
dragMotion.targetAngle = 1.2;
updateDragTransition(dragMotion, 90);
assert.ok(
  dragMotion.angle > 0.8 && dragMotion.angle < 1.2,
  'transition follows the latest pointer target',
);
updateDragTransition(dragMotion, 120);
assert.equal(dragMotion.angle, 1.2);
assert.equal(dragMotion.transition, undefined);
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
assert.ok(beginDrag(drag));
finishDrag(drag, -TURN - 0.13);
assert.deepEqual(getState().puzzle, turn(solved(), 'R'));
assert.ok(Math.abs(getState().partial!.angle + 0.13) < 1e-8);
assert.ok(beginDrag(drag));
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
const pending: { animation: Animation; resolve: (angle: number) => void }[] =
  [];
const alignments: {
  partial: PartialTurn;
  duration: number;
  resolve: () => void;
}[] = [];
setAlignmentAnimator(
  (partial, duration) =>
    new Promise((resolve) => alignments.push({ partial, duration, resolve })),
);
setAnimator(
  (animation) => new Promise((resolve) => pending.push({ animation, resolve })),
  () => {
    const settling = pending.find(({ animation }) => animation.layerTurn)!;
    finishDrag(settling.animation.move, settling.animation.from + 0.15);
  },
);
settings({ speed: 3, magnetStrength: 0 });
patch({ partial: { axis: drag.axis, layer: drag.layer, angle: 0.6 } });
const otherLayer = parseMove('U');
const handoff = beginDrag(otherLayer);
assert.equal(handoff, true);
assert.equal(pending.length, 0);
assert.equal(alignments.length, 1);
assert.equal(alignments[0].partial.axis, drag.axis);
assert.equal(alignments[0].partial.angle, 0.6);
assert.ok(alignments[0].duration >= 180);
assert.equal(getState().busy, true);
assert.equal(
  getState().dragging,
  true,
  'the new layer must be draggable before the old layer finishes aligning',
);
assert.equal(getState().partial, null);
assert.deepEqual(getState().history, []);
assert.equal(getState().currentMove, 'U');
alignments.shift()!.resolve();
await Promise.resolve();
assert.equal(getState().dragging, true);
finishDrag(otherLayer, 0);
resetPuzzle();

// A new gesture can hold an in-flight magnetic turn without committing it twice.
settings({ magnetStrength: 1 });
assert.ok(beginDrag(drag));
const releasing = releaseDrag(drag, -TURN - 0.35, 0);
assert.equal(pending[0].animation.magnetic, true);
assert.equal(getState().settling, true);
const nextDrag = beginDrag(otherLayer);
const heldPuzzle = getState().puzzle;
const heldPartial = getState().partial;
assert.deepEqual(heldPuzzle, turn(solved(), 'R'));
assert.equal(getState().settling, false);
assert.equal(nextDrag, true);
assert.equal(pending.length, 1);
assert.equal(alignments.length, 1);
pending.shift()!.resolve(-TURN);
await releasing;
assert.deepEqual(getState().puzzle, heldPuzzle);
assert.deepEqual(getState().history, ['R']);
assert.equal(getState().partial, heldPartial);
assert.equal(getState().busy, true);
assert.equal(getState().dragging, true);
// Releasing the new layer before the old visual alignment ends must remain valid.
finishDrag(otherLayer, -0.3);
const newPartial = getState().partial;
alignments.shift()!.resolve();
await Promise.resolve();
assert.equal(getState().partial, newPartial);
assert.ok(Math.abs(newPartial!.angle + 0.3) < 1e-8);
assert.deepEqual(getState().history, ['R']);
resetPuzzle();
assert.ok(beginDrag(drag));
const sameLayerRelease = releaseDrag(drag, -0.5, 0);
assert.ok(beginDrag(drag));
assert.equal(
  pending.length,
  1,
  'same-layer takeover must not add an alignment',
);
assert.equal(alignments.length, 0);
assert.ok(Math.abs(getState().partial!.angle + 0.35) < 1e-8);
assert.equal(getState().dragging, true);
pending.shift()!.resolve(0);
await sameLayerRelease;
assert.equal(getState().dragging, true);
finishDrag(drag, 0);
resetPuzzle();

// The same takeover must work through turn buttons and keyboard shortcuts.
assert.ok(beginDrag(drag));
const manualRelease = releaseDrag(drag, -0.5, 0);
const manualTurn = perform('U');
assert.equal(alignments.length, 1);
assert.equal(
  pending.length,
  2,
  'the new turn must animate concurrently with alignment',
);
assert.equal(pending[1].animation.move.axis, otherLayer.axis);
pending.shift()!.resolve(0);
await manualRelease;
pending.shift()!.resolve(-TURN);
await Promise.resolve();
assert.deepEqual(
  getState().puzzle,
  turn(solved(), 'U'),
  'finished new turn must stay in place while old alignment continues',
);
alignments.shift()!.resolve();
assert.equal(await manualTurn, true);
assert.deepEqual(getState().puzzle, turn(solved(), 'U'));
assert.deepEqual(getState().history, ['U']);
assert.equal(getState().busy, false);
assert.equal(getState().settling, false);
resetPuzzle();
settings({ magnetStrength: 0 });
assert.ok(beginDrag(otherLayer));
const earlyRelease = releaseDrag(otherLayer, 0.2, 0, 1.4);
assert.equal(pending[0].animation.from, 0.2);
assert.equal(pending[0].animation.to, 1.4);
assert.equal(pending[0].animation.magnetic, false);
assert.deepEqual(getState().history, []);
pending.shift()!.resolve(1.4);
await earlyRelease;
assert.deepEqual(getState().puzzle, turn(solved(), "U'"));
setAnimator(async (a) => a.to);
setAlignmentAnimator(async () => {});
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
  'PASS: geometry, all layer mappings, 150 state-based solves, persistence, player, history, free-angle turns, animated layer handoffs and cube regression.',
);
