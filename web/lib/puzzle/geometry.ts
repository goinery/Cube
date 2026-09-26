import { PUZZLE_DEFAULTS } from '@/lib/puzzle-config';
import * as T from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { bounds } from './appearance';
import type { Definition, FaceDefinition, TileDefinition, V2 } from './types';

const v = (p: number[]) => new T.Vector3(...p);
export function facePoint(face: FaceDefinition, p: V2, depth = 0) {
  return v(face.center)
    .addScaledVector(v(face.right), p[0])
    .addScaledVector(v(face.up), p[1])
    .addScaledVector(v(face.normal), depth);
}
export function capGeometry(def: Definition, tile: TileDefinition) {
  const face = def.faces.find((f) => f.id === tile.face)!,
    home = v(def.pieces[tile.piece].home),
    rect = bounds(face.outline);
  const positions: number[] = [],
    uv: number[] = [],
    normals: number[] = [],
    indices: number[] = [],
    count = tile.outline.length;
  const rings = [
    [0.96, -0.045],
    [0.993, -0.032],
    [1, -0.008],
    [0.996, 0.007],
    [0.985, 0.017],
    [0.96, 0.023],
    [0.68, 0.03],
    [0.26, 0.033],
  ];
  for (const [ring, [scale, z]] of rings.entries())
    for (const [index, p] of tile.outline.entries()) {
      const x = tile.center[0] + (p[0] - tile.center[0]) * scale,
        y = tile.center[1] + (p[1] - tile.center[1]) * scale;
      positions.push(...facePoint(face, [x, y], z).sub(home).toArray());
      uv.push((x - rect.x) / rect.w, (y - rect.y) / rect.h);
      const previous = tile.outline[(index + count - 1) % count],
        next = tile.outline[(index + 1) % count],
        lower = rings[Math.max(0, ring - 1)],
        upper = rings[Math.min(rings.length - 1, ring + 1)],
        tangent = new T.Vector3(
          next[0] - previous[0],
          next[1] - previous[1],
          0,
        ),
        profile = new T.Vector3(
          (p[0] - tile.center[0]) * (upper[0] - lower[0]),
          (p[1] - tile.center[1]) * (upper[0] - lower[0]),
          upper[1] - lower[1],
        ),
        local = tangent.cross(profile).normalize();
      if (ring >= 5) {
        const extent = bounds(tile.outline);
        local
          .set(
            ((x - tile.center[0]) * 0.028) / ((extent.w * extent.w) / 4),
            ((y - tile.center[1]) * 0.028) / ((extent.h * extent.h) / 4),
            1,
          )
          .normalize();
      }
      normals.push(
        ...v(face.right)
          .multiplyScalar(local.x)
          .addScaledVector(v(face.up), local.y)
          .addScaledVector(v(face.normal), local.z)
          .normalize()
          .toArray(),
      );
    }
  for (let ring = 0; ring < rings.length - 1; ring++)
    for (let i = 0; i < count; i++) {
      const a = ring * count + i,
        b = ring * count + ((i + 1) % count);
      indices.push(a, b, a + count, b, b + count, a + count);
    }
  const center = positions.length / 3;
  positions.push(...facePoint(face, tile.center, 0.034).sub(home).toArray());
  normals.push(...face.normal);
  uv.push(
    (tile.center[0] - rect.x) / rect.w,
    (tile.center[1] - rect.y) / rect.h,
  );
  for (let i = 0; i < count; i++)
    indices.push(
      (rings.length - 1) * count + i,
      (rings.length - 1) * count + ((i + 1) % count),
      center,
    );
  const back = positions.length / 3;
  positions.push(...facePoint(face, tile.center, -0.045).sub(home).toArray());
  normals.push(...v(face.normal).negate().toArray());
  uv.push(
    (tile.center[0] - rect.x) / rect.w,
    (tile.center[1] - rect.y) / rect.h,
  );
  for (let i = 0; i < count; i++) indices.push((i + 1) % count, i, back);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  // Stay inside the raised cap so rounded edges and seams remain uncovered.
  geo.userData.occluder = tile.outline.map(([x, y]) =>
    facePoint(
      face,
      [
        tile.center[0] + (x - tile.center[0]) * 0.95,
        tile.center[1] + (y - tile.center[1]) * 0.95,
      ],
      0.023,
    )
      .sub(home)
      .toArray(),
  );
  geo.userData.occluderNormal = face.normal;
  return geo;
}
export function shellGeometry(def: Definition, pieceIndex: number) {
  const piece = def.pieces[pieceIndex],
    home = v(piece.home),
    points: T.Vector3[] = [],
    normals: T.Vector3[] = [];
  for (const tile of def.tiles.filter((t) => t.piece === pieceIndex)) {
    const face = def.faces.find((f) => f.id === tile.face)!;
    normals.push(v(face.normal));
    for (const p of tile.outline) {
      const surface = facePoint(face, p, -0.046);
      points.push(
        surface.clone().sub(home),
        surface
          .clone()
          .multiplyScalar(piece.kind === 'corner' ? 0.76 : 0.83)
          .sub(home),
      );
    }
  }
  const hull = new ConvexGeometry(points),
    hp = hull.getAttribute('position'),
    hn = hull.getAttribute('normal');
  const axis = home.clone().normalize(),
    right = new T.Vector3(0, 1, 0).cross(axis);
  if (right.lengthSq() < 0.01) right.set(1, 0, 0);
  right.normalize();
  const up = axis.clone().cross(right);
  const positions: number[] = [],
    uv: number[] = [],
    edges = new Map<
      string,
      { a: T.Vector3; b: T.Vector3; n: T.Vector3; count: number }
    >();
  const key = (p: T.Vector3) =>
    p
      .toArray()
      .map((x) => Math.round(x * 1e6))
      .join(',');
  const coords = (p: T.Vector3) => {
    const world = p.clone().add(home);
    return [
      (Math.atan2(p.dot(up), p.dot(right)) / Math.PI / 2) * 2,
      world.dot(axis) * 0.8,
    ] as V2;
  };
  const triangle = (a: T.Vector3, b: T.Vector3, c: T.Vector3) => {
    const vertices = [a, b, c],
      texture = vertices.map(coords);
    if (
      Math.max(...texture.map((p) => p[0])) -
        Math.min(...texture.map((p) => p[0])) >
      1
    )
      texture.forEach((p) => {
        if (p[0] < 0) p[0] += 2;
      });
    vertices.forEach((p, i) => {
      positions.push(...p.toArray());
      uv.push(...texture[i]);
    });
  };
  for (let i = 0; i < hp.count; i += 3) {
    const n = new T.Vector3().fromBufferAttribute(hn, i);
    if (normals.some((face) => face.dot(n) > 0.999)) continue;
    const tri = [0, 1, 2].map((j) =>
      new T.Vector3().fromBufferAttribute(hp, i + j),
    );
    triangle(tri[0], tri[1], tri[2]);
    const inner = tri.map((p) => p.clone().addScaledVector(n, -0.025));
    triangle(inner[2], inner[1], inner[0]);
    for (let j = 0; j < 3; j++) {
      const a = tri[j],
        b = tri[(j + 1) % 3],
        edgeKey = [key(a), key(b)].sort().join('|'),
        old = edges.get(edgeKey);
      if (old) old.count++;
      else edges.set(edgeKey, { a, b, n, count: 1 });
    }
  }
  for (const { a, b, n, count } of edges.values())
    if (count === 1) {
      const ai = a.clone().addScaledVector(n, -0.025),
        bi = b.clone().addScaledVector(n, -0.025);
      triangle(a, ai, b);
      triangle(b, ai, bi);
    }
  hull.dispose();
  const raw = new T.BufferGeometry();
  raw.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  raw.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  const geometry = mergeVertices(raw, 1e-5);
  raw.dispose();
  geometry.computeVertexNormals();
  return geometry;
}
export function honeycombTexture(anisotropy: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 444;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#08090b';
  ctx.fillRect(0, 0, 384, 444);
  ctx.scale(1, 444 / (Math.sqrt(3) * 32 * 8));
  ctx.strokeStyle = '#f2f2ed';
  ctx.lineWidth = 1.5;
  for (let x = -2; x < 11; x++)
    for (let y = -2; y < 11; y++) {
      const cx = x * 48,
        cy = (y + (x % 2) / 2) * Math.sqrt(3) * 32;
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = (k * Math.PI) / 3,
          px = cx + Math.cos(a) * 32,
          py = cy + Math.sin(a) * 32;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = Math.min(8, anisotropy);
  return texture;
}
export interface Part {
  object: T.Object3D;
  base: T.Vector3;
  direction: T.Vector3;
  spread: number;
  cap?: boolean;
  magnet?: boolean;
}
export interface PieceModel {
  root: T.Group;
  parts: Part[];
  shell: T.Mesh;
}
function retainingFoot(corner: boolean) {
  const shape = new T.Shape();
  if (corner) {
    const vertices = Array.from(
      { length: 3 },
      (_, i) =>
        new T.Vector2(
          Math.cos((i * Math.PI * 2) / 3 + Math.PI / 2) * 0.19,
          Math.sin((i * Math.PI * 2) / 3 + Math.PI / 2) * 0.19,
        ),
    );
    vertices.forEach((point, i) => {
      const previous = vertices[(i + 2) % 3],
        next = vertices[(i + 1) % 3],
        a = point.clone().lerp(previous, 0.16),
        b = point.clone().lerp(next, 0.16);
      if (i === 0) shape.moveTo(a.x, a.y);
      else shape.lineTo(a.x, a.y);
      shape.quadraticCurveTo(point.x, point.y, b.x, b.y);
    });
    shape.closePath();
  } else {
    shape.moveTo(-0.2, -0.08);
    shape.bezierCurveTo(-0.25, -0.02, -0.25, 0.07, -0.18, 0.09);
    shape.quadraticCurveTo(0, 0.02, 0.18, 0.09);
    shape.bezierCurveTo(0.25, 0.07, 0.25, -0.02, 0.2, -0.08);
    shape.quadraticCurveTo(0, -0.13, -0.2, -0.08);
    shape.closePath();
  }
  const bore = new T.Path();
  bore.absarc(0, 0, 0.055, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  return new T.ExtrudeGeometry(shape, {
    depth: 0.045,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.012,
    bevelSegments: 3,
    curveSegments: 12,
    steps: 1,
  }).translate(0, 0, -0.0225);
}
function hollowNeck() {
  const shape = new T.Shape(),
    hole = new T.Path();
  shape.absarc(0, 0, 0.067, 0, Math.PI * 2, false);
  hole.absarc(0, 0, 0.037, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return new T.ExtrudeGeometry(shape, {
    depth: 1,
    bevelEnabled: false,
    curveSegments: 16,
    steps: 1,
  })
    .translate(0, 0, -0.5)
    .rotateX(Math.PI / 2);
}
export function buildPuzzle(def: Definition, anisotropy: number) {
  const root = new T.Group(),
    models: PieceModel[] = [],
    caps = new Map<string, T.Mesh>(),
    materials = new Set<T.Material>(),
    geometries = new Set<T.BufferGeometry>();
  const honeycomb = honeycombTexture(anisotropy);
  const body = new T.MeshStandardMaterial({
    color: '#ffffff',
    map: honeycomb,
    roughness: 0.48,
    bumpMap: honeycomb,
    bumpScale: 0.0015,
  });
  const rail = new T.MeshPhysicalMaterial({
    color: '#e2e7de',
    roughness: 0.31,
    clearcoat: 0.12,
  });
  const metal = new T.MeshStandardMaterial({
    color: '#c0c6cf',
    metalness: 1,
    roughness: 0.24,
  });
  const dark = new T.MeshStandardMaterial({
    color: '#171b20',
    roughness: 0.42,
  });
  const accent = new T.MeshPhysicalMaterial({
    color: '#8fb9ce',
    roughness: 0.26,
    clearcoat: 0.3,
  });
  [body, rail, metal, dark, accent].forEach((m) => materials.add(m));
  const shared = <G extends T.BufferGeometry>(g: G) => {
    geometries.add(g);
    return g;
  };
  const shaft = shared(new T.CylinderGeometry(0.043, 0.043, 1, 16)),
    magnet = shared(new T.CylinderGeometry(0.073, 0.073, 0.038, 24)),
    seat = shared(new T.CylinderGeometry(0.093, 0.097, 0.046, 24)),
    foot = shared(new T.TorusGeometry(0.12, 0.035, 8, 24)),
    collar = shared(new T.TorusGeometry(0.083, 0.016, 7, 20));
  const cornerFoot = shared(retainingFoot(true)),
    edgeFoot = shared(retainingFoot(false)),
    neck = shared(hollowNeck());
  const core = new T.Group();
  root.add(core);
  core.add(new T.Mesh(shared(new T.SphereGeometry(0.29, 24, 16)), dark));
  const align = (object: T.Object3D, direction: T.Vector3) =>
    object.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), direction);
  for (const face of def.faces) {
    const axis = v(face.normal),
      rod = new T.Mesh(shaft, metal);
    rod.position.copy(axis).multiplyScalar(0.74);
    rod.scale.y = 0.91;
    align(rod, axis);
    core.add(rod);
    const disk = new T.Mesh(
      shared(new T.CylinderGeometry(0.12, 0.15, 0.07, 24)),
      accent,
    );
    disk.position.copy(axis).multiplyScalar(1.16);
    align(disk, axis);
    core.add(disk);
    for (let k = 0; k < 6; k++) {
      const ring = new T.Mesh(collar, metal);
      ring.position.copy(axis).multiplyScalar(0.91 + k * 0.033);
      ring.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), axis);
      core.add(ring);
    }
  }
  for (const [index, piece] of def.pieces.entries()) {
    const group = new T.Group(),
      home = v(piece.home),
      radial = home.clone().normalize(),
      parts: Part[] = [];
    root.add(group);
    const part = (
      object: T.Object3D,
      position: T.Vector3,
      direction: T.Vector3,
      spread: number,
      extra: Partial<Part> = {},
    ) => {
      object.position.copy(position);
      group.add(object);
      parts.push({
        object,
        base: position.clone(),
        direction,
        spread,
        ...extra,
      });
      object.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.userData.piece = index;
        }
      });
    };
    const shell = new T.Mesh(shared(shellGeometry(def, index)), body);
    part(shell, new T.Vector3(), radial, 0.07);
    for (const tile of def.tiles.filter((t) => t.piece === index)) {
      const face = def.faces.find((f) => f.id === tile.face)!,
        normal = v(face.normal);
      const material = new T.MeshPhysicalMaterial({
        color: face.color,
        roughness: PUZZLE_DEFAULTS[def.id].settings.roughness,
        metalness: 0,
        clearcoat: 0.22,
        clearcoatRoughness: 0.13,
        ior: 1.48,
      });
      materials.add(material);
      const mesh = new T.Mesh(shared(capGeometry(def, tile)), material);
      mesh.userData.tile = tile.id;
      part(mesh, new T.Vector3(), normal, 0.31, { cap: true });
      caps.set(tile.id, mesh);
      const anchor = facePoint(face, tile.center, -0.12).sub(home);
      const housing = new T.Mesh(seat, dark);
      align(housing, normal);
      part(housing, anchor, normal, 0.12, { magnet: true });
      const magnetic = new T.Mesh(magnet, metal);
      align(magnetic, normal);
      part(
        magnetic,
        anchor.clone().addScaledVector(normal, 0.022),
        normal,
        0.16,
        { magnet: true },
      );
    }
    const inward = radial.clone().negate(),
      length = Math.max(
        0.18,
        home.length() - (def.id === 'megaminx' ? 0.83 : 0.64),
      );
    const stem = new T.Mesh(neck, rail);
    stem.scale.set(
      piece.kind === 'corner' ? 1.2 : 0.85,
      Math.min(length, 0.9),
      piece.kind === 'corner' ? 1.2 : 0.85,
    );
    align(stem, radial);
    part(stem, inward.clone().multiplyScalar(length * 0.42), inward, 0.16);
    const levels = def.order >= 4 && def.id !== 'megaminx' ? 2 : 1;
    for (let j = 0; j < levels; j++) {
      const guide = new T.Mesh(
        piece.kind === 'corner'
          ? cornerFoot
          : piece.kind === 'edge' || piece.kind === 'wing'
            ? edgeFoot
            : foot,
        rail,
      );
      guide.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), radial);
      guide.scale.set(
        piece.kind === 'corner' ? 1.25 : 1,
        piece.kind === 'wing' ? 1.2 : 1,
        1,
      );
      part(
        guide,
        inward.clone().multiplyScalar(Math.min(length, 0.9) - j * 0.16),
        inward,
        0.25 + j * 0.09,
      );
    }
    models.push({ root: group, parts, shell });
  }
  return {
    root,
    models,
    caps,
    core,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      honeycomb.dispose();
    },
  };
}
