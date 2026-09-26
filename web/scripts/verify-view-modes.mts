import assert from 'node:assert/strict';
import * as T from 'three';
import { capGeometry } from '../lib/puzzle/geometry';
import { HiddenFaces } from '../lib/puzzle/hidden-faces';
import { definition, moveSpec } from '../lib/puzzle/model';
import { capture, validate } from '../lib/puzzle/persistence';
import { Session } from '../lib/puzzle/session';
import { updateDepthRange } from '../lib/rendering/camera';
import { MinimalRenderer } from '../lib/rendering/minimal';

for (const id of ['cube-2', 'cube-4', 'cube-5', 'megaminx'] as const) {
  const session = new Session(id),
    project = structuredClone(capture(session));
  project.settings.minimal = true;
  assert.equal(validate(session, project).settings.minimal, true);
  delete (project.settings as Partial<typeof project.settings>).minimal;
  assert.equal(
    validate(session, project).settings.minimal,
    false,
    'older saved projects must load',
  );
  const def = definition(id),
    root = new T.Group(),
    caps = new Map<string, T.Mesh>();
  const pieces = def.pieces.map((piece) => {
    const group = new T.Group();
    group.position.set(...piece.home);
    root.add(group);
    return group;
  });
  for (const tile of def.tiles) {
    const mesh = new T.Mesh(
      capGeometry(def, tile),
      new T.MeshPhysicalMaterial(),
    );
    caps.set(tile.id, mesh);
    pieces[tile.piece].add(mesh);
  }
  const maps = new HiddenFaces(def, caps),
    camera = new T.PerspectiveCamera(30, 1.2, 0.01, 100),
    target = new T.Vector3();
  camera.position.set(7, 5, 8);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  root.updateMatrixWorld(true);
  maps.update(camera, target, true, 1);
  const scales = maps.scene.children.map((group) => group.scale.clone());
  for (const token of [
    def.primitiveMoves[0],
    def.primitiveMoves[Math.floor(def.primitiveMoves.length / 2)],
  ])
    for (let step = 0; step <= 18; step++) {
      const move = moveSpec(def, token),
        rotation = new T.Quaternion().setFromAxisAngle(
          new T.Vector3(...move.axis),
          (move.angle * step) / 18,
        );
      pieces.forEach((piece, i) => {
        piece.position.set(...def.pieces[i].home);
        piece.quaternion.identity();
        if (move.affects(i, 0)) {
          piece.position.applyQuaternion(rotation);
          piece.quaternion.copy(rotation);
        }
      });
      root.updateMatrixWorld(true);
      updateDepthRange(camera, new T.Box3().setFromObject(root));
      maps.update(camera, target, true, 1 / 60);
      maps.scene.children.forEach((group, i) =>
        assert.ok(
          group.scale.distanceTo(scales[i]) < 1e-10,
          `${id} ${token} scale changed at ${step}`,
        ),
      );
    }
  maps.dispose();
  caps.forEach((mesh) => {
    mesh.geometry.dispose();
    (mesh.material as T.Material).dispose();
  });
}

const root = new T.Group(),
  geometry = new T.BoxGeometry(),
  cap = new T.Mesh(geometry, new T.MeshPhysicalMaterial()),
  mechanic = new T.Mesh(geometry, new T.MeshPhysicalMaterial()),
  shadow = new T.Mesh(
    geometry,
    new T.MeshBasicMaterial({ transparent: true, opacity: 0.5 }),
  );
mechanic.castShadow = true;
root.add(cap, mechanic, shadow);
const minimal = new MinimalRenderer([root], [cap]);
assert.ok(minimal.update(true, 1 / 60));
assert.equal(cap.material.opacity, 1);
assert.ok(mechanic.material.opacity > 0 && mechanic.material.opacity < 1);
for (let i = 0; i < 60; i++) minimal.update(true, 1 / 60);
assert.equal(cap.material.visible, true);
assert.equal(mechanic.material.visible, false);
assert.equal(shadow.material.visible, false);
assert.equal(mechanic.castShadow, false);
shadow.material.opacity = 0.2;
for (let i = 0; i < 60; i++) minimal.update(false, 1 / 60);
assert.equal(mechanic.material.visible, true);
assert.equal(mechanic.material.opacity, 1);
assert.equal(mechanic.material.transparent, false);
assert.equal(mechanic.material.depthWrite, true);
assert.equal(mechanic.castShadow, true);
assert.equal(shadow.material.opacity, 0.2);
console.log(
  'PASS: fixed mapping scale through 152 layer poses; minimal fade, caps, shadows and restoration.',
);
