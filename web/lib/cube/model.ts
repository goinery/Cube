import { tx, localized } from '@/lib/i18n';
export type Vec = [number, number, number];
export type Face = 'U' | 'R' | 'F' | 'D' | 'L' | 'B';
export const FACES: Face[] = ['U', 'R', 'F', 'D', 'L', 'B'];
export const COLORS: Record<Face, string> = {
  U: '#f2f3f5',
  R: '#ed211a',
  F: '#08a665',
  D: '#ffd52b',
  L: '#ff851c',
  B: '#0767eb',
};
export const FACE: Record<
  Face,
  {
    n: Vec;
    r: Vec;
    u: Vec;
    name: string;
  }
> = localized(() => ({
  U: { n: [0, 1, 0], r: [1, 0, 0], u: [0, 0, -1], name: tx('legacy.m114') },
  D: { n: [0, -1, 0], r: [1, 0, 0], u: [0, 0, 1], name: tx('legacy.m115') },
  F: { n: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0], name: tx('legacy.m118') },
  B: { n: [0, 0, -1], r: [-1, 0, 0], u: [0, 1, 0], name: tx('legacy.m119') },
  R: { n: [1, 0, 0], r: [0, 0, -1], u: [0, 1, 0], name: tx('legacy.m116') },
  L: { n: [-1, 0, 0], r: [0, 0, 1], u: [0, 1, 0], name: tx('legacy.m117') },
}));
export const dot = (a: Vec, b: Vec) => a.reduce((s, v, i) => s + v * b[i], 0);
export const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const add = (a: Vec, b: Vec): Vec => a.map((v, i) => v + b[i]) as Vec;
export const mul = (a: Vec, s: number): Vec => a.map((v) => v * s) as Vec;
export const equal = (a: Vec, b: Vec) => a.every((v, i) => v === b[i]);
export type Basis = [Vec, Vec, Vec];
export const identity = (): Basis => [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
export const transform = (v: Vec, b: Basis): Vec =>
  [0, 1, 2].map((i) => v[0] * b[0][i] + v[1] * b[1][i] + v[2] * b[2][i]) as Vec;
export function rotate(v: Vec, axis: number, turns: number): Vec {
  let r: Vec = [...v];
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++)
    r =
      axis === 0
        ? [r[0], -r[2], r[1]]
        : axis === 1
          ? [r[2], r[1], -r[0]]
          : [-r[1], r[0], r[2]];
  return r.map((n) => (n === 0 ? 0 : n)) as Vec;
}
export interface Sticker {
  id: string;
  face: Face;
  row: number;
  col: number;
}
export interface Piece {
  id: string;
  home: Vec;
  pos: Vec;
  basis: Basis;
  kind: 'corner' | 'edge' | 'center';
  stickers: Sticker[];
}
export type CubeState = Piece[];
export interface Move {
  token: string;
  axis: number;
  layers: number[];
  turns: number;
}
export function parseAlgorithm(input: string): string[] {
  const clean = input
    .replace(/[’′]/g, "'")
    .replace(/prime/gi, "'")
    .replace(/'2/g, '2')
    .trim();
  if (!clean) return [];
  const tokens = clean.split(/\s+/);
  for (const [i, t] of tokens.entries())
    if (
      !/^[URFDLBMESxyzurfdlb](w)?(2'?|')?$/.test(t) ||
      (t.includes('w') && !/^[URFDLB]w/.test(t))
    )
      throw new Error(tx('legacy.m439', { p0: i + 1, p1: t }));
  if (tokens.length > 20000) throw new Error(tx('legacy.m440'));
  return tokens.map((t) => t.replace("2'", '2'));
}
export function moveSpec(token: string): Move {
  const f = token[0],
    upper = f.toUpperCase();
  const map: Record<string, [number, number, number]> = {
    R: [0, 1, -1],
    L: [0, -1, 1],
    U: [1, 1, -1],
    D: [1, -1, 1],
    F: [2, 1, -1],
    B: [2, -1, 1],
    M: [0, 0, 1],
    E: [1, 0, 1],
    S: [2, 0, -1],
    X: [0, 1, -1],
    Y: [1, 1, -1],
    Z: [2, 1, -1],
  };
  const [axis, layer, sign] = map[upper];
  const layers = 'xyz'.includes(f)
    ? [-1, 0, 1]
    : 'urfdlb'.includes(f) || token.includes('w')
      ? [0, layer]
      : [layer];
  return {
    token,
    axis,
    layers,
    turns: sign * (token.includes('2') ? 2 : token.endsWith("'") ? -1 : 1),
  };
}
export function solved(): CubeState {
  const pieces: Piece[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        const home: Vec = [x, y, z],
          count = home.filter(Boolean).length;
        if (!count) continue;
        const stickers: Sticker[] = FACES.filter(
          (f) => dot(home, FACE[f].n) === 1,
        ).map((face) => ({
          id: `${face}${(1 - dot(home, FACE[face].u)) * 3 + dot(home, FACE[face].r) + 1}`,
          face,
          row: 1 - dot(home, FACE[face].u),
          col: dot(home, FACE[face].r) + 1,
        }));
        pieces.push({
          id: home.join(','),
          home,
          pos: [...home],
          basis: identity(),
          kind: count === 3 ? 'corner' : count === 2 ? 'edge' : 'center',
          stickers,
        });
      }
  return pieces;
}
export function turn(state: CubeState, token: string): CubeState {
  const { axis, layers, turns } = moveSpec(token);
  return state.map((p) =>
    !layers.includes(p.pos[axis])
      ? p
      : {
          ...p,
          pos: rotate(p.pos, axis, turns),
          basis: p.basis.map((v) => rotate(v, axis, turns)) as Basis,
        },
  );
}
export const apply = (state: CubeState, tokens: string[]) =>
  tokens.reduce(turn, state);
export const inverseMove = (m: string) =>
  m.includes('2') ? m : m.endsWith("'") ? m.slice(0, -1) : m + "'";
export const inverse = (moves: string[]) =>
  [...moves].reverse().map(inverseMove);
export interface Facelet {
  sticker: Sticker;
  piece: Piece;
  face: Face;
  row: number;
  col: number;
  angle: number;
}
export function facelets(state: CubeState): Record<Face, Facelet[]> {
  const result = Object.fromEntries(FACES.map((f) => [f, Array(9)])) as Record<
    Face,
    Facelet[]
  >;
  for (const piece of state)
    for (const sticker of piece.stickers) {
      const n = transform(FACE[sticker.face].n, piece.basis),
        up = transform(FACE[sticker.face].u, piece.basis);
      const face = FACES.find((f) => equal(n, FACE[f].n))!;
      const row = 1 - dot(piece.pos, FACE[face].u),
        col = 1 + dot(piece.pos, FACE[face].r);
      const angle = Math.round(
        (Math.atan2(dot(up, FACE[face].r), dot(up, FACE[face].u)) * 180) /
          Math.PI,
      );
      result[face][row * 3 + col] = { sticker, piece, face, row, col, angle };
    }
  return result;
}
export function toFaceletString(state: CubeState): string {
  const fs = facelets(state);
  return FACES.map((f) => fs[f].map((x) => x.sticker.face).join('')).join('');
}
export const isSolved = (state: CubeState) => {
  const fs = facelets(state);
  return FACES.every((f) =>
    fs[f].every((x) => x.sticker.face === fs[f][4].sticker.face),
  );
};
export const isPictureSolved = (state: CubeState) =>
  state.every(
    (p) =>
      equal(p.pos, p.home) && p.basis.every((v, i) => equal(v, identity()[i])),
  );
export function simplify(moves: string[]): string[] {
  const out: string[] = [];
  for (const m of moves) {
    const last = out.at(-1);
    if (last && last.replace(/[2']/g, '') === m.replace(/[2']/g, '')) {
      out.pop();
      const power = (powerOf(last) + powerOf(m)) % 4;
      if (power)
        out.push(
          m.replace(/[2']/g, '') + (power === 1 ? '' : power === 2 ? '2' : "'"),
        );
    } else out.push(m);
  }
  return out;
}
const powerOf = (m: string) => (m.includes('2') ? 2 : m.endsWith("'") ? 3 : 1);
export function scramble(length = 25): string[] {
  const moves: string[] = [];
  let prev = -1;
  for (let i = 0; i < length; i++) {
    let face: Face;
    do {
      face = FACES[Math.floor(Math.random() * 6)];
    } while (moveSpec(face).axis === prev);
    prev = moveSpec(face).axis;
    moves.push(face + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return moves;
}
export function uprightMoves(state: CubeState): string[] {
  const q: {
      state: CubeState;
      moves: string[];
    }[] = [{ state, moves: [] }],
    seen = new Set<string>();
  while (q.length) {
    const item = q.shift()!,
      fs = facelets(item.state),
      key = FACES.map((f) => fs[f][4].sticker.face).join('');
    if (key === FACES.join('')) return item.moves;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const m of ['x', 'y', 'z'])
      q.push({ state: turn(item.state, m), moves: [...item.moves, m] });
  }
  throw new Error(tx('legacy.m441'));
}
