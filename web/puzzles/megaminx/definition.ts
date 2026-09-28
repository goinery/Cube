import { Matrix3, Quaternion, Vector2, Vector3 } from 'three';
import { MEGAMINX_COLORS } from '../config';
import { insetCapOutline } from '@/lib/rendering/cap-seams';
import { vec, tuple, close, rotationGroup, roundedPolygon } from '../engine/math';
import type { Definition, FaceDefinition, PieceDefinition, TileDefinition, V2 } from '../engine/types';

export function megaminxDefinition(): Definition {
  const phi = (1 + Math.sqrt(5)) / 2,
    distance = 1.45;
  const normals: Vector3[] = [];
  for (const a of [-1, 1])
    for (const b of [-1, 1])
      normals.push(
        new Vector3(0, a, b * phi).normalize(),
        new Vector3(a, b * phi, 0).normalize(),
        new Vector3(b * phi, 0, a).normalize(),
      );
  const front = normals.reduce((a, b) =>
    b.z > a.z || (b.z === a.z && b.y > a.y) ? b : a,
  );
  const orient = new Quaternion().setFromUnitVectors(
    front,
    new Vector3(0, 0, 1),
  );
  normals.forEach((n) => n.applyQuaternion(orient));
  const order = (a: number, b: number) => Math.round((b - a) * 1e6);
  normals.sort((a, b) => order(a.z, b.z) || order(a.y, b.y) || order(a.x, b.x));
  const vertices: Vector3[] = [];
  for (let a = 0; a < 12; a++)
    for (let b = a + 1; b < 12; b++)
      for (let c = b + 1; c < 12; c++) {
        const matrix = new Matrix3().set(
          ...normals[a].toArray(),
          ...normals[b].toArray(),
          ...normals[c].toArray(),
        );
        if (Math.abs(matrix.determinant()) < 1e-7) continue;
        const p = new Vector3(distance, distance, distance).applyMatrix3(
          matrix.invert(),
        );
        if (
          normals.every((n) => n.dot(p) < distance + 1e-6) &&
          !vertices.some((v) => v.distanceTo(p) < 1e-5)
        )
          vertices.push(p);
      }
  const names = [
    'F',
    'U',
    'R',
    'L',
    'DR',
    'DL',
    'BR',
    'BL',
    'FR',
    'FL',
    'D',
    'B',
  ];
  const faces: FaceDefinition[] = normals.map((normal, i) => {
    const up = new Vector3(0, 1, 0)
        .addScaledVector(normal, -normal.y)
        .normalize(),
      right = up.clone().cross(normal).normalize(),
      center = normal.clone().multiplyScalar(distance);
    const points = vertices
      .filter((p) => Math.abs(normal.dot(p) - distance) < 1e-5)
      .map(
        (p) =>
          [
            p.clone().sub(center).dot(right),
            p.clone().sub(center).dot(up),
          ] as V2,
      );
    points.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
    return {
      id: names[i],
      normal: tuple(normal),
      right: tuple(right),
      up: tuple(up),
      center: tuple(center),
      outline: points,
      color: MEGAMINX_COLORS[names[i]],
    };
  });
  const pieces: PieceDefinition[] = [],
    tiles: TileDefinition[] = [];
  const pieceFor = (kind: PieceDefinition['kind'], anchor: Vector3) => {
    let index = pieces.findIndex(
      (p) => p.kind === kind && close(p.anchor, tuple(anchor)),
    );
    if (index < 0) {
      index = pieces.length;
      pieces.push({
        id: `${kind}-${index}`,
        kind,
        anchor: tuple(anchor),
        home: tuple(
          anchor.clone().multiplyScalar(kind === 'center' ? 0.96 : 0.87),
        ),
        tiles: [],
      });
    }
    return index;
  };
  const lerp = (a: V2, b: V2, t: number): V2 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  faces.forEach((face) => {
    const pts = face.outline,
      at = (p: V2) =>
        vec(face.center)
          .addScaledVector(vec(face.right), p[0])
          .addScaledVector(vec(face.up), p[1]);
    const add = (
      kind: PieceDefinition['kind'],
      anchor: Vector3,
      points: V2[],
      radii: number | number[],
    ) => {
      const piece = pieceFor(kind, anchor),
        center = points.reduce(
          (a, p) =>
            [a[0] + p[0] / points.length, a[1] + p[1] / points.length] as V2,
          [0, 0] as V2,
        );
      const outline = roundedPolygon(
        insetCapOutline(points.map((p) => new Vector2(...p))).map(
          (p) => p.toArray() as V2,
        ),
        radii,
      );
      const id = `${face.id}:${tiles.filter((t) => t.face === face.id).length}`;
      tiles.push({ id, face: face.id, piece, center, outline });
      pieces[piece].tiles.push(id);
    };
    add(
      'center',
      vec(face.center),
      pts.map((p) => [p[0] * 0.47, p[1] * 0.47]),
      0.49,
    );
    pts.forEach((p, i) => {
      const prev = pts[(i + 4) % 5],
        next = pts[(i + 1) % 5],
        inner: V2 = [p[0] * 0.47, p[1] * 0.47];
      add(
        'corner',
        at(p),
        [p, lerp(p, next, 0.36), inner, lerp(p, prev, 0.36)],
        [0.045, 0.065, 0.18, 0.065],
      );
      add(
        'edge',
        at(lerp(p, next, 0.5)),
        [
          lerp(p, next, 0.36),
          lerp(p, next, 0.64),
          [next[0] * 0.47, next[1] * 0.47],
          inner,
        ],
        [0.07, 0.07, 0.43, 0.43],
      );
    });
  });
  return {
    id: 'megaminx',
    order: 5,
    step: (Math.PI * 2) / 5,
    faces,
    pieces,
    tiles,
    group: rotationGroup(normals.map(tuple), (Math.PI * 2) / 5),
    primitiveMoves: faces.map((f) => f.id),
  };
}
