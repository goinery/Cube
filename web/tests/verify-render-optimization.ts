import assert from 'node:assert/strict';
import * as T from 'three';
import { buildPuzzle } from '../lib/puzzle/geometry';
import { definition, moveSpec, solved } from '../lib/puzzle/model';
import { TurnCoordinator } from '../lib/puzzle/motion';
import { defaultSettings, Session } from '../lib/puzzle/session';
import { MinimalRenderer } from '../lib/rendering/minimal';
import { RenderOptimizer } from '../lib/rendering/render-optimizer';

// Geometry/visibility checks do not need rasterized canvas textures.
Object.assign(globalThis, {
  document: {
    createElement: () => ({
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  },
});

const camera = new T.PerspectiveCamera(30, 1.2, 0.01, 100);
camera.position.set(7, 5, 8);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

const geometry = new T.BoxGeometry(0.2, 0.2, 0.2),
  material = new T.MeshBasicMaterial();
const session = new Session('cube-5'),
  snapshot = session.getContentSnapshot();
const anchors = { R: { x: 25, y: 40, fromX: 30, fromY: 50, opacity: 1 } };
session.patch({ faceAnchors: anchors });
assert.equal(
  session.getContentSnapshot(),
  snapshot,
  'label motion must not rerender controls',
);
assert.equal(session.getFaceAnchors(), anchors);
session.patch({ selected: ['R-0'] });
assert.notEqual(
  session.getContentSnapshot(),
  snapshot,
  'selection must still update controls',
);
const fading = new T.Mesh(geometry, new T.MeshBasicMaterial());
fading.castShadow = true;
const minimal = new MinimalRenderer([fading], []);
minimal.update(true, 1);
assert.equal(fading.castShadow, false);
assert.equal(minimal.update(false, 1), false);
assert.equal(fading.castShadow, true);
assert.equal(
  minimal.changed,
  true,
  'the final fade frame must refresh cached shadows',
);
minimal.update(false, 1);
assert.equal(minimal.changed, false);
fading.material.dispose();
const sources = [
  new T.Mesh(geometry, material),
  new T.Mesh(geometry, material),
];
sources[1].position.x = 0.5;
sources.forEach((source) => source.updateMatrixWorld());
const instances = new RenderOptimizer(sources, [], { shadows: false });
instances.updateBounds();
instances.prepareCamera(camera);
const batch = instances.group.children[0].children[0] as T.InstancedMesh;
const firstVersion = batch.instanceMatrix.version;
batch.instanceMatrix.clearUpdateRanges();
instances.updateBounds();
instances.prepareCamera(camera);
assert.equal(
  batch.instanceMatrix.version,
  firstVersion,
  'unchanged bounds must not upload matrices',
);
sources[1].position.y = 0.5;
sources[1].updateMatrixWorld();
instances.updateBounds();
instances.prepareCamera(camera);
assert.equal(
  batch.instanceMatrix.updateRanges.reduce((n, range) => n + range.count, 0),
  16,
);
const uploaded = new T.Matrix4();
batch.getMatrixAt(1, uploaded);
assert(
  uploaded.elements.every(
    (value, i) => Math.abs(value - sources[1].matrixWorld.elements[i]) < 1e-6,
  ),
);
sources[0].visible = false;
instances.updateBounds();
instances.prepareCamera(camera);
assert.equal(batch.count, 1);
batch.getMatrixAt(0, uploaded);
assert(
  uploaded.elements.every(
    (value, i) => Math.abs(value - sources[1].matrixWorld.elements[i]) < 1e-6,
  ),
);
instances.prepareWarmup();
instances.prepareCamera(camera);
assert.equal(batch.count, 1);
instances.dispose();
geometry.dispose();
material.dispose();

let rayChecks = 0;
const submissions: { puzzle: string; meshes: number; submitted: number }[] = [];
for (const id of ['cube-2', 'cube-4', 'cube-5', 'megaminx'] as const) {
  const def = definition(id),
    model = buildPuzzle(def, 1);
  const caps = [...model.caps.values()],
    capSet = new Set(caps),
    mechanics: T.Mesh[] = [];
  model.root.traverse((object) => {
    if (object instanceof T.Mesh && !capSet.has(object)) mechanics.push(object);
  });
  const meshes = [...mechanics, ...caps],
    optimizer = new RenderOptimizer(mechanics, caps, {
      occlusion: 'coverage',
    });
  const raycaster = new T.Raycaster();
  raycaster.layers.enable(1);
  const turn = moveSpec(def, 'R');
  for (const pose of ['assembled', 'turn', 'exploded'] as const) {
    for (let i = 0; i < model.models.length; i++) {
      const piece = model.models[i],
        home = new T.Vector3(...def.pieces[i].home);
      piece.root.position.copy(home);
      piece.root.quaternion.identity();
      if (pose === 'turn' && turn.affects(i, 0)) {
        piece.root.quaternion.setFromAxisAngle(
          new T.Vector3(...turn.axis),
          turn.angle * 0.43,
        );
        piece.root.position.applyQuaternion(piece.root.quaternion);
      }
      if (pose === 'exploded')
        piece.root.position.addScaledVector(home.normalize(), 1.4);
      for (const part of piece.parts)
        part.object.position
          .copy(part.base)
          .addScaledVector(
            part.direction,
            pose === 'exploded' ? part.spread * 1.2 : 0,
          );
    }
    model.root.updateMatrixWorld(true);
    optimizer.updateBounds();
    for (const direction of [
      [1, 0.7, 1],
      [-1, 0.5, 1],
      [1, -0.6, -1],
      [-1, -0.4, -1],
    ]) {
      camera.position
        .set(...(direction as [number, number, number]))
        .normalize()
        .multiplyScalar(pose === 'exploded' ? 19 : 11);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      optimizer.prepareCamera(camera);
      for (let y = -10; y <= 10; y++)
        for (let x = -12; x <= 12; x++) {
          raycaster.setFromCamera(new T.Vector2(x / 15, y / 13), camera);
          const hit = raycaster.intersectObjects(meshes, false)[0];
          if (hit) {
            assert(
              optimizer.isVisible(hit.object as T.Mesh),
              `${id} ${pose}: culled a visible surface`,
            );
            rayChecks++;
          }
        }
      const visibleCaps = caps.map((cap) => cap.visible);
      optimizer.prepareShadow();
      optimizer.restoreCamera();
      assert.deepEqual(
        caps.map((cap) => cap.visible),
        visibleCaps,
        'shadow pass must restore camera visibility',
      );
    }
    if (pose === 'assembled')
      submissions.push({
        puzzle: id,
        meshes: meshes.length,
        submitted:
          optimizer.stats.batches + caps.filter((cap) => cap.visible).length,
      });
  }
  const motion = new TurnCoordinator(
    def,
    () => solved(def),
    () => defaultSettings(def),
    () => {},
    () => {},
  );
  motion.tracks = ['R', 'U'].map((token, index) => {
    const move = moveSpec(def, token);
    return {
      id: index,
      key: token,
      axis: move.axis,
      pieces: def.pieces.flatMap((_, i) => (move.affects(i, 0) ? [i] : [])),
      angle: 0.2 * (index + 1),
      from: 0,
      target: 0,
      velocity: 0,
      started: 0,
      duration: 100,
      mode: 'held',
    };
  });
  const poses = def.pieces.map(() => new T.Quaternion());
  motion.writePoses(poses, 100);
  poses.forEach((pose, i) =>
    assert(
      Math.abs(pose.dot(motion.pose(i, 100))) > 1 - 1e-12,
      'batched poses must preserve rotation order',
    ),
  );
  optimizer.dispose();
  model.dispose();
}
console.table(submissions);
console.log(
  `PASS: ${rayChecks} visible-surface rays, incremental instance uploads, shadow restoration and batched poses.`,
);
