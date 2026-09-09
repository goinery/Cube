import assert from 'node:assert/strict';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import {
  fitDistance,
  magneticTarget,
  moveForAngle,
  QUARTER,
} from '../lib/cube/interaction';
import { checkBeforeSolve } from '../lib/cube/preflight';
import { solved, apply, parseAlgorithm, turn } from '../lib/cube/model';
import { defaultAppearance } from '../lib/cube/appearance';
import {
  getState,
  patch,
  setAnimator,
  loadPlayer,
  play,
  seek,
  playerPrevious,
  settings,
  setAppearance,
  perform,
  restoreHistory,
} from '../lib/cube/store';
import { cubeTools } from '../lib/cube/webmcp';

assert.equal(Math.abs(magneticTarget(0.25)), 0);
assert.equal(magneticTarget(0.9), QUARTER);
assert.equal(magneticTarget(-0.9), -QUARTER);
assert.equal(magneticTarget(2.6), Math.PI);
assert.equal(magneticTarget(0.6, 0.005), QUARTER);
assert.equal(Math.abs(magneticTarget(0.6, -0.005)), 0);
assert.equal(moveForAngle('R', -QUARTER), 'R');
assert.equal(moveForAngle('L', QUARTER), 'L');
assert.equal(moveForAngle('U', QUARTER), "U'");
assert.equal(moveForAngle('F', Math.PI), 'F2');
assert.equal(moveForAngle('M', 0), null);
assert.equal(moveForAngle('E', 4 * QUARTER), null);
console.log(
  'PASS magnetic release: return, 90/180 degrees, both directions, velocity and complete revolutions',
);

for (const aspect of [16 / 9, 1, 9 / 16])
  for (const size of [3.02, 12, 0.15]) {
    const camera = new PerspectiveCamera(36, aspect, 0.005, 200),
      target = new Vector3(1, 2, -1),
      direction = new Vector3(6, 4.8, 7.5).normalize(),
      box = new Box3().setFromCenterAndSize(
        target,
        new Vector3(size, size, size),
      );
    const distance = fitDistance(camera, box, direction, target);
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    let fill = 0;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const p = new Vector3(x, y, z).project(camera);
          fill = Math.max(fill, Math.abs(p.x), Math.abs(p.y));
        }
    assert.ok(
      Math.abs(fill - 0.75) < 0.00001,
      `Actual projected occupancy ${fill}`,
    );
  }
console.log(
  'PASS 75% camera fit for desktop/portrait, assembled/exploded/macro bounds',
);

const art = defaultAppearance(),
  history = parseAlgorithm("R U R' F M2 x"),
  cube = apply(solved(), history);
assert.equal(checkBeforeSolve(solved(), [], 0, art).needed, false);
assert.equal(checkBeforeSolve(cube, history, history.length, art).valid, true);
assert.equal(
  checkBeforeSolve(turn(cube, 'R'), history, history.length, art).valid,
  false,
);
art.stickers.F0.image = 'data:image/png;base64,test';
const report = checkBeforeSolve(cube, history, history.length, art);
assert.equal(report.images, 1);
assert.equal(report.recommendPictures, true);
console.log(
  'PASS preflight legality, already solved and picture recommendations',
);

setAnimator(async () => {});
restoreHistory([], 0);
loadPlayer(['R', 'U'], 'lock test');
const before = getState();
patch({ solving: true });
await perform('F');
await play();
await playerPrevious();
await seek(2);
restoreHistory(['B'], 1);
settings({ gap: 0.2 });
setAppearance(art);
loadPlayer(['D'], 'blocked');
assert.equal(getState().cube, before.cube);
assert.equal(getState().player, before.player);
assert.equal(getState().settings, before.settings);
assert.equal(getState().appearance, before.appearance);
patch({ solving: false, busy: true, dragging: true });
await perform('R');
assert.equal(getState().cube, before.cube);
patch({ busy: false, dragging: false });
await perform('F');
assert.deepEqual(getState().cube, turn(solved(), 'F'));
console.log(
  'PASS solving locks all state-changing actions; drag previews cannot commit another move; unlock resumes normally',
);

restoreHistory([], 0);
await cubeTools[1].execute({ algorithm: "R U R' U'" });
assert.deepEqual(getState().cube, apply(solved(), parseAlgorithm("R U R' U'")));
const current = getState().cube;
await assert.rejects(async () => cubeTools[1].execute({ algorithm: 'Q' }));
assert.equal(getState().cube, current);
console.log(
  'PASS optional agent action logic shares visible state and rejects invalid algorithms (browser registration not tested)',
);
process.exit(0);
