import { Matrix3, Quaternion, Vector3 } from 'three';
import type {
  Definition,
  FaceDefinition,
  Move,
  PieceDefinition,
  PuzzleId,
  PuzzleState,
  RotationGroup,
  TileDefinition,
  V2,
  V3,
} from './types';

const vec = (p: V3) => new Vector3(...p);
const tuple = (p: Vector3) => p.toArray() as V3;
const close = (a: V3, b: V3) => a.every((x, i) => Math.abs(x - b[i]) < 1e-5);
export function rotatePoint(def: Definition, rotation: number, point: V3): V3 {
  return tuple(vec(point).applyQuaternion(def.group.quaternions[rotation]));
}
function rotationGroup(axes: V3[], angle: number): RotationGroup {
  const generators = axes.map((axis) =>
    new Quaternion().setFromAxisAngle(vec(axis), angle),
  );
  const quaternions = [new Quaternion()];
  const find = (q: Quaternion) =>
    quaternions.findIndex((p) => Math.abs(p.dot(q)) > 1 - 1e-8);
  for (let i = 0; i < quaternions.length; i++) {
    for (const generator of generators) {
      const q = generator.clone().multiply(quaternions[i]).normalize();
      if (find(q) < 0) quaternions.push(q);
    }
    if (quaternions.length > 60) throw new Error('Invalid rotation group');
  }
  return {
    quaternions,
    multiply: quaternions.map((a) =>
      quaternions.map((b) => find(a.clone().multiply(b))),
    ),
    inverse: quaternions.map((q) => find(q.clone().invert())),
  };
}
export function roundedPolygon(
  points: V2[],
  fractions: number | number[],
  samples = 9,
): V2[] {
  const result: V2[] = [];
  points.forEach((p, i) => {
    const before = points[(i + points.length - 1) % points.length],
      after = points[(i + 1) % points.length];
    const f = typeof fractions === 'number' ? fractions : fractions[i];
    const start = p.map((v, j) => v + (before[j] - v) * f) as V2;
    const end = p.map((v, j) => v + (after[j] - v) * f) as V2;
    for (let k = 0; k <= samples; k++) {
      const t = k / samples,
        u = 1 - t;
      result.push([
        u * u * start[0] + 2 * u * t * p[0] + t * t * end[0],
        u * u * start[1] + 2 * u * t * p[1] + t * t * end[1],
      ]);
    }
  });
  return result;
}
const cubeFaces: [string, V3, V3, V3, string][] = [
  ['U', [0, 1, 0], [1, 0, 0], [0, 0, -1], '#f2f3f5'],
  ['R', [1, 0, 0], [0, 0, -1], [0, 1, 0], '#ed211a'],
  ['F', [0, 0, 1], [1, 0, 0], [0, 1, 0], '#08a665'],
  ['D', [0, -1, 0], [1, 0, 0], [0, 0, 1], '#ffd52b'],
  ['L', [-1, 0, 0], [0, 0, 1], [0, 1, 0], '#ff851c'],
  ['B', [0, 0, -1], [-1, 0, 0], [0, 1, 0], '#0767eb'],
];
function cubeDefinition(order: number): Definition {
  const widths =
    order === 4
      ? [0.78, 0.72, 0.72, 0.78]
      : order === 5
        ? [0.66, 0.56, 0.56, 0.56, 0.66]
        : [1.5, 1.5];
  const boundaries = [-1.5];
  widths.forEach((width) => boundaries.push(boundaries.at(-1)! + width));
  const centers = widths.map((width, i) => boundaries[i] + width / 2);
  const faces: FaceDefinition[] = cubeFaces.map(
    ([id, normal, right, up, color]) => ({
      id,
      normal,
      right,
      up,
      color,
      center: tuple(vec(normal).multiplyScalar(1.5)),
      outline: [
        [-1.5, -1.5],
        [1.5, -1.5],
        [1.5, 1.5],
        [-1.5, 1.5],
      ],
    }),
  );
  const pieces: PieceDefinition[] = [],
    tiles: TileDefinition[] = [];
  for (let x = 0; x < order; x++)
    for (let y = 0; y < order; y++)
      for (let z = 0; z < order; z++) {
        const index = [x, y, z],
          outside = index.filter((i) => i === 0 || i === order - 1).length;
        if (!outside) continue;
        const anchor = index.map((i) => i * 2 - order + 1) as V3;
        const kind =
          outside === 3
            ? 'corner'
            : outside === 2
              ? anchor.includes(0)
                ? 'edge'
                : 'wing'
              : order === 5
                ? anchor.filter(Boolean).length === 1
                  ? 'center'
                  : anchor.includes(0)
                    ? 't-center'
                    : 'x-center'
                : 'center';
        const piece: PieceDefinition = {
          id: index.join(','),
          kind,
          anchor,
          home: index.map((i) => centers[i]) as V3,
          tiles: [],
        };
        const pi = pieces.length;
        pieces.push(piece);
        for (const face of faces) {
          const axis = face.normal.findIndex(Boolean),
            sign = face.normal[axis];
          if (index[axis] !== (sign > 0 ? order - 1 : 0)) continue;
          const rx = face.right.findIndex(Boolean),
            uy = face.up.findIndex(Boolean);
          const cx = piece.home[rx] * face.right[rx],
            cy = piece.home[uy] * face.up[uy];
          const w = widths[index[rx]],
            h = widths[index[uy]],
            gap = 0.009;
          const corners: V2[] = [
            [cx - w / 2 + gap, cy - h / 2 + gap],
            [cx + w / 2 - gap, cy - h / 2 + gap],
            [cx + w / 2 - gap, cy + h / 2 - gap],
            [cx - w / 2 + gap, cy + h / 2 - gap],
          ];
          const radii = corners.map(([px, py]) => {
            if (order === 2)
              return Math.abs(px) < 0.1 && Math.abs(py) < 0.1 ? 0.32 : 0.035;
            const outerX = Math.abs(px) > 1.45,
              outerY = Math.abs(py) > 1.45;
            if (outerX || outerY) return 0.045;
            const nearOuter = Math.abs(px) > 0.75 || Math.abs(py) > 0.75;
            return nearOuter ? 0.24 : 0.16;
          });
          const id = `${face.id}:${Math.round((order - 1 - vec(anchor).dot(vec(face.up))) / 2)}:${Math.round((vec(anchor).dot(vec(face.right)) + order - 1) / 2)}`;
          tiles.push({
            id,
            face: face.id,
            piece: pi,
            center: [cx, cy],
            outline: roundedPolygon(corners, radii),
          });
          piece.tiles.push(id);
        }
      }
  return {
    id: `cube-${order}` as PuzzleId,
    order,
    step: Math.PI / 2,
    faces,
    pieces,
    tiles,
    group: rotationGroup(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      Math.PI / 2,
    ),
    primitiveMoves: ['R', 'U', 'F'].flatMap((f) =>
      Array.from({ length: order }, (_, i) => (i ? `${i + 1}${f}` : f)),
    ),
  };
}
function megaminxDefinition(): Definition {
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
  const colors = [
    '#909397',
    '#f3ed54',
    '#ec629e',
    '#32b8ed',
    '#70ce30',
    '#ff8619',
    '#8126be',
    '#ffffff',
    '#115de1',
    '#ef2921',
    '#006c49',
    '#d1b999',
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
      color: colors[i],
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
        points.map((p) => lerp(center, p, 0.976)),
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
const definitions = new Map<PuzzleId, Definition>();
export function definition(id: PuzzleId): Definition {
  if (!definitions.has(id))
    definitions.set(
      id,
      id === 'megaminx'
        ? megaminxDefinition()
        : cubeDefinition(Number(id.slice(-1))),
    );
  return definitions.get(id)!;
}
export const solved = (def: Definition): PuzzleState => ({
  rotations: def.pieces.map(() => 0),
});
const moveCache = new WeakMap<Definition, Map<string, Move>>();
export function moveSpec(def: Definition, token: string): Move {
  let cache = moveCache.get(def);
  if (!cache) {
    cache = new Map();
    moveCache.set(def, cache);
  }
  if (cache.has(token)) return cache.get(token)!;
  let axis: V3,
    angle: number,
    key: string,
    whole = false,
    affects: Move['affects'];
  if (def.id === 'megaminx') {
    const match = /^(@?)(U|R|F|L|BR|BL|FR|FL|DR|DL|B|D)(w)?(2'?|')?$/.exec(
      token,
    );
    const wca = /^([RD])(\+\+|--)$/.exec(token);
    if (!match && !wca) throw new Error('algorithm.invalid');
    const name = match?.[2] || wca![1],
      face = def.faces.find((f) => f.id === name)!;
    const wide = Boolean(match?.[3] || wca);
    whole = Boolean(match?.[1]);
    if (whole && wide) throw new Error('algorithm.invalid');
    const power = match ? (match[4]?.startsWith('2') ? 2 : 1) : 2,
      sign = token.endsWith("'") || token.endsWith('--') ? -1 : 1;
    axis = face.normal;
    key = whole ? `@${name}` : wide ? `${name}w` : name;
    angle = -def.step * power * sign;
    const opposite = vec(axis).negate();
    affects = (piece, orientation) => {
      if (whole) return true;
      const p = def.pieces[piece];
      const onFace = p.tiles.some((id) => {
        const tile = def.tiles.find((t) => t.id === id)!;
        const n = def.faces.find((f) => f.id === tile.face)!.normal;
        return (
          vec(rotatePoint(def, orientation, n)).dot(
            wide ? opposite : vec(axis),
          ) > 0.99999
        );
      });
      return wide ? !onFace : onFace;
    };
  } else {
    const match = /^(?:(\d+))?([URFDLBxyzMESurfdlb])(w)?(2'?|')?$/.exec(token);
    if (!match) throw new Error('algorithm.invalid');
    const [, prefix, letter, w, suffix] = match,
      upper = letter.toUpperCase();
    const rotation = 'xyz'.includes(letter),
      middle = 'MES'.includes(letter);
    if (middle && def.order % 2 === 0) throw new Error('algorithm.noMiddle');
    const face = def.faces.find(
      (f) =>
        f.id ===
        ({ X: 'R', Y: 'U', Z: 'F', M: 'L', E: 'D', S: 'F' }[upper] || upper),
    )!;
    if (!face) throw new Error('algorithm.invalid');
    axis = face.normal;
    whole = rotation;
    const wide = Boolean(w) || 'urfdlb'.includes(letter),
      count = rotation ? def.order : wide ? Number(prefix || 2) : 1,
      depth = middle ? (def.order + 1) / 2 : Number(prefix || 1);
    whole = rotation || (wide && count === def.order);
    if (
      count > def.order ||
      depth > def.order ||
      depth < 1 ||
      (prefix && (middle || rotation)) ||
      (w && (middle || rotation))
    )
      throw new Error('algorithm.layerRange');
    const levels = rotation
      ? Array.from({ length: def.order }, (_, i) => i)
      : wide
        ? Array.from({ length: count }, (_, i) => i)
        : [depth - 1];
    angle =
      -def.step *
      (suffix?.startsWith('2') ? 2 : 1) *
      (suffix?.endsWith("'") ? -1 : 1);
    key = rotation
      ? letter
      : middle
        ? letter
        : wide
          ? `${count === 2 ? '' : count}${upper}w`
          : `${depth === 1 ? '' : depth}${upper}`;
    affects = (piece, orientation) =>
      levels.some(
        (layer) =>
          Math.abs(
            vec(rotatePoint(def, orientation, def.pieces[piece].anchor)).dot(
              vec(axis),
            ) -
              (def.order - 1 - layer * 2),
          ) < 1e-5,
      );
  }
  const q = new Quaternion().setFromAxisAngle(vec(axis), angle);
  const rotation = def.group.quaternions.findIndex(
    (p) => Math.abs(q.dot(p)) > 1 - 1e-7,
  );
  if (rotation < 0) throw new Error('algorithm.invalid');
  const result = { token, key, axis, angle, rotation, whole, affects };
  cache.set(token, result);
  return result;
}
export function parseAlgorithm(def: Definition, input: string): string[] {
  const tokens = input
    .replace(/[’′]/g, "'")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length > 20000) throw new Error('algorithm.tooLong');
  tokens.forEach((token) => moveSpec(def, token));
  return tokens;
}
export function turn(
  def: Definition,
  state: PuzzleState,
  token: string,
): PuzzleState {
  const move = moveSpec(def, token);
  return {
    rotations: state.rotations.map((r, i) =>
      move.affects(i, r) ? def.group.multiply[move.rotation][r] : r,
    ),
  };
}
export const apply = (def: Definition, state: PuzzleState, tokens: string[]) =>
  tokens.reduce((s, t) => turn(def, s, t), state);
export function inverseMove(def: Definition, token: string): string {
  if (token.endsWith('++')) return token.replace('++', '--');
  if (token.endsWith('--')) return token.replace('--', '++');
  if (def.id !== 'megaminx' && token.endsWith('2')) return token;
  return token.endsWith("'") ? token.slice(0, -1) : token + "'";
}
export const inverse = (def: Definition, moves: string[]) =>
  [...moves].reverse().map((t) => inverseMove(def, t));
export function pictureSolved(def: Definition, state: PuzzleState): boolean {
  return state.rotations.every((r) => r === 0);
}
export function colorSolved(def: Definition, state: PuzzleState): boolean {
  return def.faces.every((face) => {
    let color: string | undefined;
    return def.tiles.every((tile) => {
      const n = def.faces.find((f) => f.id === tile.face)!.normal;
      if (
        vec(rotatePoint(def, state.rotations[tile.piece], n)).dot(
          vec(face.normal),
        ) < 0.99999
      )
        return true;
      if (!color) color = tile.face;
      return color === tile.face;
    });
  });
}
export function scramble(
  def: Definition,
  length = def.id === 'megaminx' ? 70 : def.order * 12,
): string[] {
  const result: string[] = [];
  let previous = '';
  for (let i = 0; i < length; i++) {
    let key: string;
    do {
      key =
        def.primitiveMoves[
          Math.floor(Math.random() * def.primitiveMoves.length)
        ];
    } while (key === previous);
    previous = key;
    result.push(key + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return result;
}
