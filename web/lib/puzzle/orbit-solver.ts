import { apply, inverseMove, rotatePoint, solved } from './model';
import type { Definition, PuzzleState } from './types';
const near = (a: number[], b: number[]) =>
  a.every((v, i) => Math.abs(v - b[i]) < 1e-5);
function permutation(def: Definition, state: PuzzleState, pieces: number[]) {
  return pieces.map((i) =>
    pieces.findIndex((j) =>
      near(
        rotatePoint(def, state.rotations[i], def.pieces[i].anchor),
        def.pieces[j].anchor,
      ),
    ),
  );
}
const seeds: Record<string, string> = {
  wing: "R U 2R U' R' U 2R' U'",
  center: "R 2U 2R 2U' R' 2U 2R' 2U'",
  'x-center': "R 2U 2R 2U' R' 2U 2R' 2U'",
  't-center': "R 2U 3R 2U' R' 2U 3R' 2U'",
};
type CycleTable = { pieces: number[]; words: Map<number, string[]> };
const tables = new Map<string, CycleTable>();
const cycleKey = (a: number, b: number, c: number) =>
  a < b && a < c
    ? (a * 24 + b) * 24 + c
    : b < c
      ? (b * 24 + c) * 24 + a
      : (c * 24 + a) * 24 + b;
function cycleTable(def: Definition, kind: string) {
  const key = def.id + kind,
    cached = tables.get(key);
  if (cached) return cached;
  const pieces = def.pieces.flatMap((p, i) => (p.kind === kind ? [i] : []));
  const seed = seeds[kind].split(' '),
    result = apply(def, solved(def), seed);
  if (result.rotations.some((r, i) => r && !pieces.includes(i)))
    throw new Error('solver.invalid');
  const perm = permutation(def, result, pieces),
    a = perm.findIndex((p, i) => p !== i),
    b = perm[a],
    c = perm[b];
  if (perm[c] !== a || perm.filter((p, i) => p !== i).length !== 3)
    throw new Error('solver.invalid');
  const generators = def.primitiveMoves.flatMap((m) => [m, m + "'", m + '2']);
  const permutations = generators.map((m) =>
    permutation(def, apply(def, solved(def), [m]), pieces),
  );
  const words = new Map<number, string[]>(),
    queue: [[number, number, number], string[]][] = [[[a, b, c], seed]];
  words.set(cycleKey(a, b, c), seed);
  for (let i = 0; i < queue.length; i++) {
    const [cycle, word] = queue[i];
    for (let g = 0; g < generators.length; g++) {
      const next = cycle.map((v) => permutations[g][v]) as [
          number,
          number,
          number,
        ],
        key = cycleKey(...next);
      if (words.has(key)) continue;
      const newWord = [inverseMove(def, generators[g]), ...word, generators[g]];
      words.set(key, newWord);
      queue.push([next, newWord]);
    }
  }
  if (words.size !== 4048) throw new Error('solver.invalid');
  const table = { pieces, words };
  tables.set(key, table);
  return table;
}
export function simplifyMoves(def: Definition, moves: string[]) {
  const result: string[] = [];
  const order = def.id === 'megaminx' ? 5 : 4;
  const opposite: Record<string, string> = {
    R: 'L',
    L: 'R',
    U: 'D',
    D: 'U',
    F: 'B',
    B: 'F',
  };
  const axis = (token: string) =>
    token
      .replace(/[0-9w']/g, '')
      .replace(/[RLxM]/, 'x')
      .replace(/[UDyE]/, 'y')
      .replace(/[FBzS]/, 'z');
  for (let token of moves) {
    if (order === 4) {
      const layer = token.match(/^(\d+)([URFDLB])(2'?|')?$/);
      if (layer && Number(layer[1]) > Math.ceil(def.order / 2)) {
        const depth = def.order + 1 - Number(layer[1]);
        token =
          (depth === 1 ? '' : depth) +
          opposite[layer[2]] +
          (layer[3]?.startsWith('2') ? '2' : layer[3] === "'" ? '' : "'");
      }
    }
    const match = token.match(/^(.*?)(2'?|')?$/)!;
    const base = match[1],
      turns =
        match[2] === "2'"
          ? -2
          : match[2] === '2'
            ? 2
            : match[2] === "'"
              ? -1
              : 1;
    let index = result.length - 1;
    if (order === 4)
      while (
        index >= 0 &&
        axis(result[index]) === axis(token) &&
        result[index].match(/^(.*?)(2'?|')?$/)![1] !== base
      )
        index--;
    const previous = result[index]?.match(/^(.*?)(2'?|')?$/);
    if (previous?.[1] === base) {
      result.splice(index, 1);
      const a =
        previous[2] === "2'"
          ? -2
          : previous[2] === '2'
            ? 2
            : previous[2] === "'"
              ? -1
              : 1;
      const n = (((a + turns) % order) + order) % order;
      if (n)
        result.splice(
          index,
          0,
          base + (n === 1 ? '' : n === order - 1 ? "'" : n === 2 ? '2' : "2'"),
        );
    } else result.push(token);
  }
  return result;
}

/** Choose short three-cycles by how many correct pieces/colors they restore. */
export function solveOrbit(
  def: Definition,
  state: PuzzleState,
  kind: string,
  pictures: boolean,
) {
  const table = cycleTable(def, kind),
    p = permutation(def, state, table.pieces);
  const at = new Array<number>(24);
  p.forEach((slot, home) => (at[slot] = home));
  const faces = table.pieces.map(
    (piece) => def.tiles.find((t) => t.piece === piece)!.face,
  );
  const correct = (slot: number, home: number) =>
    pictures || !kind.includes('center')
      ? slot === home
      : faces[slot] === faces[home];
  const words = [...table.words].map(([key, word]) => ({
    a: Math.floor(key / 576),
    b: Math.floor(key / 24) % 24,
    c: key % 24,
    word: simplifyMoves(def, word),
  }));
  const result: string[] = [];
  for (
    let n = 0;
    n < 24 && at.some((home, slot) => !correct(slot, home));
    n++
  ) {
    let best: (typeof words)[number] | undefined,
      score = 0;
    for (const cycle of words) {
      const { a, b, c, word } = cycle;
      const gain =
        Number(correct(b, at[a])) +
        Number(correct(c, at[b])) +
        Number(correct(a, at[c])) -
        Number(correct(a, at[a])) -
        Number(correct(b, at[b])) -
        Number(correct(c, at[c]));
      const value = gain / word.length;
      if (value > score) {
        best = cycle;
        score = value;
      }
    }
    if (!best) throw new Error('solver.invalid');
    const { a, b, c, word } = best;
    [at[a], at[b], at[c]] = [at[c], at[a], at[b]];
    result.push(...word);
  }
  if (at.some((home, slot) => !correct(slot, home)))
    throw new Error('solver.failed');
  return result;
}
