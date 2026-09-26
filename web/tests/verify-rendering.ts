import assert from 'node:assert/strict';
import * as T from 'three';
import { createTileGeometry } from '../lib/cube/geometry';
import {
  createCenterHousing,
  createMechanics,
  magnetMounts,
} from '../lib/cube/mechanics';
import { FACE, solved } from '../lib/cube/model';
import { defaultSettings } from '../lib/cube/store';
import { TIP_CUT } from '../lib/pyraminx/cap-profile';
import { createModel, normals, tileCenter } from '../lib/pyraminx/geometry';
import { CENTER_SHELL_RADIUS } from '../lib/pyraminx/mechanics';
import { TILES, VERTICES } from '../lib/pyraminx/model';
import { defaultPyraminxSettings, getState } from '../lib/pyraminx/store';
import { updateDepthRange } from '../lib/rendering/camera';
import { OcclusionCoverage } from '../lib/rendering/occlusion';
import { RenderOptimizer } from '../lib/rendering/render-optimizer';

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
  if (piece.kind === 'center') {
    const housing = createCenterHousing(piece, plastic, plastic);
    assert.equal(
      housing.children.filter((m) => m.name.includes('蜂窝侧片')).length,
      4,
    );
    housing.updateMatrixWorld(true);
    const face = FACE[piece.stickers[0].face];
    for (const axis of [face.r, face.u])
      for (const sign of [-1, 1]) {
        const outward = new T.Vector3(...axis).multiplyScalar(sign),
          probe = new T.Raycaster(
            new T.Vector3(...face.n).multiplyScalar(0.105).add(outward),
            outward.clone().negate(),
          ),
          hit = probe.intersectObject(housing)[0];
        assert(
          hit?.object.name.includes('蜂窝侧片'),
          'centre housing is missing a side wall',
        );
      }
    pieceRoot.add(housing);
    housing.traverse((mesh) => {
      if (mesh instanceof T.Mesh) cubeMechanics.push(mesh);
    });
    continue;
  }
  build(piece, (object, position) => {
    object.position.copy(position);
    object.updateMatrixWorld(true);
    if (piece.kind === 'edge' && object.userData.primary) {
      for (const mount of magnetMounts(piece)) {
        const origin = mount.position
            .clone()
            .addScaledVector(mount.normal, 0.2),
          probe = new T.Raycaster(
            origin,
            mount.normal.clone().negate(),
            0,
            0.23,
          );
        assert.equal(
          probe.intersectObject(object).length,
          0,
          'curved housing covers a magnet socket',
        );
        origin.setComponent(
          occupied[0].axis,
          origin.getComponent(occupied[0].axis) + occupied[0].sign * 0.16,
        );
        probe.set(origin, mount.normal.clone().negate());
        assert(
          probe.intersectObject(object).length,
          'magnet bore removes the surrounding shell',
        );
      }
    }
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
        if (piece.kind === 'edge') {
          // A ray through either coloured cap must cover every shell vertex:
          // this catches square walls sticking out of the large curved corners.
          for (const cap of cubeCaps.slice(-2)) {
            cap.updateMatrix();
            const local = point
              .clone()
              .applyMatrix4(cap.matrix.clone().invert());
            const probe = new T.Raycaster(
              new T.Vector3(local.x, local.y, 1),
              new T.Vector3(0, 0, -1),
            );
            const flatCap = new T.Mesh(cap.geometry, plastic);
            assert(
              probe.intersectObject(flatCap).length,
              'edge shell extends beyond a cap curve',
            );
          }
        }
        mechanicalVertices++;
      }
    });
    pieceRoot.add(object);
    return object;
  });
}

const cubeOptimizer = new RenderOptimizer(cubeMechanics, cubeCaps, {
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
for (const piece of pyr.pieces) {
  const chassis = piece.root.children.find((o) =>
    o.name.endsWith('-hollow-chassis'),
  ) as T.Mesh;
  assert(
    chassis.geometry.groups.some((g) => g.materialIndex === 0 && g.count > 0),
    `missing honeycomb panels: ${piece.root.name}`,
  );
  assert(
    !piece.parts.some(({ mesh }) =>
      /perforated-circular-track|hollow-foot-neck|axle-sleeve|lower-bearing|spring-seat|helical-spring|upper-washer|ges-adjustment|tip-bearing/.test(
        mesh.name,
      ),
    ),
    'removed annular assembly is still present',
  );
  if (piece.kind === 'edge') continue;
  if (piece.kind === 'center') {
    // The floor is concave and concentric with the puzzle, including away
    // from the bearing axis. A flat end or an open rim cannot pass these rays.
    const tangent = new T.Vector3()
      .crossVectors(piece.radial, new T.Vector3(1, 0, 0))
      .normalize();
    for (const offset of [-0.22, 0, 0.22]) {
      const direction = piece.radial
        .clone()
        .addScaledVector(tangent, offset)
        .normalize();
      const probe = new T.Raycaster(new T.Vector3(), direction);
      const hit = probe.intersectObject(chassis)[0];
      assert(
        hit && Math.abs(hit.distance - CENTER_SHELL_RADIUS) < 0.012,
        `centre spherical floor is missing: ${piece.root.name}`,
      );
      const normal = hit
        .face!.normal.clone()
        .transformDirection(chassis.matrixWorld);
      assert(
        normal.dot(direction) < -0.96,
        'spherical floor must face the core',
      );
    }
  }
  piece.root.traverse((mesh) => {
    if (!(mesh instanceof T.Mesh) || !/tip-detent|tip-bearing/.test(mesh.name))
      return;
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const height = new T.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(mesh.matrixWorld)
        .dot(piece.radial);
      assert(
        piece.kind === 'tip'
          ? height > TIP_CUT + 0.005
          : height < TIP_CUT - 0.003,
        'tip mechanism crosses the shifted turning seam',
      );
    }
  });
}
const seamRay = new T.Raycaster();
let seamChecks = 0;
let shellCurveChecks = 0;
for (const tile of TILES) {
  const cap = pyr.tiles.get(tile.id)!;
  const chassis = pyr.pieces[tile.piece].root.children.find((o) =>
      o.name.endsWith('-hollow-chassis'),
    ) as T.Mesh,
    shellPositions = chassis.geometry.getAttribute('position'),
    capPositions = cap.geometry.getAttribute('position'),
    outlineCount = cap.geometry.userData.occluder.length,
    // The fourth profile ring is the widest contour at the original face plane.
    outline = Array.from(
      { length: outlineCount },
      (_, i) =>
        new T.Vector2(
          capPositions.getX(3 * outlineCount + i),
          capPositions.getY(3 * outlineCount + i),
        ),
    ),
    shellToCap = cap.matrixWorld.clone().invert().multiply(chassis.matrixWorld);
  assert(shellPositions.count > 0, `missing curved shell: ${tile.id}`);
  const capNormal = new T.Vector3(0, 0, 1).transformDirection(cap.matrixWorld);
  for (const point of [
    new T.Vector2(),
    ...outline.map((p) => p.clone().multiplyScalar(0.8)),
  ]) {
    seamRay.set(
      new T.Vector3(point.x, point.y, 0.1).applyMatrix4(cap.matrixWorld),
      capNormal.clone().negate(),
    );
    const contact = seamRay.intersectObject(chassis)[0];
    assert(
      contact && Math.abs(contact.distance - 0.1431) < 1e-5,
      `cap backing is detached or incomplete: ${tile.id}`,
    );
  }
  for (let i = 0; i < shellPositions.count; i++) {
    const p = new T.Vector3()
      .fromBufferAttribute(shellPositions, i)
      .applyMatrix4(shellToCap);
    // Centre seats join three cap contours; their inner walls may extend
    // behind a different seat's projection. Only its actual contact surface
    // must stay within that cap. Infinite-prism clipping removed support here.
    if (pyr.pieces[tile.piece].kind === 'center' && p.z < -0.04311) continue;
    for (let j = 0; j < outline.length; j++) {
      const a = outline[j],
        b = outline[(j + 1) % outline.length];
      assert(
        (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) >= -1e-6,
        `honeycomb shell protrudes beyond cap curve: ${tile.id}`,
      );
    }
    shellCurveChecks++;
  }
  seamRay.set(
    tileCenter(tile).addScaledVector(normals[tile.face], 0.2),
    normals[tile.face].clone().negate(),
  );
  assert(seamRay.intersectObject(cap).length, `missing cap face: ${tile.id}`);
  for (let corner = 0; corner < 3; corner++) {
    const a = new T.Vector3(...tile.points[corner]),
      b = new T.Vector3(...tile.points[(corner + 1) % 3]);
    for (const t of [0.35, 0.5, 0.65]) {
      const target = a.clone().lerp(b, t).lerp(tileCenter(tile), 0.2);
      seamRay.set(
        target.clone().addScaledVector(normals[tile.face], 0.2),
        normals[tile.face].clone().negate(),
      );
      const hit = seamRay.intersectObject(cap, false)[0];
      assert(
        hit && hit.distance <= 0.20001,
        `cap inset removes a straight edge: ${tile.id}, edge ${corner}`,
      );
      seamChecks++;
    }
  }
}
for (let face = 0; face < 4; face++) {
  const center = new T.Vector3(...VERTICES[face]).multiplyScalar(-1 / 3),
    caps = TILES.filter((t) => t.face === face).map((t) =>
      pyr.tiles.get(t.id)!,
    ),
    tangent = new T.Vector3()
      .crossVectors(normals[face], new T.Vector3(1, 0, 0))
      .normalize(),
    up = normals[face].clone().cross(tangent);
  for (let step = 0; step < 24; step++) {
    const angle = (step * Math.PI) / 12,
      target = center
        .clone()
        .addScaledVector(tangent, Math.cos(angle) * 0.12)
        .addScaledVector(up, Math.sin(angle) * 0.12);
    seamRay.set(
      target.addScaledVector(normals[face], 0.2),
      normals[face].clone().negate(),
    );
    assert.equal(
      seamRay.intersectObjects(caps).length,
      0,
      'rounded central opening filled by cap underside',
    );
  }
  const tip = TILES.find((t) => t.face === face && t.piece < 4)!,
    cap = pyr.tiles.get(tip.id)!,
    top = new T.Vector3(...tip.points[0]),
    base = new T.Vector3(...tip.points[1]).lerp(
      new T.Vector3(...tip.points[2]),
      0.5,
    ),
    heightDirection = base.clone().sub(top).normalize(),
    faceHeight = top.distanceTo(base) * 3,
    positions = cap.geometry.getAttribute('position');
  let seamHeight = 0;
  for (let i = 0; i < positions.count; i++) {
    const p = new T.Vector3()
      .fromBufferAttribute(positions, i)
      .applyMatrix4(cap.matrixWorld);
    seamHeight = Math.max(
      seamHeight,
      p.sub(top).dot(heightDirection) / faceHeight,
    );
  }
  assert(
    Math.abs(seamHeight - 0.32) < 0.005,
    'tip seam no longer matches the reference proportion',
  );
}
pyr.root.traverse((o) => {
  if (o instanceof T.Mesh && !o.userData.cap) mechanics.push(o);
});
const optimizer = new RenderOptimizer(mechanics, [...pyr.tiles.values()], {
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
  for (const piece of pyr.pieces)
    for (const part of piece.parts)
      if (part.mesh.userData.cap)
        assert(
          part.mesh.position.distanceTo(part.base) < 1e-8,
          'exploding the puzzle detaches a cap from its honeycomb housing',
        );
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
console.log(
  `Pyraminx: ${seamChecks} cap-edge checks, four reference tip seams and rounded central openings passed.`,
);
console.log(
  `Pyraminx: ${shellCurveChecks} shell-to-cap silhouette checks passed.`,
);
console.log(
  `Assembled Pyraminx: ${visible}/${optimizer.stats.components} components submitted in the most occluded sampled view.`,
);
optimizer.dispose();
pyr.dispose();
plastic.dispose();
