import assert from 'node:assert/strict';
import { Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import {
  FACE,
  FACES,
  solved,
  turn,
  apply,
  type CubeState,
  type Face,
} from '../lib/cube/model';
import {
  QUARTER,
  stepMagnet,
  canTurn,
  canTurnSequence,
  heldAngle,
  type PartialTurns,
} from '../lib/cube/interaction';
import { createTileGeometry } from '../lib/cube/geometry';
import { projectionTransform, facesProjection } from '../lib/cube/projection';
import {
  getState,
  settings,
  setAnimator,
  finishLayerTurn,
  perform,
  undo,
  redo,
  restoreHistory,
  applyInstant,
  loadPlayer,
  play,
  seek,
  playerPrevious,
  runAlgorithm,
} from '../lib/cube/store';
import {
  captureProject,
  validateProject,
  loadProject,
} from '../lib/cube/persistence';
import { cubeTools } from '../lib/cube/webmcp';

function near(a: number, b: number, tolerance = 1e-8) {
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
}
function rotation(axis: number, angle: number) {
  return new Matrix4().makeRotationAxis(
    new Vector3().setComponent(axis, 1),
    angle,
  );
}
function matrices(cube: CubeState, partial: PartialTurns | null = null) {
  return new Map(
    cube.flatMap((piece) => {
      const body = new Matrix4()
        .makeTranslation(...piece.pos)
        .multiply(
          new Matrix4().makeBasis(
            ...(piece.basis.map((v) => new Vector3(...v)) as [
              Vector3,
              Vector3,
              Vector3,
            ]),
          ),
        );
      if (partial)
        body.premultiply(
          rotation(
            partial.axis,
            heldAngle(partial, partial.axis, piece.pos[partial.axis]),
          ),
        );
      return piece.stickers.map((sticker) => {
        const f = FACE[sticker.face];
        return [
          sticker.id,
          body
            .clone()
            .multiply(
              new Matrix4().makeTranslation(
                ...(f.n.map((n) => n * 0.5) as [number, number, number]),
              ),
            )
            .multiply(
              new Matrix4().makeBasis(
                new Vector3(...f.r),
                new Vector3(...f.u),
                new Vector3(...f.n),
              ),
            ),
        ] as const;
      });
    }),
  );
}
function sameMatrices(
  actual: Map<string, Matrix4>,
  expected: Map<string, Matrix4>,
) {
  for (const [id, matrix] of expected)
    matrix.elements.forEach((v, i) => near(actual.get(id)!.elements[i], v));
}

const material = new MeshBasicMaterial();
for (let row = 0; row < 3; row++)
  for (let col = 0; col < 3; col++) {
    const geometry = createTileGeometry({ row, col }),
      mesh = new Mesh(geometry, material);
    mesh.updateMatrixWorld(true);
    const hits = (x: number, y: number) =>
      new Raycaster(
        new Vector3(x, y, 1),
        new Vector3(0, 0, -1),
      ).intersectObject(mesh).length > 0;
    assert.ok(hits(0, 0));
    for (const [x, y] of [
      [-0.45, 0.45],
      [0.45, 0.45],
      [0.45, -0.45],
      [-0.45, -0.45],
    ]) {
      const rounded =
        (row === 1 && col === 1) ||
        (col === 1 && (row === 0 ? y < 0 : y > 0)) ||
        (row === 1 && (col === 0 ? x > 0 : x < 0));
      assert.equal(hits(x, y), !rounded, `Cap ${row},${col}: corner ${x},${y}`);
    }
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
      assert.ok(uv.getX(i) >= -1e-6 && uv.getX(i) <= 1.000001);
      assert.ok(uv.getY(i) >= -1e-6 && uv.getY(i) <= 1.000001);
    }
    geometry.dispose();
  }
material.dispose();
console.log(
  'PASS reference cap silhouettes and image UVs for all nine face positions',
);

const base = matrices(solved());
for (const face of FACES) {
  assert.equal(
    [...base.values()].filter((world) => facesProjection(world, face)).length,
    9,
  );
  const projected = projectionTransform(face, 1.5, true),
    mirrored = projectionTransform(face, 1.5, false);
  for (const world of base.values())
    if (facesProjection(world, face)) {
      const tile = projected.clone().multiply(world);
      near(new Vector3().setFromMatrixPosition(tile).z, 0);
      near(new Vector3(0, 0, 1).transformDirection(tile).z, -1);
      const pair = mirrored.clone().multiply(world),
        a = new Vector3().setFromMatrixPosition(tile),
        b = new Vector3().setFromMatrixPosition(pair);
      near(b.z, 0);
      near(b.x, -a.x);
      near(b.y, a.y);
    }
}
const held: PartialTurns = { axis: 0, angles: [0, 0, Math.PI / 4] };
const tilted = matrices(solved(), held);
for (const face of ['D', 'B'] as Face[]) {
  const visible = [...tilted.values()].filter((world) =>
    facesProjection(world, face),
  );
  assert.equal(visible.length, 12);
  const transformed = visible.map((world) =>
    projectionTransform(face, 1.5, true).multiply(world),
  );
  assert.ok(
    transformed.some(
      (world) => Math.abs(new Vector3().setFromMatrixPosition(world).z) > 0.1,
    ),
  );
}
console.log(
  'PASS live per-tile hidden-face projection, underside deformation and outside orientation',
);

function spring(
  strength: number,
  damping: number,
  fps: number,
  seconds: number,
) {
  let angle = 0.6,
    velocity = 0,
    minimum = angle;
  for (let i = 0; i < Math.round(fps * seconds); i++) {
    ({ angle, velocity } = stepMagnet(
      angle,
      velocity,
      0,
      1 / fps,
      strength,
      damping,
    ));
    assert.ok(Number.isFinite(angle) && Number.isFinite(velocity));
    minimum = Math.min(minimum, angle);
  }
  return { angle, velocity, minimum };
}
assert.deepEqual(stepMagnet(0.413, 10, QUARTER, 1 / 30, 0, 0.7), {
  angle: 0.413,
  velocity: 0,
});
assert.ok(spring(2, 1, 60, 0.1).angle < spring(0.2, 1, 60, 0.1).angle);
assert.ok(spring(1, 0.2, 60, 1).minimum < -0.2);
assert.ok(spring(1, 1.4, 60, 1).minimum >= 0);
for (const strength of [0.05, 1, 2])
  for (const damping of [0.05, 0.7, 2]) {
    for (const fps of [20, 30, 60, 144]) {
      const result = spring(strength, damping, fps, 60);
      near(result.angle, 0, 0.0001);
      near(result.velocity, 0, 0.003);
    }
    near(
      spring(strength, damping, 30, 0.5).angle,
      spring(strength, damping, 144, 0.5).angle,
      0.006,
    );
  }
console.log(
  'PASS adjustable spring strength/damping, zero-force hold, rebound, stability and frame-rate independence',
);

setAnimator(async () => {});
settings({ magnetStrength: 0, magnetDamping: 0.35 });
for (let axis = 0; axis < 3; axis++)
  for (const layer of [-1, 0, 1]) {
    for (const angle of [
      -2 * Math.PI,
      -3.4,
      -0.9,
      -0.32,
      0,
      0.27,
      0.9,
      2.8,
      2 * Math.PI,
    ]) {
      restoreHistory([], 0);
      finishLayerTurn(axis, layer, angle);
      const expected = matrices(solved(), {
        axis,
        angles: [-1, 0, 1].map((l) =>
          l === layer ? angle : 0,
        ) as PartialTurns['angles'],
      });
      sameMatrices(
        matrices(getState().cube, getState().partialTurns),
        expected,
      );
      assert.deepEqual(
        apply(solved(), getState().history.slice(0, getState().cursor)),
        getState().cube,
      );
    }
  }
console.log(
  'PASS arbitrary stop angles across all slices, exact legal history and continuous poses across quarter turns',
);

restoreHistory([], 0);
finishLayerTurn(0, 1, 0.31);
finishLayerTurn(0, -1, -0.24);
const before = getState();
assert.equal(await perform('U'), false);
assert.equal(await perform('Fw'), false);
applyInstant(['R', 'F']);
loadPlayer(['R', 'U'], 'blocked');
runAlgorithm('R U');
await assert.rejects(async () => {
  await cubeTools[1].execute({ algorithm: 'U' });
});
assert.equal(getState().cube, before.cube);
assert.equal(getState().history, before.history);
assert.equal(getState().player, before.player);
assert.deepEqual(getState().partialTurns, before.partialTurns);
for (const token of ['R', "L'", 'M2', 'r', 'x'])
  assert.equal(canTurn(before.partialTurns, token), true);
await perform('R');
await undo();
sameMatrices(
  matrices(getState().cube, getState().partialTurns),
  matrices(before.cube, before.partialTurns),
);
await redo();
assert.deepEqual(getState().partialTurns, before.partialTurns);
finishLayerTurn(0, 1, 0);
assert.ok(getState().partialTurns);
finishLayerTurn(0, -1, 0);
assert.equal(getState().partialTurns, null);
assert.equal(await perform('U'), true);
console.log(
  'PASS atomic conflict rejection, independent parallel slices, undo/redo and unlock after all layers align',
);

for (const token of ['x', 'y', 'z', "x'", "y'", "z'", 'x2', 'y2', 'z2']) {
  restoreHistory([], 0);
  finishLayerTurn(0, 1, 0.31);
  finishLayerTurn(0, -1, -0.24);
  const start = getState();
  const expected = matrices(turn(solved(), token));
  const global = matrices(turn(solved(), token))
    .get('U4')!
    .clone()
    .multiply(base.get('U4')!.clone().invert());
  const original = matrices(start.cube, start.partialTurns);
  for (const [id, matrix] of original)
    expected.set(id, matrix.clone().premultiply(global));
  await perform(token);
  sameMatrices(matrices(getState().cube, getState().partialTurns), expected);
  await undo();
  sameMatrices(matrices(getState().cube, getState().partialTurns), original);
}
restoreHistory([], 0);
finishLayerTurn(0, 1, 0.31);
assert.equal(canTurnSequence(getState().partialTurns, ['z', 'U']), true);
assert.equal(canTurnSequence(getState().partialTurns, ['z', 'R']), false);
const playBase = matrices(getState().cube, getState().partialTurns);
loadPlayer(['z', 'U', "z'", 'R'], 'held playback');
await play();
await seek(0);
sameMatrices(matrices(getState().cube, getState().partialTurns), playBase);
await seek(4);
for (let i = 0; i < 4; i++) await playerPrevious();
sameMatrices(matrices(getState().cube, getState().partialTurns), playBase);
console.log(
  'PASS whole-cube rotations carry held layers, including algorithm validation, reverse playback and seeking',
);

const saved = captureProject();
const checked = validateProject(JSON.parse(JSON.stringify(saved)));
restoreHistory([], 0);
loadProject(checked);
assert.deepEqual(getState().partialTurns, saved.partialTurns);
assert.equal(getState().settings.magnetStrength, 0);
assert.equal(getState().settings.magnetDamping, 0.35);
sameMatrices(matrices(getState().cube, getState().partialTurns), playBase);
for (const partialTurns of [
  { axis: 3, angles: [0, 0, 0.2] },
  { axis: 0, angles: [0, 0, 1] },
  { axis: 0, angles: [0, 0, null] },
  { axis: 0, angles: [0, 0] },
])
  assert.throws(() => validateProject({ ...saved, partialTurns }));
const legacy: Omit<typeof saved, 'partialTurns' | 'settings'> & {
  partialTurns?: PartialTurns | null;
  settings: Partial<typeof saved.settings>;
} = { ...saved, settings: { ...saved.settings } };
delete legacy.partialTurns;
delete legacy.settings.magnetStrength;
delete legacy.settings.magnetDamping;
const migrated = validateProject(legacy);
assert.equal(migrated.partialTurns, null);
assert.equal(migrated.settings.magnetStrength, 1);
assert.equal(migrated.settings.magnetDamping, 0.7);
console.log(
  'PASS held pose and magnetic settings round trip, invalid angles rejected, old projects load with defaults',
);
restoreHistory([], 0);
finishLayerTurn(0, 1, 0.31);
let release: (() => void) | undefined;
setAnimator(
  () =>
    new Promise<void>((resolve) => {
      release = resolve;
    }),
);
const queuedTurn = perform('z');
assert.equal(await perform('U'), true);
assert.equal(await perform('R'), false);
release!();
await queuedTurn;
await new Promise((resolve) => setTimeout(resolve, 0));
release!();
await new Promise((resolve) => setTimeout(resolve, 0));
assert.deepEqual(getState().cube, apply(solved(), ['z', 'U']));
assert.equal(getState().partialTurns?.axis, 1);
assert.equal(getState().busy, false);
setAnimator(async () => {});
console.log(
  'PASS rapid input queue checks conflicts in the coordinate frame after pending whole-cube turns',
);
process.exit(0);
