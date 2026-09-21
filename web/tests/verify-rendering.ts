import assert from 'node:assert/strict';
import * as T from 'three';
import { FACE, solved } from '../lib/cube/model';
import { createTileGeometry } from '../lib/cube/geometry';
import { createMechanics } from '../lib/cube/mechanics';
import { CubeRenderOptimizer } from '../lib/cube/render-optimizer';
import { defaultSettings } from '../lib/cube/store';
import { createModel, normals, tileCenter } from '../lib/pyraminx/geometry';
import { TILES } from '../lib/pyraminx/model';
import { getState, defaultPyraminxSettings } from '../lib/pyraminx/store';
import { OcclusionCoverage } from '../lib/rendering/occlusion';
import { updateDepthRange } from '../lib/cube/camera';

assert.equal(defaultSettings().stickerOffset, 0);
assert.equal(defaultPyraminxSettings().stickerOffset, 0);
assert.equal(defaultPyraminxSettings().gap, 0);

const depthCamera = new T.PerspectiveCamera(30, 1, 0.005, 200);
const depthBounds = new T.Box3(
  new T.Vector3(-2, -2, -2),
  new T.Vector3(2, 2, 2),
);
for (const distance of [5, 10, 100]) {
  depthCamera.position.set(distance * 0.6, distance * 0.3, distance);
  depthCamera.lookAt(0, 0, 0);
  depthCamera.updateMatrixWorld(true);
  updateDepthRange(depthCamera, depthBounds);
  for (let i = 0; i < 8; i++) {
    const point = new T.Vector3(
      i & 1 ? 2 : -2,
      i & 2 ? 2 : -2,
      i & 4 ? 2 : -2,
    ).project(depthCamera);
    assert(
      point.z > -1 && point.z < 1,
      'adaptive depth range clips a visible cap',
    );
  }
  if (distance === 100)
    assert(depthCamera.near > 10, 'distant views must retain depth precision');
}
depthCamera.position.set(0, 0, 0.08);
depthCamera.updateMatrixWorld(true);
updateDepthRange(depthCamera, depthBounds);
assert.equal(
  depthCamera.near,
  0.005,
  'closeups must retain the small near plane',
);

const plastic = new T.MeshBasicMaterial();
const build = createMechanics({
  body: plastic,
  plastic,
  guide: plastic,
  magnet: plastic,
  socket: plastic,
});
const cubeRoot = new T.Group(),
  cubeCaps: T.Mesh[] = [],
  cubeMechanics: T.Mesh[] = [];
let mechanicalVertices = 0,
  capVertices = 0;
for (const piece of solved()) {
  const pieceRoot = new T.Group();
  pieceRoot.position.set(...piece.home);
  cubeRoot.add(pieceRoot);
  const occupied = piece.home
    .map((sign, axis) => ({ sign, axis }))
    .filter((v) => v.sign);
  for (const sticker of piece.stickers) {
    const geometry = createTileGeometry(sticker),
      face = FACE[sticker.face];
    const basis = new T.Matrix4().makeBasis(
      new T.Vector3(...face.r),
      new T.Vector3(...face.u),
      new T.Vector3(...face.n),
    );
    const pos = geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const point = new T.Vector3()
        .fromBufferAttribute(pos, i)
        .applyMatrix4(basis)
        .addScaledVector(new T.Vector3(...face.n), 0.455);
      const own = point.dot(new T.Vector3(...face.n));
      for (const other of piece.stickers) {
        if (other === sticker) continue;
        assert(
          own - point.dot(new T.Vector3(...FACE[other.face].n)) >= 0.00099,
          'perpendicular cap overlap',
        );
      }
      capVertices++;
    }
    const mesh = new T.Mesh(geometry, plastic);
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.position.set(...face.n).multiplyScalar(0.455);
    cubeCaps.push(mesh);
    pieceRoot.add(mesh);
  }
  if (piece.kind === 'center') continue;
  build(piece, (object, position) => {
    object.position.copy(position);
    object.updateMatrixWorld(true);
    object.traverse((mesh) => {
      if (!(mesh instanceof T.Mesh)) return;
      cubeMechanics.push(mesh);
      if (!object.userData.primary) return;
      const pos = mesh.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const point = new T.Vector3()
          .fromBufferAttribute(pos, i)
          .applyMatrix4(mesh.matrixWorld);
        for (const { sign, axis } of occupied)
          assert(
            point.getComponent(axis) * sign <= 0.40451,
            'chassis protrudes through cap back',
          );
        mechanicalVertices++;
      }
    });
    pieceRoot.add(object);
    return object;
  });
}

const cubeOptimizer = new CubeRenderOptimizer(cubeMechanics, cubeCaps, {
  shadows: false,
});
const cubeCamera = new T.PerspectiveCamera(30, 1.5, 0.1, 100),
  cubeRay = new T.Raycaster();
cubeRay.layers.enable(1);
let cubeRays = 0;
for (const size of [0.65, 1]) {
  cubeRoot.children.forEach((piece) => piece.scale.setScalar(size));
  cubeRoot.updateMatrixWorld(true);
  cubeOptimizer.updateBounds();
  for (let step = 0; step < 8; step++) {
    cubeCamera.position.set(
      Math.cos((step * Math.PI) / 4) * 9,
      step % 2 ? -4 : 4,
      Math.sin((step * Math.PI) / 4) * 9,
    );
    cubeCamera.lookAt(0, 0, 0);
    cubeCamera.updateMatrixWorld(true);
    cubeOptimizer.prepareCamera(cubeCamera);
    if (size === 1)
      assert(
        cubeOptimizer.stats.visible < cubeOptimizer.stats.components * 0.8,
      );
    for (let x = -0.7; x <= 0.7; x += 0.14)
      for (let y = -0.7; y <= 0.7; y += 0.14) {
        cubeRay.setFromCamera(new T.Vector2(x, y), cubeCamera);
        const first = cubeRay.intersectObjects(
          [...cubeMechanics, ...cubeCaps],
          false,
        )[0];
        if (first) {
          assert(
            cubeOptimizer.isVisible(first.object as T.Mesh),
            'cube visible surface culled',
          );
          cubeRays++;
        }
      }
  }
}
cubeOptimizer.dispose();
new Set([...cubeCaps, ...cubeMechanics].map((m) => m.geometry)).forEach((g) =>
  g.dispose(),
);

// Gaps are deliberately never covered, including subpixel holes.
const coverage = new OcclusionCoverage();
const rect = (left: number, right: number) => [
  new T.Vector3(left, -0.9, 0),
  new T.Vector3(right, -0.9, 0),
  new T.Vector3(right, 0.9, 0),
  new T.Vector3(left, 0.9, 0),
];
coverage.reset(new T.Matrix4());
coverage.add(rect(-0.9, -0.02));
coverage.add(rect(0.02, 0.9));
assert(
  !coverage.occludes([
    new T.Vector3(-0.01, 0, 0.5),
    new T.Vector3(0.01, 0, 0.5),
  ]),
);
assert(
  coverage.occludes([
    new T.Vector3(-0.6, -0.1, 0.5),
    new T.Vector3(-0.3, 0.1, 0.5),
  ]),
);
assert(
  !coverage.occludes([
    new T.Vector3(-0.6, -0.1, -0.5),
    new T.Vector3(-0.3, 0.1, -0.5),
  ]),
);

// CPU geometry/culling checks only; canvas drawing is irrelevant here.
Object.assign(globalThis, {
  document: {
    createElement: () => ({
      getContext: () => new Proxy({}, { get: () => () => {} }),
    }),
  },
});
const pyr = createModel(1),
  state = getState(),
  mechanics: T.Mesh[] = [];
pyr.update(state);
pyr.root.updateMatrixWorld(true);
const seamRay = new T.Raycaster();
let seamChecks = 0;
for (const tile of TILES) {
  const cap = pyr.tiles.get(tile.id)!,
    positions = cap.geometry.getAttribute('position');
  for (let corner = 0; corner < 3; corner++) {
    const actual = new T.Vector3()
      .fromBufferAttribute(positions, 21 * 3 + corner * 7)
      .applyMatrix4(cap.matrixWorld);
    assert(
      actual.distanceTo(new T.Vector3(...tile.points[corner])) < 1e-6,
      `contact belt must meet the shared corner: ${tile.id}`,
    );
    const a = new T.Vector3(...tile.points[corner]),
      b = new T.Vector3(...tile.points[(corner + 1) % 3]);
    for (const t of [0.01, 0.1, 0.5, 0.9, 0.99]) {
      // Test immediately inside every edge, including rounded corner junctions.
      const target = a.clone().lerp(b, t).lerp(tileCenter(tile), 0.0001);
      seamRay.set(
        target.clone().addScaledVector(normals[tile.face], 0.2),
        normals[tile.face].clone().negate(),
      );
      const hit = seamRay.intersectObject(cap, false)[0];
      assert(
        hit && hit.distance <= 0.20001,
        `open cap seam: ${tile.id}, edge ${corner}`,
      );
      seamChecks++;
    }
  }
}
pyr.root.traverse((o) => {
  if (o instanceof T.Mesh && !o.userData.cap) mechanics.push(o);
});
const optimizer = new CubeRenderOptimizer(mechanics, [...pyr.tiles.values()], {
  shadows: false,
});
const sources = [...mechanics, ...pyr.tiles.values()].filter(
  (m) => m.geometry.getAttribute('position').count,
);
const camera = new T.PerspectiveCamera(31, 1.5, 0.1, 100),
  ray = new T.Raycaster();
ray.layers.enable(1);
let visible = Infinity,
  rays = 0;
for (const explode of [0, 1, 3]) {
  pyr.update({ ...state, settings: { ...state.settings, explode } });
  pyr.root.updateMatrixWorld(true);
  optimizer.updateBounds();
  for (let step = 0; step < 8; step++) {
    camera.position
      .set(
        Math.cos((step * Math.PI) / 4) * 10,
        5,
        Math.sin((step * Math.PI) / 4) * 10,
      )
      .multiplyScalar(1 + explode * 0.6);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    optimizer.prepareCamera(camera);
    if (explode === 0) visible = Math.min(visible, optimizer.stats.visible);
    for (let x = -0.8; x <= 0.8; x += 0.16)
      for (let y = -0.8; y <= 0.8; y += 0.16) {
        ray.setFromCamera(new T.Vector2(x, y), camera);
        const first = ray.intersectObjects(sources, false)[0];
        if (first) {
          assert(
            optimizer.isVisible(first.object as T.Mesh),
            `visible surface culled: ${first.object.name}`,
          );
          rays++;
        }
      }
  }
}
assert(
  visible < optimizer.stats.components * 0.8,
  'assembled occlusion must remove hidden submissions',
);
console.log(
  `Geometry: ${capVertices} cap vertices, ${mechanicalVertices} chassis vertices; ${cubeRays} cube and ${rays} Pyraminx visible-ray checks passed.`,
);
console.log(`Pyraminx: ${seamChecks} cap-edge continuity checks passed.`);
console.log(
  `Assembled Pyraminx: ${visible}/${optimizer.stats.components} components submitted in the most occluded sampled view.`,
);
optimizer.dispose();
pyr.dispose();
plastic.dispose();
