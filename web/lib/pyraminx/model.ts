export type Vec3 = [number, number, number];
export type Permutation = [number, number, number, number];
export type PieceKind = 'tip' | 'center' | 'edge';
export type Layer = 'tip' | 'body' | 'base';
export const AXES = ['U', 'L', 'R', 'B'] as const;
export const TURN = (Math.PI * 2) / 3;
export const VERTICES: Vec3[] = [
  [0, 2.4, 0],
  [-Math.sqrt(3.84), -0.8, Math.sqrt(1.28)],
  [Math.sqrt(3.84), -0.8, Math.sqrt(1.28)],
  [0, -0.8, -Math.sqrt(5.12)],
];
export const FACE_COLORS = ['#f6df13', '#ed283b', '#13cd45', '#143cfa'];
export const FACE_NAMES = ['底面 · 黄', '右面 · 红', '左面 · 绿', '正面 · 蓝'];
export interface Piece {
  id: string;
  kind: PieceKind;
  vertices: number[];
}
export const PIECES: Piece[] = [
  ...AXES.map((a, i) => ({
    id: `tip-${a}`,
    kind: 'tip' as const,
    vertices: [i],
  })),
  ...AXES.map((a, i) => ({
    id: `center-${a}`,
    kind: 'center' as const,
    vertices: [i],
  })),
  ...[
    [0, 1],
    [0, 2],
    [0, 3],
    [1, 2],
    [1, 3],
    [2, 3],
  ].map((v) => ({
    id: `edge-${AXES[v[0]]}${AXES[v[1]]}`,
    kind: 'edge' as const,
    vertices: v,
  })),
];
export const ROTATIONS: Permutation[] = [];
for (let a = 0; a < 4; a++)
  for (let b = 0; b < 4; b++)
    for (let c = 0; c < 4; c++)
      for (let d = 0; d < 4; d++) {
        const p: Permutation = [a, b, c, d];
        if (new Set(p).size !== 4) continue;
        let inversions = 0;
        for (let i = 0; i < 4; i++)
          for (let j = i + 1; j < 4; j++) if (p[i] > p[j]) inversions++;
        if (inversions % 2 === 0) ROTATIONS.push(p);
      }
export const COMPOSE = ROTATIONS.map((a) =>
  ROTATIONS.map((b) =>
    ROTATIONS.findIndex((p) => p.every((v, i) => v === a[b[i]])),
  ),
);
export const INVERSE = ROTATIONS.map((_, i) => COMPOSE[i].indexOf(0));
const dot = (a: Vec3, b: Vec3) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const AXIS_ROTATIONS = VERTICES.map((v) => {
  const n = v.map((x) => x / 2.4) as Vec3;
  const permutation = VERTICES.map((p) => {
    const c = cross(n, p),
      q = p.map(
        (x, i) =>
          x * Math.cos(-TURN) +
          c[i] * Math.sin(-TURN) +
          n[i] * dot(n, p) * (1 - Math.cos(-TURN)),
      ) as Vec3;
    return VERTICES.findIndex((w) =>
      q.every((x, i) => Math.abs(x - w[i]) < 1e-6),
    );
  });
  return ROTATIONS.findIndex((p) => p.every((v, i) => v === permutation[i]));
});
export interface PuzzleState {
  rotations: number[];
  frame: number;
}
export const solved = (): PuzzleState => ({
  rotations: PIECES.map(() => 0),
  frame: 0,
});
export interface Move {
  axis: number;
  layer: Layer;
  direction: 1 | -1;
}
export function parseMove(token: string): Move {
  if (
    !/^[ULRBulrb](?:w)?'?$/.test(token) ||
    (/^[ulrb]/.test(token) && token.includes('w'))
  )
    throw new Error(
      `无法识别「${token}」：使用 U/L/R/B、u/l/r/b 或 Uw/Lw/Rw/Bw。`,
    );
  return {
    axis: AXES.indexOf(token[0].toUpperCase() as (typeof AXES)[number]),
    layer: token.includes('w')
      ? 'base'
      : token[0] === token[0].toLowerCase()
        ? 'tip'
        : 'body',
    direction: token.endsWith("'") ? -1 : 1,
  };
}
export function moveToken(axis: number, layer: Layer, direction = 1) {
  const a = AXES[axis];
  return (
    (layer === 'tip' ? a.toLowerCase() : a + (layer === 'base' ? 'w' : '')) +
    (direction < 0 ? "'" : '')
  );
}
export const inverseMove = (token: string) =>
  token.endsWith("'") ? token.slice(0, -1) : token + "'";
export function parseAlgorithm(input: string) {
  const tokens = input
    .replace(/[’′]/g, "'")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length > 20000) throw new Error('算法不能超过 20000 步。');
  return tokens.map((token) => {
    parseMove(token);
    return token;
  });
}
export function affects(
  piece: number,
  rotation: number,
  move: Pick<Move, 'axis' | 'layer'>,
) {
  const p = PIECES[piece],
    onAxis = p.vertices.some((v) => ROTATIONS[rotation][v] === move.axis);
  if (move.layer === 'tip') return p.kind === 'tip' && onAxis;
  return move.layer === 'body' ? onAxis : !onAxis;
}
export function moveRotation(move: Move) {
  const r = AXIS_ROTATIONS[move.axis];
  return move.direction === 1 ? r : INVERSE[r];
}
export function turn(state: PuzzleState, token: string): PuzzleState {
  const move = parseMove(token),
    r = moveRotation(move);
  return {
    rotations: state.rotations.map((p, i) =>
      affects(i, p, move) ? COMPOSE[r][p] : p,
    ),
    frame: move.layer === 'base' ? COMPOSE[r][state.frame] : state.frame,
  };
}
export const apply = (state: PuzzleState, tokens: string[]) =>
  tokens.reduce(turn, state);
export function isSolved(state: PuzzleState) {
  return state.rotations.every((r) => r === state.frame);
}
export function scramble(length = 15) {
  const moves: string[] = [];
  let previous = -1;
  for (let i = 0; i < length; i++) {
    let axis: number;
    do {
      axis = Math.floor(Math.random() * 4);
    } while (axis === previous);
    moves.push(moveToken(axis, 'body', Math.random() < 0.5 ? 1 : -1));
    previous = axis;
  }
  for (let axis = 0; axis < 4; axis++)
    if (Math.random() < 2 / 3)
      moves.push(moveToken(axis, 'tip', Math.random() < 0.5 ? 1 : -1));
  return moves;
}
export function dragCandidates(
  state: PuzzleState,
  piece: number,
  face: number,
): Move[] {
  const p = PIECES[piece],
    rotation = ROTATIONS[state.rotations[piece]];
  if (p.kind !== 'edge')
    return [
      {
        axis: rotation[p.vertices[0]],
        layer: p.kind === 'tip' ? 'tip' : 'body',
        direction: 1,
      },
    ];
  // An edge belongs to two bottom layers. The vertex opposite that edge on
  // the touched face selects the visible layer; the other axis points at the back.
  const ends = p.vertices.map((v) => rotation[v]);
  const axis = [0, 1, 2, 3].find((v) => v !== face && !ends.includes(v))!;
  return [{ axis, layer: 'base', direction: 1 }];
}
export interface Tile {
  id: string;
  piece: number;
  face: number;
  points: Vec3[];
  uv: [number, number][];
}
export const FACE_VERTICES = VERTICES.map((normal, f) => {
  const ids = [0, 1, 2, 3].filter((i) => i !== f);
  if (
    dot(
      cross(
        VERTICES[ids[1]].map((v, i) => v - VERTICES[ids[0]][i]) as Vec3,
        VERTICES[ids[2]].map((v, i) => v - VERTICES[ids[0]][i]) as Vec3,
      ),
      normal,
    ) > 0
  )
    [ids[1], ids[2]] = [ids[2], ids[1]];
  return ids;
});
export const TILES: Tile[] = [];
for (let face = 0; face < 4; face++) {
  const ids = FACE_VERTICES[face];
  const point = (weights: number[]): Vec3 =>
    [0, 1, 2].map((k) =>
      weights.reduce((s, w, j) => s + (w * VERTICES[ids[j]][k]) / 3, 0),
    ) as Vec3;
  const add = (piece: number, weights: number[][]) => {
    const points = weights.map(point);
    const ab = points[1].map((x, k) => x - points[0][k]) as Vec3,
      ac = points[2].map((x, k) => x - points[0][k]) as Vec3;
    if (dot(cross(ab, ac), VERTICES[face]) > 0) {
      [points[1], points[2]] = [points[2], points[1]];
      [weights[1], weights[2]] = [weights[2], weights[1]];
    }
    TILES.push({
      id: `${face}-${PIECES[piece].id}`,
      piece,
      face,
      points,
      uv: weights.map((w) => [(w[2] + w[0] / 2) / 3, w[0] / 3]),
    });
  };
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3,
      k = (i + 2) % 3;
    const weights = (...entries: [number, number][]) => {
      const w = [0, 0, 0];
      for (const [index, n] of entries) w[index] = n;
      return w;
    };
    add(ids[i], [
      weights([i, 3]),
      weights([i, 2], [j, 1]),
      weights([i, 2], [k, 1]),
    ]);
    add(ids[i] + 4, [
      weights([i, 2], [j, 1]),
      [1, 1, 1],
      weights([i, 2], [k, 1]),
    ]);
    const edge = PIECES.findIndex(
      (p) =>
        p.kind === 'edge' &&
        p.vertices.includes(ids[j]) &&
        p.vertices.includes(ids[k]),
    );
    add(edge, [weights([j, 2], [k, 1]), weights([j, 1], [k, 2]), [1, 1, 1]]);
  }
}
