import * as T from 'three';
import { PIECES, ROTATIONS, TILES, VERTICES, type Tile } from './model';
import { createChassisRelief, createPlasticGrain } from '../cube/studio';
import {
  capSeat,
  clipGeometry,
  hollowChassis,
  perforatedTrack,
  sleeve,
  springGeometry,
} from './mechanics';
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

function pieceBoundaries(piece: (typeof PIECES)[number], clearance = 0) {
  const bodyCut = 4 / 15,
    tipCut = 4 / 3;
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
  const corners = [
    new T.Vector2(0, (2 * height) / 3),
    new T.Vector2(-side / 2, -height / 3),
    new T.Vector2(side / 2, -height / 3),
  ];
  const outline: T.Vector2[] = [],
    contactOutline: T.Vector2[] = [];
  const radius = tile.piece >= 4 && tile.piece < 8 ? 0.09 : 0.045;
  for (let i = 0; i < 3; i++) {
    const corner = corners[i],
      start = corner.clone().lerp(corners[(i + 2) % 3], radius),
      end = corner.clone().lerp(corners[(i + 1) % 3], radius);
    for (let j = 0; j <= 6; j++) {
      const t = j / 6;
      contactOutline.push(corner);
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
  // A full triangular contact belt at the original face plane closes both
  // shared edges and corner junctions. Rounding every ring left real holes,
  // even with stickerOffset = 0. The upper rings retain the moulded bevel.
  const rings = [
    [0.94, -0.043, 1],
    [0.985, -0.029, 1],
    [0.997, -0.008, 0.5],
    [1, 0, 0],
    [0.995, 0.016, 0.25],
    [0.985, 0.026, 0.5],
    [0.75, 0.032, 1],
    [0.38, 0.038, 1],
  ];
  for (const [scale, z, rounding] of rings)
    for (let i = 0; i < outline.length; i++) {
      const p = contactOutline[i].clone().lerp(outline[i], rounding);
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
  vertex(0, 0, 0.04);
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
  g.computeBoundingBox();
  g.computeBoundingSphere();
  g.userData.occluder = outline.map((_, i) => [
    positions[(4 * n + i) * 3] * 0.995,
    positions[(4 * n + i) * 3 + 1] * 0.995,
    0.016,
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
  const green = new T.MeshPhysicalMaterial({
    color: '#78d639',
    roughness: 0.24,
    clearcoat: 0.3,
  });
  const cylinder = new T.CylinderGeometry(1, 1, 1, 24),
    box = new T.BoxGeometry(1, 1, 1),
    trackGeometry = perforatedTrack(),
    spring = springGeometry(),
    washer = sleeve(0.13, 0.058, 0.025),
    bearing = sleeve(0.17, 0.074, 0.09),
    nut = sleeve(0.143, 0.06, 0.14),
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
    const untrimmedHull = hollowChassis(
      points,
      home,
      pieceTiles.map((t) => normals[t.face]),
      piece.kind === 'edge' ? undefined : radial,
    );
    // Every structural surface stays below the cap's -0.043 back plane,
    // including at the acute edges shared by two or three colored faces.
    const capClearance = normals.map((n) => new T.Plane(n.clone(), -0.742));
    const cellPlanes = pieceBoundaries(piece, 0.008);
    const housingClearance = [...capClearance, ...cellPlanes];
    const hull = clipGeometry(
      untrimmedHull,
      housingClearance,
      new T.Matrix4().makeTranslation(...home.toArray()),
    );
    untrimmedHull.dispose();
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
      cap.name = `${tile.id}-colored-cap`;
      part(cap, c, n, 0.34, false, false, true);
      tiles.set(tile.id, cap);
      const seat = new T.Mesh<T.BufferGeometry, T.MeshStandardMaterial>(
        capSeat(
          new T.Vector3(...tile.points[0]).distanceTo(
            new T.Vector3(...tile.points[1]),
          ),
          piece.kind === 'center' ? 0.09 : 0.045,
        ),
        smoothPlastic,
      );
      seat.quaternion.copy(cap.quaternion);
      seat.name = `${tile.id}-open-cap-recess`;
      const seatPosition = c.clone().addScaledVector(n, -0.084);
      const originalSeat = seat.geometry;
      seat.geometry = clipGeometry(
        originalSeat,
        [
          ...normals.map((normal) => new T.Plane(normal.clone(), -0.7565)),
          ...cellPlanes,
        ],
        new T.Matrix4().compose(
          seatPosition,
          seat.quaternion,
          new T.Vector3(1, 1, 1),
        ),
      );
      originalSeat.dispose();
      part(seat, seatPosition, radial, 0);
      for (const side of [-1, 1]) {
        const clip = new T.Mesh(box, material);
        clip.scale.set(0.085, 0.045, 0.105);
        clip.quaternion.copy(cap.quaternion);
        clip.name = `${tile.id}-snap-tab-${side}`;
        part(
          clip,
          c
            .clone()
            .addScaledVector(x, side * 0.26)
            .addScaledVector(y, -0.12)
            .addScaledVector(n, -0.085),
          n,
          0.34,
          true,
          false,
          true,
        );
        // Smooth bridge under the rim leaves the middle of the seat empty.
        const bridge = new T.Mesh(box, smoothPlastic);
        bridge.scale.set(0.14, 0.07, 0.055);
        bridge.quaternion.copy(cap.quaternion);
        part(
          bridge,
          c
            .clone()
            .addScaledVector(x, side * 0.26)
            .addScaledVector(y, -0.12)
            .addScaledVector(n, -0.155),
          radial,
          0,
        );
      }
    }
    function axial(
      geometry: T.BufferGeometry,
      material: T.Material,
      distance: number,
      separation: number,
      name: string,
    ) {
      const mesh = new T.Mesh(geometry, material);
      mesh.name = `${piece.id}-${name}`;
      mesh.quaternion.setFromUnitVectors(Z, radial);
      return part(
        mesh,
        radial.clone().multiplyScalar(distance),
        radial,
        separation,
        true,
      );
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
        position.clone().addScaledVector(normal, 0.006),
        normal,
        separation + 0.15,
        true,
        true,
      );
    }
    if (piece.kind === 'center') {
      axial(sleeve(0.17, 0.07, 0.3), shell, 0.68, -0.1, 'axle-sleeve');
      axial(bearing, shell, 0.48, -0.18, 'lower-bearing');
      axial(washer, metal, 0.825, 0.1, 'spring-seat');
      axial(spring, metal, 0.99, 0.26, 'helical-spring');
      axial(washer, metal, 1.15, 0.39, 'upper-washer');
      axial(nut, green, 1.245, 0.51, 'ges-adjustment-nut');
      // Four finger grips around the hollow GES nut move with the nut.
      const tangent = new T.Vector3()
        .crossVectors(radial, new T.Vector3(1, 0.2, 0))
        .normalize();
      const bitangent = radial.clone().cross(tangent);
      for (let j = 0; j < 4; j++) {
        const direction = tangent
          .clone()
          .multiplyScalar(Math.cos((j * Math.PI) / 2))
          .addScaledVector(bitangent, Math.sin((j * Math.PI) / 2));
        const grip = new T.Mesh(box, green);
        grip.scale.set(0.085, 0.032, 0.075);
        grip.quaternion.setFromRotationMatrix(
          new T.Matrix4().makeBasis(
            radial.clone().cross(direction),
            radial,
            direction,
          ),
        );
        part(
          grip,
          radial
            .clone()
            .multiplyScalar(1.245)
            .addScaledVector(direction, 0.142),
          radial,
          0.51,
          true,
        );
      }
    } else if (piece.kind === 'edge') {
      axial(sleeve(0.13, 0.075, 0.25), shell, 0.72, -0.1, 'hollow-foot-neck');
      axial(trackGeometry, shell, 0.535, -0.19, 'perforated-circular-track');
      axial(
        sleeve(0.105, 0.067, 0.06),
        smoothPlastic,
        0.49,
        -0.19,
        'foot-magnet-hub',
      );
      const tangent = new T.Vector3()
        .crossVectors(radial, new T.Vector3(1, 0.2, 0))
        .normalize();
      const bitangent = radial.clone().cross(tangent);
      for (let j = 0; j < 3; j++) {
        const direction = tangent
          .clone()
          .multiplyScalar(Math.cos((j * Math.PI * 2) / 3))
          .addScaledVector(bitangent, Math.sin((j * Math.PI * 2) / 3));
        const spoke = new T.Mesh(box, smoothPlastic);
        spoke.scale.set(0.045, 0.06, 0.18);
        spoke.quaternion.setFromRotationMatrix(
          new T.Matrix4().makeBasis(
            radial.clone().cross(direction),
            radial,
            direction,
          ),
        );
        part(
          spoke,
          radial.clone().multiplyScalar(0.535).addScaledVector(direction, 0.17),
          radial,
          -0.19,
          true,
        );
      }
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
        // Place paired magnets on opposite sides of the actual layer-cut
        // plane. Tangential sockets at the ends crossed that plane mid-turn.
        const matingPoint = centerAxis
          .multiplyScalar(0.73)
          .addScaledVector(boundary, 0.51);
        magneticSocket(
          matingPoint.addScaledVector(boundary, 0.045),
          boundary.clone().negate(),
          `center-${endpoint}`,
        );
      }
    } else {
      axial(sleeve(0.17, 0.115, 0.12), shell, 1.405, -0.06, 'tip-bearing');
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
            .multiplyScalar(isTip ? 1.372 : 1.3)
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
              .addScaledVector(boundary, 0.51 - 0.045),
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
