import * as T from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { PIECES, ROTATIONS, TILES, VERTICES, type Tile } from './model';
import { createChassisRelief, createPlasticGrain } from '../cube/studio';
import type { State } from './store';

export const vertices = VERTICES.map((v) => new T.Vector3(...v));
export const normals = vertices.map((v) => v.clone().normalize().negate());
function basis(a: T.Vector3, b: T.Vector3) {
  const y = a.clone().normalize(),
    x = b.clone().addScaledVector(y, -b.dot(y)).normalize(),
    z = x.clone().cross(y);
  return new T.Matrix4().makeBasis(x, y, z);
}
const homeBasis = basis(vertices[0], vertices[1]).invert();
export const quaternions = ROTATIONS.map((p) =>
  new T.Quaternion().setFromRotationMatrix(
    basis(vertices[p[0]], vertices[p[1]]).multiply(homeBasis),
  ),
);
export const tileCenter = (tile: Tile) =>
  tile.points
    .reduce((c, p) => c.add(new T.Vector3(...p)), new T.Vector3())
    .divideScalar(3);

function capGeometry(tile: Tile) {
  const p = tile.points.map((p) => new T.Vector3(...p));
  const side = p[0].distanceTo(p[1]),
    height = (side * Math.sqrt(3)) / 2;
  const corners = [
    new T.Vector2(0, (2 * height) / 3),
    new T.Vector2(-side / 2, -height / 3),
    new T.Vector2(side / 2, -height / 3),
  ];
  const outline: T.Vector2[] = [];
  const radius = tile.piece >= 4 && tile.piece < 8 ? 0.09 : 0.045;
  for (let i = 0; i < 3; i++) {
    const corner = corners[i],
      start = corner.clone().lerp(corners[(i + 2) % 3], radius),
      end = corner.clone().lerp(corners[(i + 1) % 3], radius);
    for (let j = 0; j <= 6; j++) {
      const t = j / 6;
      outline.push(
        start
          .clone()
          .multiplyScalar((1 - t) ** 2)
          .addScaledVector(corner, 2 * t * (1 - t))
          .addScaledVector(end, t * t),
      );
    }
  }
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const vertex = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    const a = (y + height / 3) / height,
      b = (1 - a) / 2 - x / side,
      c = 1 - a - b;
    uv.push(
      a * tile.uv[0][0] + b * tile.uv[1][0] + c * tile.uv[2][0],
      a * tile.uv[0][1] + b * tile.uv[1][1] + c * tile.uv[2][1],
    );
  };
  const rings = [
    [0.92, -0.043],
    [0.97, -0.029],
    [0.983, -0.008],
    [0.98, 0.003],
    [0.966, 0.016],
    [0.93, 0.026],
    [0.75, 0.032],
    [0.38, 0.038],
  ];
  for (const [scale, z] of rings)
    for (const p of outline) vertex(p.x * scale, p.y * scale, z);
  const n = outline.length;
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n);
      indices.push(a, b, a + n, b, b + n, a + n);
    }
  const center = positions.length / 3;
  vertex(0, 0, 0.04);
  for (let i = 0; i < n; i++)
    indices.push(
      (rings.length - 1) * n + i,
      (rings.length - 1) * n + ((i + 1) % n),
      center,
    );
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
interface Part {
  mesh: T.Object3D;
  base: T.Vector3;
  direction: T.Vector3;
  separation: number;
  magnet?: boolean;
  internal?: boolean;
}
export interface ModelPiece {
  root: T.Group;
  home: T.Vector3;
  parts: Part[];
}
export function createModel(anisotropy: number) {
  const root = new T.Group(),
    core = new T.Group(),
    pieces: ModelPiece[] = [],
    tiles = new Map<string, T.Mesh<T.BufferGeometry, T.MeshPhysicalMaterial>>(),
    hits: T.Mesh[] = [];
  const grain = createPlasticGrain(anisotropy),
    relief = createChassisRelief(anisotropy);
  const shell = new T.MeshStandardMaterial({
    color: '#ffffff',
    map: relief,
    bumpMap: relief,
    bumpScale: -0.012,
    roughness: 0.4,
  });
  const white = new T.MeshStandardMaterial({
    color: '#e4e7dc',
    roughness: 0.32,
  });
  const dark = new T.MeshStandardMaterial({
    color: '#15191c',
    roughness: 0.36,
  });
  const metal = new T.MeshStandardMaterial({
    color: '#c1cbd2',
    metalness: 0.88,
    roughness: 0.24,
  });
  const green = new T.MeshPhysicalMaterial({
    color: '#78d639',
    roughness: 0.24,
    clearcoat: 0.3,
  });
  const cylinder = new T.CylinderGeometry(1, 1, 1, 16),
    ring = new T.TorusGeometry(0.25, 0.045, 8, 24),
    ball = new T.SphereGeometry(1, 12, 8);
  const screw = new T.CylinderGeometry(0.07, 0.07, 0.035, 6);
  const Y = new T.Vector3(0, 1, 0),
    Z = new T.Vector3(0, 0, 1);
  const hub = new T.Mesh(new T.IcosahedronGeometry(0.34, 1), white);
  core.add(hub);
  root.add(core);
  for (const v of vertices) {
    const n = v.clone().normalize(),
      axis = new T.Mesh(cylinder, metal);
    axis.scale.set(0.052, 1.43, 0.052);
    axis.position.copy(n).multiplyScalar(0.94);
    axis.quaternion.setFromUnitVectors(Y, n);
    core.add(axis);
    const socket = new T.Mesh(ball, white);
    socket.scale.setScalar(0.19);
    socket.position.copy(n).multiplyScalar(0.3);
    core.add(socket);
  }
  for (const [index, piece] of PIECES.entries()) {
    const pieceTiles = TILES.filter((t) => t.piece === index),
      points: T.Vector3[] = [];
    for (const t of pieceTiles)
      for (const p of t.points) {
        const v = new T.Vector3(...p);
        if (!points.some((q) => q.distanceToSquared(v) < 1e-8)) points.push(v);
      }
    const home = points
      .reduce((a, b) => a.add(b), new T.Vector3())
      .divideScalar(points.length);
    const group = new T.Group(),
      radial = home.clone().normalize(),
      parts: Part[] = [];
    group.name = piece.id;
    root.add(group);
    function part(
      mesh: T.Mesh,
      position: T.Vector3,
      direction: T.Vector3,
      separation: number,
      internal = false,
      magnet = false,
    ) {
      mesh.position.copy(position).sub(home);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.userData = {
        piece: index,
        tile: pieceTiles[0].id,
        ...mesh.userData,
      };
      parts.push({
        mesh,
        base: mesh.position.clone(),
        direction,
        separation,
        internal,
        magnet,
      });
      group.add(mesh);
      hits.push(mesh);
      return mesh;
    }
    const hull = new ConvexGeometry(
      points.map((p) => p.clone().sub(home).multiplyScalar(0.963)),
    );
    const pos = hull.getAttribute('position'),
      normal = hull.getAttribute('normal'),
      uv: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const n = new T.Vector3().fromBufferAttribute(normal, i),
        u = new T.Vector3(n.y, -n.x, 0);
      if (u.lengthSq() < 0.01) u.set(1, 0, 0);
      u.normalize();
      const v = n.clone().cross(u),
        p = new T.Vector3().fromBufferAttribute(pos, i);
      uv.push(p.dot(u) * 0.7 + 0.5, p.dot(v) * 0.7 + 0.5);
    }
    hull.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    part(new T.Mesh(hull, shell), home, radial, 0);
    for (const tile of pieceTiles) {
      const material = new T.MeshPhysicalMaterial({
        color: '#ffffff',
        roughness: 0.24,
        ior: 1.47,
        clearcoat: 0.18,
        clearcoatRoughness: 0.26,
        bumpMap: grain,
        bumpScale: 0.0006,
      });
      const cap = new T.Mesh(capGeometry(tile), material),
        c = tileCenter(tile),
        n = normals[tile.face];
      const x = new T.Vector3(...tile.points[2])
          .sub(new T.Vector3(...tile.points[1]))
          .normalize(),
        y = new T.Vector3(...tile.points[0]).sub(c).normalize();
      cap.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, n));
      cap.userData = { tile: tile.id, face: tile.face, cap: true };
      part(cap, c, n, 0.23);
      tiles.set(tile.id, cap);
      const clip = new T.Mesh(cylinder, material);
      clip.scale.set(0.044, 0.12, 0.044);
      clip.quaternion.setFromUnitVectors(Y, n);
      part(clip, c.clone().addScaledVector(n, -0.09), n, 0.19, true);
    }
    if (piece.kind === 'center') {
      const n = vertices[piece.vertices[0]].clone().normalize();
      const disc = new T.Mesh(cylinder, white);
      disc.scale.set(0.28, 0.1, 0.28);
      disc.quaternion.setFromUnitVectors(Y, n);
      part(disc, n.clone().multiplyScalar(0.74), n, 0.18, true);
      const guide = new T.Mesh(ring, white);
      guide.quaternion.setFromUnitVectors(Z, n);
      part(guide, n.clone().multiplyScalar(0.66), n, 0.1, true);
      const tangent = new T.Vector3()
          .crossVectors(n, new T.Vector3(1, 0.2, 0))
          .normalize(),
        bitangent = n.clone().cross(tangent);
      for (let i = 0; i < 10; i++) {
        const p = n
          .clone()
          .multiplyScalar(0.8)
          .addScaledVector(tangent, Math.cos((i * Math.PI) / 5) * 0.218)
          .addScaledVector(bitangent, Math.sin((i * Math.PI) / 5) * 0.218);
        const hole = new T.Mesh(cylinder, dark);
        hole.scale.set(0.028, 0.011, 0.028);
        hole.quaternion.setFromUnitVectors(Y, n);
        part(hole, p, n, 0.18, true);
      }
      for (let i = 0; i < 4; i++) {
        const spring = new T.Mesh(ring, metal);
        spring.scale.setScalar(0.4);
        spring.quaternion.setFromUnitVectors(Z, n);
        part(
          spring,
          n.clone().multiplyScalar(0.92 + i * 0.055),
          n,
          0.3 + i * 0.045,
          true,
        );
      }
      const adjustment = new T.Mesh(cylinder, green);
      adjustment.scale.set(0.17, 0.09, 0.17);
      adjustment.quaternion.setFromUnitVectors(Y, n);
      part(adjustment, n.clone().multiplyScalar(1.23), n, 0.65, true);
      const bolt = new T.Mesh(screw, metal);
      bolt.quaternion.setFromUnitVectors(Y, n);
      part(bolt, n.clone().multiplyScalar(1.3), n, 0.75, true);
    } else if (piece.kind === 'edge') {
      const neck = new T.Mesh(cylinder, white);
      neck.scale.set(0.1, 0.3, 0.1);
      neck.quaternion.setFromUnitVectors(Y, radial);
      part(
        neck,
        home.clone().addScaledVector(radial, -0.36),
        radial,
        -0.14,
        true,
      );
      const foot = new T.Mesh(ball, white);
      foot.scale.set(0.19, 0.12, 0.19);
      foot.quaternion.setFromUnitVectors(Y, radial);
      part(
        foot,
        home.clone().addScaledVector(radial, -0.49),
        radial,
        -0.28,
        true,
      );
    }
    for (let i = 0; i < pieceTiles.length; i++) {
      const n = normals[pieceTiles[i].face].clone().negate(),
        p = tileCenter(pieceTiles[i]).addScaledVector(n, 0.13);
      const socket = new T.Mesh(cylinder, dark);
      socket.scale.set(0.1, 0.052, 0.1);
      socket.quaternion.setFromUnitVectors(Y, n);
      part(socket, p, n, 0.32, true);
      const magnet = new T.Mesh(cylinder, metal);
      magnet.scale.set(0.071, 0.035, 0.071);
      magnet.quaternion.setFromUnitVectors(Y, n);
      part(magnet, p.clone().addScaledVector(n, 0.03), n, 0.43, true, true);
    }
    pieces.push({ root: group, home, parts });
  }
  function update(s: State, moving = false) {
    const expose =
      s.settings.explode > 0.02 ||
      !!s.partial ||
      moving ||
      s.settings.gap > 0.06 ||
      s.settings.size < 0.96;
    core.visible = expose;
    core.quaternion.copy(quaternions[s.puzzle.frame]);
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i],
        q = quaternions[s.puzzle.rotations[i]];
      p.root.quaternion.copy(q);
      p.root.position
        .copy(p.home)
        .addScaledVector(p.home.clone().normalize(), s.settings.explode * 0.8)
        .applyQuaternion(q);
      p.root.scale.setScalar(s.settings.size * (1 - s.settings.gap * 0.7));
      for (const part of p.parts) {
        part.mesh.visible =
          (!part.internal || expose) &&
          (!part.magnet || s.settings.showMagnets);
        part.mesh.position
          .copy(part.base)
          .addScaledVector(
            part.direction,
            part.separation * s.settings.explode * s.settings.internal +
              (part.mesh.userData.cap ? s.settings.stickerOffset : 0),
          );
      }
    }
  }
  function dispose() {
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>();
    root.traverse((o) => {
      if (o instanceof T.Mesh) {
        geometries.add(o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          materials.add(m),
        );
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    grain.dispose();
    relief.dispose();
  }
  return { root, core, pieces, tiles, hits, update, dispose };
}
