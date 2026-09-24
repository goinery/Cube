import {
  apply,
  definition,
  inverseMove,
  moveSpec,
  rotatePoint,
  solved,
} from './model';
import { solveFourColor } from './four-phase';
import { simplifyMoves } from './orbit-solver';
import type { Definition, PuzzleState } from './types';

const near = (a: number[], b: number[]) =>
  a.every((v, i) => Math.abs(v - b[i]) < 1e-5);
type Macro = { permutation: number[]; word: string[] };
type EdgeTable = { pieces: number[]; homes: number[]; macros: Macro[] };
let edges: EdgeTable | undefined;

function edgeTable(def: Definition): EdgeTable {
  if (edges) return edges;
  const pieces = def.pieces.flatMap((p, i) => (p.kind === 'edge' ? [i] : [])),
    representative = pieces[0];
  // Each group element is one of 24 oriented edge positions, not just a slot.
  const homes = pieces.map((i) =>
    def.group.quaternions.findIndex((_, g) =>
      near(
        rotatePoint(def, g, def.pieces[representative].anchor),
        def.pieces[i].anchor,
      ),
    ),
  );
  const slots = def.group.quaternions.map((_, g) =>
    pieces.findIndex((i) =>
      near(
        rotatePoint(def, g, def.pieces[representative].anchor),
        def.pieces[i].anchor,
      ),
    ),
  );
  const generators = def.primitiveMoves.flatMap((m) => [m, m + "'", m + '2']);
  const transitions = generators.map((token) => {
    const move = moveSpec(def, token);
    return def.group.quaternions.map((_, g) =>
      move.affects(representative, g)
        ? def.group.multiply[move.rotation][g]
        : g,
    );
  });
  const word = "R U 3R U' R' U 3R' U'".split(' ');
  const result = apply(def, solved(def), word);
  if (result.rotations.some((r, i) => r && !pieces.includes(i)))
    throw new Error('solver.invalid');
  const permutation = def.group.quaternions.map((_, g) =>
    word.reduce((r, token) => {
      const move = moveSpec(def, token);
      return move.affects(representative, r)
        ? def.group.multiply[move.rotation][r]
        : r;
    }, g),
  );
  const queue: Macro[] = [{ permutation, word }],
    seen = new Set([permutation.join(',')]);
  for (let head = 0; head < queue.length; head++)
    for (let g = 0; g < generators.length; g++) {
      const source = queue[head],
        transform = transitions[g],
        next = new Array<number>(24);
      for (let h = 0; h < 24; h++)
        next[transform[h]] = transform[source.permutation[h]];
      const key = next.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push({
        permutation: next,
        word: simplifyMoves(def, [
          inverseMove(def, generators[g]),
          ...source.word,
          generators[g],
        ]),
      });
    }
  if (queue.length !== 1760) throw new Error('solver.invalid');
  // Two opposite three-cycles can flip two edges without moving any slot.
  // Include those macros so pure orientation errors never stall the reduction.
  const bySlots = new Map<string, Macro[]>();
  for (const macro of queue) {
    const key = homes.map((h) => slots[macro.permutation[h]]).join(',');
    const group = bySlots.get(key) || [];
    group.push(macro);
    bySlots.set(key, group);
  }
  const flips = new Map<string, Macro>();
  for (const first of queue) {
    const destinations = homes.map((h) => slots[first.permutation[h]]);
    const inverse = destinations
      .map((_, i) => destinations.indexOf(i))
      .join(',');
    for (const second of bySlots.get(inverse) || []) {
      const next = first.permutation.map((h) => second.permutation[h]);
      if (next.every((v, i) => v === i)) continue;
      const key = next.join(','),
        word = simplifyMoves(def, [...first.word, ...second.word]);
      if (!flips.has(key) || flips.get(key)!.word.length > word.length)
        flips.set(key, { permutation: next, word });
    }
  }
  if (flips.size !== 66) throw new Error('solver.invalid');
  edges = { pieces, homes, macros: [...queue, ...flips.values()] };
  return edges;
}

function alignCenters(def: Definition, state: PuzzleState) {
  const centers = def.pieces.flatMap((p, i) =>
    p.kind === 'center' ? [i] : [],
  );
  const frame = def.group.quaternions.findIndex((_, g) =>
    centers.every((i) =>
      near(
        rotatePoint(def, g, def.pieces[i].anchor),
        rotatePoint(def, state.rotations[i], def.pieces[i].anchor),
      ),
    ),
  );
  if (frame < 0) throw new Error('solver.invalid');
  const goal = def.group.inverse[frame],
    paths = new Map<number, string[]>([[0, []]]),
    queue = [0];
  const tokens = ['3R', '3U', '3F'].flatMap((m) => [m, m + "'", m + '2']);
  for (let head = 0; head < queue.length && !paths.has(goal); head++)
    for (const token of tokens) {
      const next =
        def.group.multiply[moveSpec(def, token).rotation][queue[head]];
      if (!paths.has(next)) {
        queue.push(next);
        paths.set(next, [...paths.get(queue[head])!, token]);
      }
    }
  return paths.get(goal)!;
}

export function solveFiveSkeleton(def: Definition, initial: PuzzleState) {
  const four = definition('cube-4');
  // Remove the middle slice: corners, wings and X centers form a real 4x4.
  const projection = {
    rotations: four.pieces.map((piece) => {
      const home = piece.anchor.map((x) =>
        Math.abs(x) === 3 ? (x / 3) * 4 : x * 2,
      );
      const index = def.pieces.findIndex((p) => near(p.anchor, home));
      if (index < 0) throw new Error('solver.invalid');
      return initial.rotations[index];
    }),
  };
  const result = solveFourColor(four, projection);
  let state = apply(def, initial, result);
  const alignment = alignCenters(def, state);
  result.push(...alignment);
  state = apply(def, state, alignment);
  const table = edgeTable(def);
  let current = table.pieces.map(
    (piece, i) => def.group.multiply[state.rotations[piece]][table.homes[i]],
  );
  for (
    let iteration = 0;
    iteration < 12 && current.some((g, i) => g !== table.homes[i]);
    iteration++
  ) {
    const fixed = current.filter((g, i) => g === table.homes[i]).length;
    let best: Macro | undefined,
      score = 0;
    for (const macro of table.macros) {
      const gain =
        current.filter((g, i) => macro.permutation[g] === table.homes[i])
          .length - fixed;
      const value = gain / macro.word.length;
      if (value > score) {
        best = macro;
        score = value;
      }
    }
    if (!best) throw new Error('solver.invalid');
    result.push(...best.word);
    current = current.map((g) => best!.permutation[g]);
  }
  if (current.some((g, i) => g !== table.homes[i]))
    throw new Error('solver.failed');
  return result;
}
