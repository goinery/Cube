import assert from 'node:assert/strict';
import {
  Box3,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Vector3,
} from 'three';
import {
  PRODUCT_DIRECTION,
  PRODUCT_OCCUPANCY,
  rotateView,
  zoomView,
  transitionView,
  lightRotation,
} from '../lib/cube/camera';
import { fitDistance } from '../lib/cube/interaction';
import { createMechanics, magnetMounts } from '../lib/cube/mechanics';
import { solved } from '../lib/cube/model';
import { defaultSettings } from '../lib/cube/store';
import { captureProject, validateProject } from '../lib/cube/persistence';

const target = new Vector3(1, -2, 3),
  camera = new PerspectiveCamera(30, 1, 0.005, 200);
camera.position.copy(target).add(new Vector3(0, 0, 10));
camera.lookAt(target);
const initial = camera.position.clone();
for (let i = 1; i <= 720; i++) {
  rotateView(camera, target, 0, Math.PI / 180);
  assert.ok(Math.abs(camera.position.distanceTo(target) - 10) < 1e-8);
  if (i === 180 || i === 540) assert.ok(camera.up.y < -0.999);
  assert.ok(
    Math.abs(camera.up.dot(camera.position.clone().sub(target).normalize())) <
      1e-8,
  );
}
assert.ok(camera.position.distanceTo(initial) < 1e-8);
rotateView(camera, target, 0, 0, Math.PI / 2);
assert.ok(Math.abs(camera.up.x) > 0.999);
for (let i = 0; i < 1000; i++) rotateView(camera, target, 0.014, -0.008, 0.003);
assert.ok(Math.abs(camera.quaternion.length() - 1) < 1e-8);
const up = camera.up.clone();
zoomView(camera, target, 0.7);
assert.ok(camera.up.distanceTo(up) < 1e-8);
assert.ok(Math.abs(camera.position.distanceTo(target) - 7) < 1e-8);
console.log(
  'PASS continuous 720-degree pitch, roll, compound rotations and zoom preserve an orthonormal view',
);

const destination = new PerspectiveCamera();
destination.position.copy(target).add(new Vector3(0, 0, -7));
destination.lookAt(target);
camera.position.copy(target).add(new Vector3(0, 0, 7));
camera.up.set(0, 1, 0);
camera.lookAt(target);
for (let i = 0; i < 100; i++) {
  transitionView(
    camera,
    target,
    destination.position,
    target.clone(),
    destination.quaternion,
    0.15,
  );
  assert.ok(Math.abs(camera.position.distanceTo(target) - 7) < 1e-8);
}
assert.ok(camera.position.distanceTo(destination.position) < 1e-4);
for (const aspect of [16 / 9, 1, 9 / 16]) {
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  camera.up.set(0, 1, 0);
  const box = new Box3(
    new Vector3(-1.51, -1.51, -1.51),
    new Vector3(1.51, 1.51, 1.51),
  );
  const distance = fitDistance(
    camera,
    box,
    PRODUCT_DIRECTION,
    new Vector3(),
    PRODUCT_OCCUPANCY,
  );
  camera.position.copy(PRODUCT_DIRECTION).multiplyScalar(distance);
  camera.lookAt(new Vector3());
  camera.updateMatrixWorld(true);
  let max = 0;
  for (const x of [-1.51, 1.51])
    for (const y of [-1.51, 1.51])
      for (const z of [-1.51, 1.51]) {
        const p = new Vector3(x, y, z).project(camera);
        max = Math.max(max, Math.abs(p.x), Math.abs(p.y));
      }
  assert.ok(Math.abs(max - PRODUCT_OCCUPANCY) < 1e-6);
}
console.log(
  'PASS opposite-face transitions stay outside the cube; product framing fits landscape and portrait',
);

const settings = defaultSettings();
assert.equal(settings.lightFollowCamera, true);
const a = new Quaternion(),
  b = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
assert.deepEqual(
  lightRotation(25, 40, false, a),
  lightRotation(25, 40, false, b),
);
assert.ok(
  lightRotation(25, 40, true, a).angleTo(lightRotation(25, 40, true, b)) > 3,
);
const project = captureProject();
Object.assign(project.settings, {
  lightAzimuth: 125,
  lightElevation: -25,
  lightIntensity: 1.7,
  lightFollowCamera: true,
});
assert.deepEqual(validateProject(project).settings, project.settings);
const legacy = structuredClone(project);
for (const key of [
  'lightAzimuth',
  'lightElevation',
  'lightIntensity',
  'lightFollowCamera',
])
  delete (legacy.settings as unknown as Record<string, unknown>)[key];
assert.equal(validateProject(legacy).settings.lightFollowCamera, true);
assert.equal(validateProject(legacy).settings.lightIntensity, 2.8);
console.log(
  'PASS world-fixed lighting, optional camera following, settings roundtrip and legacy defaults',
);

const pieces = solved().filter((p) => p.kind !== 'center');
const mounts = pieces.flatMap((piece) =>
  magnetMounts(piece).map((mount) => ({
    kind: piece.kind,
    normal: mount.normal,
    position: mount.position
      .clone()
      .add(new Vector3(...piece.home).multiplyScalar(1.006)),
  })),
);
assert.equal(mounts.length, 48);
for (const mount of mounts) {
  const pairs = mounts.filter(
    (other) =>
      other.kind !== mount.kind &&
      mount.normal.dot(other.normal) < -0.999 &&
      mount.position.distanceTo(other.position) < 0.1,
  );
  assert.equal(pairs.length, 1);
  assert.ok(
    mount.position.clone().sub(pairs[0].position).cross(mount.normal).length() <
      1e-8,
  );
}
const material = new MeshBasicMaterial();
const build = createMechanics({
  body: material,
  plastic: material,
  guide: material,
  magnet: material,
  socket: material,
});
for (const piece of pieces) {
  const root = new Group();
  let foot: Group | undefined;
  build(piece, (object, pos) => {
    object.position.copy(pos);
    root.add(object);
    if (object.name.includes('卡脚') || object.name.includes('双翼'))
      foot = object as Group;
    return object;
  });
  root.updateMatrixWorld(true);
  assert.ok(foot);
  const radial = new Vector3(...piece.home).normalize();
  const origin = foot.position.clone().addScaledVector(radial, -0.4);
  assert.equal(
    new Raycaster(origin, radial).intersectObject(foot, true).length,
    0,
  );
  const bounds = new Box3().setFromObject(root);
  assert.ok(
    Math.max(
      ...bounds.max.toArray().map(Math.abs),
      ...bounds.min.toArray().map(Math.abs),
    ) < 1.28,
  );
  root.traverse((object) => {
    if (object instanceof Mesh) {
      for (const attr of ['position', 'normal']) {
        const array = object.geometry.getAttribute(attr).array;
        assert.ok(array.every(Number.isFinite), `${piece.id}: finite ${attr}`);
      }
    }
  });
}
console.log(
  'PASS 48 paired magnets, open retention-foot bores, bounded components and finite geometry on all 20 cubies',
);
