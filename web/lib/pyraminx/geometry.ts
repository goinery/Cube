import * as T from 'three';
import { PIECES, ROTATIONS, TILES, VERTICES, type Tile } from './model';
import { createChassisRelief, createPlasticGrain } from '../cube/studio';
import { hollowChassis, sleeve } from './mechanics';
import type { State } from './store';
import { capOutline, TIP_CUT } from './cap-profile';

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

function pieceBoundaries(piece: (typeof PIECES)[number], clearance = 0) {
  const bodyCut = 4 / 15,
    tipCut = TIP_CUT;
  return vertices.flatMap((v, axis) => {
    const n = v.clone().normalize();
    if (piece.kind === 'tip')
      return axis === piece.vertices[0]
        ? [new T.Plane(n.negate(), tipCut + clearance)]
        : [];
    if (piece.kind === 'center' && axis === piece.vertices[0])
      return [new T.Plane(n, -tipCut + clearance)];
    return piece.vertices.includes(axis)
      ? [new T.Plane(n.negate(), bodyCut + clearance)]
      : [new T.Plane(n, -bodyCut + clearance)];
  });
}

function capGeometry(tile: Tile) {
  const p = tile.points.map((p) => new T.Vector3(...p));
  const centerPoint = tileCenter(tile),
    faceNormal = normals[tile.face],
    tangent = p[2].clone().sub(p[1]).normalize(),
    up = p[0].clone().sub(centerPoint).normalize();
  const seams = [
    ...normals
      .filter((_, face) => face !== tile.face)
      .map((normal) => new T.Plane(normal.clone().sub(faceNormal), 0)),
    ...pieceBoundaries(PIECES[tile.piece]),
  ].map(({ normal, constant }) => {
    return {
      x: normal.dot(tangent),
      y: normal.dot(up),
      z: normal.dot(faceNormal),
      offset: normal.dot(centerPoint) + constant,
    };
  });
  const side = p[0].distanceTo(p[1]),
    height = (side * Math.sqrt(3)) / 2;
  const outline = capOutline(tile);
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const vertex = (x: number, y: number, z: number) => {
    // Mate at each tetrahedral edge and stay inside the actual layer cuts.
    // The latter prevents the flush belt from crossing a neighbour mid-turn.
    let scale = 1;
    for (const seam of seams) {
      const radial = x * seam.x + y * seam.y;
      if (radial > 0)
        scale = Math.min(scale, (-seam.offset - z * seam.z) / radial);
    }
    x *= scale;
    y *= scale;
    positions.push(x, y, z);
    const a = (y + height / 3) / height,
      b = (1 - a) / 2 - x / side,
      c = 1 - a - b;
    uv.push(
      a * tile.uv[0][0] + b * tile.uv[1][0] + c * tile.uv[2][0],
      a * tile.uv[0][1] + b * tile.uv[1][1] + c * tile.uv[2][1],
    );
  };
  // Preserve the reference silhouette through the entire lip; a sharp
  // triangular belt here would fill the rounded junctions and central opening.
  const rings = [
    [0.97, -0.043],
    [0.992, -0.029],
    [1, -0.008],
    [1, 0],
    [0.996, 0.012],
    [0.985, 0.021],
    [0.965, 0.021],
    [0.38, 0.021],
  ];
  for (const [scale, z] of rings)
    for (const p of outline) {
      vertex(p.x * scale, p.y * scale, z);
    }
  const n = outline.length;
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < n; i++) {
      const a = r * n + i,
        b = r * n + ((i + 1) % n);
      indices.push(a, b, a + n, b, b + n, a + n);
    }
  const center = positions.length / 3;
  vertex(0, 0, 0.021);
  for (let i = 0; i < n; i++)
    indices.push(
      (rings.length - 1) * n + i,
      (rings.length - 1) * n + ((i + 1) % n),
      center,
    );
  const back = positions.length / 3;
  vertex(0, 0, -0.043);
  for (let i = 0; i < n; i++) indices.push((i + 1) % n, i, back);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  const capNormals = g.getAttribute('normal');
  for (let i = 6 * n; i <= center; i++) capNormals.setXYZ(i, 0, 0, 1);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData.occluder = outline.map((_, i) => [
    positions[(4 * n + i) * 3] * 0.995,
    positions[(4 * n + i) * 3 + 1] * 0.995,
    0.012,
  ]);
  return g;
}
interface Part {
  mesh: T.Object3D;
  base: T.Vector3;
  direction: T.Vector3;
  separation: number;
  magnet?: boolean;
  internal?: boolean;
  capAttachment?: boolean;
}
export interface ModelPiece {
  root: T.Group;
  home: T.Vector3;
  parts: Part[];
  radial: T.Vector3;
  kind: (typeof PIECES)[number]['kind'];
}
export function createModel(anisotropy: number) {
  const root = new T.Group(),
    core = new T.Group(),
    pieces: ModelPiece[] = [],
    tiles = new Map<string, T.Mesh<T.BufferGeometry, T.MeshPhysicalMaterial>>(),
    hits: T.Mesh[] = [],
    coreParts: Part[] = [];
  const grain = createPlasticGrain(anisotropy),
    relief = createChassisRelief(anisotropy);
  relief.colorSpace = T.SRGBColorSpace;
  const shell = new T.MeshStandardMaterial({
    name: 'black-plastic-white-honeycomb-grooves',
    color: '#ffffff',
    map: relief,
    bumpMap: relief,
    bumpScale: -0.008,
    roughness: 0.4,
  });
  const smoothPlastic = new T.MeshStandardMaterial({
    name: 'smooth-black-cap-recess',
    color: '#101316',
    roughness: 0.32,
  });
  const metal = new T.MeshStandardMaterial({
    color: '#c1cbd2',
    metalness: 0.88,
    roughness: 0.24,
  });
  const cylinder = new T.CylinderGeometry(1, 1, 1, 24),
    bearing = sleeve(0.17, 0.074, 0.09),
    magnetSeat = sleeve(0.089, 0.067, 0.05);
  const Y = new T.Vector3(0, 1, 0),
    Z = new T.Vector3(0, 0, 1);
  const hub = new T.Mesh(new T.SphereGeometry(0.27, 24, 16), smoothPlastic);
  hub.name = 'magnetic-core-hub';
  core.add(hub);
  root.add(core);
  function corePart(
    mesh: T.Mesh,
    position: T.Vector3,
    direction: T.Vector3,
    separation: number,
    magnet = false,
  ) {
    mesh.position.copy(position);
    mesh.castShadow = true;
    core.add(mesh);
    coreParts.push({
      mesh,
      base: position.clone(),
      direction,
      separation,
      magnet,
    });
    return mesh;
  }
  for (const [i, v] of vertices.entries()) {
    const n = v.clone().normalize(),
      axis = new T.Mesh(cylinder, metal);
    axis.name = `steel-axis-${i}`;
    axis.scale.set(0.042, 1.13, 0.042);
    axis.quaternion.setFromUnitVectors(Y, n);
    corePart(axis, n.clone().multiplyScalar(0.795), n, 0.12);
    const socket = new T.Mesh(bearing, smoothPlastic);
    socket.quaternion.setFromUnitVectors(Z, n);
    corePart(socket, n.clone().multiplyScalar(0.29), n, 0.045);
    const pin = new T.Mesh(cylinder, metal);
    const tangent = new T.Vector3()
      .crossVectors(n, new T.Vector3(1, 0.2, 0))
      .normalize();
    pin.name = `axis-retaining-pin-${i}`;
    pin.scale.set(0.022, 0.18, 0.022);
    pin.quaternion.setFromUnitVectors(Y, tangent);
    corePart(pin, n.clone().multiplyScalar(1.34), n, 0.12);
  }
  for (const edge of PIECES.filter((p) => p.kind === 'edge')) {
    const n = vertices[edge.vertices[0]]
      .clone()
      .add(vertices[edge.vertices[1]])
      .normalize();
    const boss = new T.Mesh(cylinder, smoothPlastic);
    boss.name = `core-socket-${edge.id}`;
    boss.scale.set(0.125, 0.22, 0.125);
    boss.quaternion.setFromUnitVectors(Y, n);
    corePart(boss, n.clone().multiplyScalar(0.32), n, 0.035);
    const seat = new T.Mesh(magnetSeat, smoothPlastic);
    seat.quaternion.setFromUnitVectors(Z, n);
    corePart(seat, n.clone().multiplyScalar(0.435), n, 0.035);
    const magnet = new T.Mesh(cylinder, metal);
    magnet.name = `core-magnet-${edge.id}`;
    magnet.scale.set(0.065, 0.035, 0.065);
    magnet.quaternion.setFromUnitVectors(Y, n);
    corePart(magnet, n.clone().multiplyScalar(0.445), n, 0.15, true);
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
      capAttachment = false,
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
        capAttachment,
      });
      group.add(mesh);
      hits.push(mesh);
      return mesh;
    }
    // Contact backings sit directly behind the caps (0.8 - 0.043), with only
    // a numerical clearance. The same bound mitres all adjoining face seats.
    const capClearance = normals.map((n) => new T.Plane(n.clone(), -0.7569));
    const cellPlanes = pieceBoundaries(piece, 0.008);
    const housingClearance = [...capClearance, ...cellPlanes];
    const hull = hollowChassis(home, pieceTiles, housingClearance);
    const chassis = part(
      new T.Mesh(hull, [shell, smoothPlastic]),
      home,
      radial,
      0,
    );
    chassis.name = `${piece.id}-hollow-chassis`;
    for (const tile of pieceTiles) {
      const material = new T.MeshPhysicalMaterial({
        color: '#ffffff',
        roughness: 0.24,
        ior: 1.48,
        specularIntensity: 0.75,
        clearcoat: 0.2,
        clearcoatRoughness: 0.13,
        bumpMap: grain,
        bumpScale: 0.00022,
        roughnessMap: grain,
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
      cap.name = `${tile.id}-colored-cap`;
      part(cap, c, n, 0, false, false, true);
      tiles.set(tile.id, cap);
    }
    function magneticSocket(
      position: T.Vector3,
      normal: T.Vector3,
      name: string,
      separation = 0,
    ) {
      const socket = new T.Mesh(magnetSeat, smoothPlastic);
      socket.name = `${piece.id}-${name}-socket`;
      socket.quaternion.setFromUnitVectors(Z, normal);
      part(socket, position, normal, separation, true);
      const magnet = new T.Mesh(cylinder, metal);
      magnet.name = `${piece.id}-${name}-magnet`;
      magnet.scale.set(0.065, 0.035, 0.065);
      magnet.quaternion.setFromUnitVectors(Y, normal);
      part(
        magnet,
        position.clone().addScaledVector(normal, 0.012),
        normal,
        separation + 0.15,
        true,
        true,
      );
    }
    if (piece.kind === 'edge') {
      magneticSocket(
        radial.clone().multiplyScalar(0.49),
        radial.clone().negate(),
        'core-facing',
        0.19,
      );
      for (const endpoint of piece.vertices) {
        const centerAxis = vertices[endpoint].clone().normalize(),
          boundary = vertices[piece.vertices.find((axis) => axis !== endpoint)!]
            .clone()
            .normalize();
        const matingPoint = centerAxis
          .multiplyScalar(0.73)
          .addScaledVector(boundary, 0.51);
        magneticSocket(
          matingPoint.addScaledVector(boundary, 0.034),
          boundary.clone().negate(),
          `center-${endpoint}`,
        );
      }
    }
    if (piece.kind !== 'edge') {
      const axis = piece.vertices[0];
      for (let other = 0; other < 4; other++) {
        if (other === axis) continue;
        const tangent = vertices[other]
          .clone()
          .addScaledVector(radial, -vertices[other].dot(radial))
          .normalize();
        const isTip = piece.kind === 'tip';
        magneticSocket(
          radial
            .clone()
            .multiplyScalar(TIP_CUT + (isTip ? 0.036 : -0.033))
            .addScaledVector(tangent, 0.245),
          radial.clone().multiplyScalar(isTip ? -1 : 1),
          `tip-detent-${other}`,
        );
        if (!isTip) {
          const boundary = vertices[other].clone().normalize();
          magneticSocket(
            radial
              .clone()
              .multiplyScalar(0.73)
              .addScaledVector(boundary, 0.51 - 0.034),
            boundary,
            `edge-detent-${other}`,
          );
        }
      }
    }
    pieces.push({ root: group, home, radial, kind: piece.kind, parts });
  }
  root.traverse((object) => {
    if (object instanceof T.Mesh) {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
      object.geometry.computeBoundingBox();
      object.geometry.computeBoundingSphere();
    }
  });
  let previousLayout: State['settings'] | null = null;
  function update(s: State, _moving = false) {
    const { explode, internal, stickerOffset, size, gap } = s.settings;
    const inner = Math.max(0, explode - 1) * internal;
    const partsChanged =
      !previousLayout ||
      previousLayout.explode !== explode ||
      previousLayout.internal !== internal ||
      previousLayout.stickerOffset !== stickerOffset ||
      previousLayout.showMagnets !== s.settings.showMagnets;
    if (partsChanged) previousLayout = { ...s.settings };
    // Visibility is determined by the view occlusion pass, not by a first-drag
    // toggle that suddenly uploads and compiles every hidden component.
    core.visible = true;
    const enlargement = Math.max(1, size);
    core.scale.setScalar(enlargement);
    core.quaternion.copy(quaternions[s.puzzle.frame]);
    if (partsChanged)
      for (const part of coreParts) {
        part.mesh.position
          .copy(part.base)
          .addScaledVector(part.direction, inner * part.separation);
        part.mesh.visible = !part.magnet || s.settings.showMagnets;
        part.mesh.updateMatrix();
      }
    for (let i = 0; i < pieces.length; i++) {
      const p = pieces[i],
        q = quaternions[s.puzzle.rotations[i]];
      p.root.quaternion.copy(q);
      p.root.position
        .copy(p.home)
        .multiplyScalar(enlargement)
        // Tips and centers share an axis, but must never share an explosion
        // offset: otherwise their mating faces remain touching at every stage.
        .addScaledVector(
          p.radial,
          explode *
            (p.kind === 'tip' ? 1.18 : p.kind === 'center' ? 0.48 : 0.86) +
            (p.kind === 'tip' ? Math.max(0, explode - 1) * 0.35 : 0),
        )
        .applyQuaternion(q);
      p.root.scale.setScalar(size * (1 - gap * 0.7));
      if (partsChanged)
        for (const part of p.parts) {
          part.mesh.visible = !part.magnet || s.settings.showMagnets;
          part.mesh.position
            .copy(part.base)
            .addScaledVector(
              part.direction,
              part.separation * inner +
                (part.capAttachment ? stickerOffset : 0),
            );
          part.mesh.updateMatrix();
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
