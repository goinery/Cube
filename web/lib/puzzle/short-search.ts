import { apply, inverse, moveSpec, solved } from './model';
import type { Definition, PuzzleState } from './types';

/** Meet in the middle avoids long group factorizations for nearby states. */
export function shortSolution(def: Definition, state: PuzzleState): string[] | null {
  const tokens = def.primitiveMoves.flatMap(key =>
    (def.id === 'megaminx' ? ['', "'", '2', "2'"] : ['', "'", '2']).map(suffix => key + suffix),
  );
  const moves = tokens.map(token => moveSpec(def, token));
  const signature = (s: PuzzleState) => String.fromCharCode(...s.rotations);
  const home = solved(def);
  const target = signature(state);
  const fromHome = new Map<string, string[]>([[signature(home), []]]);
  let layer = [{ state: home, path: [] as string[], last: -1 }];
  for (let depth = 0; depth < 2; depth++) {
    const next: typeof layer = [];
    for (const node of layer) for (let i = 0; i < tokens.length; i++) {
      if (node.last >= 0 && moves[node.last].key === moves[i].key) continue;
      const moved = apply(def, node.state, [tokens[i]]), key = signature(moved);
      if (fromHome.has(key)) continue;
      const path = [...node.path, tokens[i]];
      fromHome.set(key, path);
      if (key === target) return inverse(def, path);
      next.push({ state: moved, path, last: i });
    }
    layer = next;
  }
  layer = [{ state, path: [], last: -1 }];
  for (let depth = 0; depth < 2; depth++) {
    const next: typeof layer = [];
    for (const node of layer) for (let i = 0; i < tokens.length; i++) {
      if (node.last >= 0 && moves[node.last].key === moves[i].key) continue;
      const moved = apply(def, node.state, [tokens[i]]), path = [...node.path, tokens[i]];
      const other = fromHome.get(signature(moved));
      if (other) return [...path, ...inverse(def, other)];
      if (depth === 0) next.push({ state: moved, path, last: i });
    }
    layer = next;
  }
  return null;
}
