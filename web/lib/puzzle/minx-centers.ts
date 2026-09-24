import { inverseMove, moveSpec } from './model';
import { simplifyMoves } from './orbit-solver';
import type { Definition, PuzzleState } from './types';

const mod = (value: number) => ((value % 5) + 5) % 5;
const deltas = [
  [3, 4],
  [4, 3],
  [2, 1],
  [1, 2],
];
const pairPaths = new Map<number, number[]>([[0, []]]),
  queue = [0];
for (let i = 0; i < queue.length; i++)
  for (let m = 0; m < 4; m++) {
    const key = queue[i],
      next =
        mod(Math.floor(key / 5) + deltas[m][0]) * 5 +
        mod((key % 5) + deltas[m][1]);
    if (!pairPaths.has(next)) {
      pairPaths.set(next, [...pairPaths.get(key)!, m]);
      queue.push(next);
    }
  }
type Operation = { a: number; b: number; kind: number };
type Plan = { cost: number; operations: Operation[] };

/** Optimize paired marked-center rotations over several spanning trees. */
export function solveMinxCenters(def: Definition, state: PuzzleState) {
  const values = def.faces.map((face) => {
    const piece = def.tiles.find(
      (t) => t.face === face.id && def.pieces[t.piece].kind === 'center',
    )!.piece;
    let g = 0;
    for (let n = 0; n < 5; n++) {
      if (g === state.rotations[piece]) return n;
      g = def.group.multiply[moveSpec(def, face.id).rotation][g];
    }
    throw new Error('solver.invalid');
  });
  if (values.every((v) => v === 0)) return [];
  const adjacent = (a: number, b: number) =>
    a !== b &&
    def.faces[a].normal.reduce((s, v, i) => s + v * def.faces[b].normal[i], 0) >
      0.4;
  let best: Plan | undefined;
  for (let root = 0; root < 12; root++)
    for (let offset = 0; offset < 12; offset++) {
      const parent = new Array<number>(12).fill(-1),
        order = [root];
      parent[root] = root;
      for (let i = 0; i < order.length; i++)
        for (let n = 0; n < 12; n++) {
          const j = (n + offset) % 12;
          if (parent[j] < 0 && adjacent(order[i], j)) {
            parent[j] = order[i];
            order.push(j);
          }
        }
      const plans = new Map<number, (Plan | undefined)[]>();
      for (const node of [...order].reverse()) {
        let dp: (Plan | undefined)[] = new Array(5);
        dp[values[node]] = { cost: 0, operations: [] };
        for (const child of order.filter(
          (j) => j !== root && parent[j] === node,
        )) {
          const next: (Plan | undefined)[] = new Array(5),
            below = plans.get(child)!;
          for (let a = 0; a < 5; a++)
            for (let b = 0; b < 5; b++)
              for (let delta = 0; delta < 5; delta++) {
                if (!dp[a] || !below[b]) continue;
                const path = pairPaths.get(mod(-b) * 5 + delta)!,
                  cost = dp[a]!.cost + below[b]!.cost + path.length,
                  target = mod(a + delta);
                if (!next[target] || cost < next[target]!.cost)
                  next[target] = {
                    cost,
                    operations: [
                      ...dp[a]!.operations,
                      ...below[b]!.operations,
                      ...path.map((kind) => ({ a: child, b: node, kind })),
                    ],
                  };
              }
          dp = next;
        }
        plans.set(node, dp);
      }
      const result = plans.get(root)![0];
      if (result && (!best || result.cost < best.cost)) best = result;
    }
  if (!best) throw new Error('solver.failed');
  return simplifyMoves(
    def,
    best.operations.flatMap(({ a, b, kind }) => {
      const A = def.faces[a].id,
        B = def.faces[b].id;
      // Both 36-move sequences fix every edge and corner; inverse variants are free.
      const word = Array.from({ length: 18 }, () =>
        kind % 2 === 0 ? [A, B + "2'"] : [A + "2'", B],
      ).flat();
      return kind >= 2
        ? word.reverse().map((token) => inverseMove(def, token))
        : word;
    }),
  );
}
