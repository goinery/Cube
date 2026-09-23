import {
  rotatePoint,
  moveSpec,
  inverseMove,
  apply,
  pictureSolved,
  colorSolved,
} from './model';
import type { Definition, Message, PuzzleState, Stage } from './types';
import { shortSolution } from './short-search';

type Perm = Uint16Array;
type Word =
  | { token: string; length: number }
  | { a: Word; b: Word; length: number }
  | { inverse: Word; length: number };
interface Element {
  p: Perm;
  inv: Perm;
  word: Word | null;
}
interface Level {
  base: number;
  orbit: number[];
  reps: Map<number, Element>;
  generators: Element[];
}
interface Orbit {
  pieces: number[];
  representative: number;
  homePieces: number[];
  offset: number;
}
const chains = new WeakMap<Definition, Level[]>();
const identity = (n: number) => Uint16Array.from({ length: n }, (_, i) => i);
const multiply = (a: Perm, b: Perm) => Uint16Array.from(b, (v) => a[v]);
const invert = (p: Perm) => {
  const q = new Uint16Array(p.length);
  p.forEach((v, i) => (q[v] = i));
  return q;
};
const isIdentity = (p: Perm) => p.every((v, i) => v === i);
const cat = (a: Word | null, b: Word | null): Word | null =>
  !a ? b : !b ? a : { a, b, length: Math.min(1e12, a.length + b.length) };
const invWord = (w: Word | null): Word | null =>
  !w ? null : 'inverse' in w ? w.inverse : { inverse: w, length: w.length };
const make = (p: Perm, word: Word | null): Element => ({
  p,
  inv: invert(p),
  word,
});
const compose = (a: Element, b: Element): Element =>
  make(multiply(a.p, b.p), cat(b.word, a.word));
const inverseElement = (e: Element): Element => ({
  p: e.inv,
  inv: e.p,
  word: invWord(e.word),
});

export function puzzleOrbits(def: Definition): Orbit[] {
  const remaining = new Set(def.pieces.map((_, i) => i)),
    orbits: Orbit[] = [];
  while (remaining.size) {
    const representative = remaining.values().next().value!,
      anchor = def.pieces[representative].anchor;
    const homePieces = def.group.quaternions.map((_, g) => {
      const position = rotatePoint(def, g, anchor);
      const i = def.pieces.findIndex(
        (p) =>
          p.kind === def.pieces[representative].kind &&
          p.anchor.every((x, k) => Math.abs(x - position[k]) < 1e-5),
      );
      if (i < 0) throw new Error('solver.invalid');
      return i;
    });
    const pieces = [...new Set(homePieces)];
    pieces.forEach((i) => remaining.delete(i));
    orbits.push({
      representative,
      pieces,
      homePieces,
      offset: orbits.length * def.group.quaternions.length,
    });
  }
  return orbits;
}
function statePermutation(
  def: Definition,
  orbits: Orbit[],
  state: PuzzleState,
): Perm {
  return Uint16Array.from(
    orbits.flatMap((orbit) =>
      orbit.homePieces.map(
        (piece, g) =>
          orbit.offset + def.group.multiply[state.rotations[piece]][g],
      ),
    ),
  );
}
function flatten(def: Definition, word: Word | null, limit: number): string[] {
  const result: string[] = [],
    stack: { word: Word; inverse: boolean }[] = word
      ? [{ word, inverse: false }]
      : [];
  let visited = 0;
  const push = (token: string) => {
    const last = result.at(-1);
    if (last && inverseMove(def, last) === token) {
      result.pop();
      return;
    }
    if (last) {
      const a = moveSpec(def, last),
        b = moveSpec(def, token);
      if (a.key === b.key) {
        const cycle = Math.round((2 * Math.PI) / def.step),
          power =
            ((Math.round(-(a.angle + b.angle) / def.step) % cycle) + cycle) %
            cycle;
        result.pop();
        if (power)
          result.push(
            a.key +
              (power === 1
                ? ''
                : power === cycle - 1
                  ? "'"
                  : power === 2
                    ? '2'
                    : "2'"),
          );
        return;
      }
    }
    result.push(token);
  };
  while (stack.length) {
    if (++visited > 5_000_000 || result.length > limit)
      throw new Error('solver.limit');
    const { word: w, inverse: flip } = stack.pop()!;
    if ('token' in w) push(flip ? inverseMove(def, w.token) : w.token);
    else if ('inverse' in w) stack.push({ word: w.inverse, inverse: !flip });
    else if (flip) {
      stack.push({ word: w.a, inverse: true }, { word: w.b, inverse: true });
    } else
      stack.push({ word: w.b, inverse: false }, { word: w.a, inverse: false });
  }
  return result;
}

/** A stabilizer chain acts on oriented piece frames, including marked centers.
 * Every transversal retains a word in physical turns; no operation history is
 * needed and an exact picture target is handled by the same group action. */
export function solveGroup(
  def: Definition,
  state: PuzzleState,
  mode: 'fast' | 'short' | 'teaching',
  pictures: boolean,
  progress: (message: Message) => void,
) {
  if (pictures ? pictureSolved(def, state) : colorSolved(def, state))
    return { moves: [], stages: [] as Stage[] };
  const short = shortSolution(def, state);
  if (short) return { moves: short, stages: [] as Stage[] };
  const original = state,
    frameMoves: string[] = [];
  if (def.id === 'megaminx') {
    const centers = def.pieces.flatMap((piece, i) =>
      piece.kind === 'center' ? [i] : [],
    );
    const frame = def.group.quaternions.findIndex((_, g) =>
      centers.every((i) => {
        const a = rotatePoint(def, state.rotations[i], def.pieces[i].anchor),
          b = rotatePoint(def, g, def.pieces[i].anchor);
        return a.every((x, k) => Math.abs(x - b[k]) < 1e-5);
      }),
    );
    if (frame < 0) throw new Error('solver.invalid');
    const goal = def.group.inverse[frame],
      queue = [0],
      paths = new Map<number, string[]>([[0, []]]);
    for (let i = 0; i < queue.length && !paths.has(goal); i++)
      for (const face of def.faces) {
        const token = `@${face.id}`,
          r = def.group.multiply[moveSpec(def, token).rotation][queue[i]];
        if (!paths.has(r)) {
          paths.set(r, [...paths.get(queue[i])!, token]);
          queue.push(r);
        }
      }
    frameMoves.push(...(paths.get(goal) || []));
    state = apply(def, state, frameMoves);
  }
  const orbits = puzzleOrbits(def),
    degree = orbits.length * def.group.quaternions.length,
    n = def.group.quaternions.length;
  const target = statePermutation(def, orbits, state);
  if (new Set(target).size !== degree) throw new Error('solver.invalid');
  const base: number[] = [],
    baseKinds: string[] = [];
  const priorities: Record<string, number> = {
    corner: 0,
    edge: 1,
    wing: 2,
    center: 3,
    't-center': 4,
    'x-center': 5,
  };
  for (const orbit of [...orbits].sort(
    (a, b) =>
      priorities[def.pieces[a.representative].kind] -
      priorities[def.pieces[b.representative].kind],
  )) {
    const chosen = new Set<number>();
    orbit.homePieces.forEach((piece, g) => {
      if (!chosen.has(piece)) {
        chosen.add(piece);
        base.push(orbit.offset + g);
        baseKinds.push(def.pieces[piece].kind);
      }
    });
  }
  // A single flag at each physical position fixes both its position and frame.
  const generators: Element[] = def.primitiveMoves
    .flatMap((token) => [token, inverseMove(def, token)])
    .map((token) =>
      make(
        statePermutation(
          def,
          orbits,
          apply(def, { rotations: def.pieces.map(() => 0) }, [token]),
        ),
        { token, length: 1 },
      ),
    );
  const levels: Level[] = [];
  const started = performance.now();
  let operations = 0,
    report = 0;
  function budget() {
    if (++operations % 1024 === 0) {
      if (performance.now() - started > 110_000)
        throw new Error('solver.limit');
      if (performance.now() - report > 200) {
        progress({
          key: 'solver.tables',
          params: { level: levels.length, count: generators.length },
        });
        report = performance.now();
      }
    }
  }
  function rebuild() {
    levels.length = 0;
    for (let i = 0; i < base.length; i++) {
      const selected = generators.filter((g) =>
        base.slice(0, i).every((b) => g.p[b] === b),
      );
      const reps = new Map<number, Element>([
          [base[i], make(identity(degree), null)],
        ]),
        orbit = [base[i]];
      for (let j = 0; j < orbit.length; j++)
        for (const g of selected) {
          budget();
          const x = orbit[j],
            y = g.p[x];
          if (!reps.has(y)) {
            reps.set(y, compose(g, reps.get(x)!));
            orbit.push(y);
          }
        }
      levels.push({ base: base[i], orbit, reps, generators: selected });
    }
  }
  function sift(element: Element, start = 0): Element {
    let g = element;
    for (let i = start; i < levels.length; i++) {
      const level = levels[i],
        image = g.p[level.base];
      if (image === level.base) continue;
      const rep = level.reps.get(image);
      if (!rep) return g;
      g = compose(inverseElement(rep), g);
    }
    return g;
  }
  const signatures = new Set(generators.map((g) => Array.from(g.p).join(',')));
  function insert(g: Element) {
    if (isIdentity(g.p)) return false;
    const key = Array.from(g.p).join(',');
    if (signatures.has(key)) return false;
    signatures.add(key);
    generators.push(g, inverseElement(g));
    return true;
  }
  const cached = chains.get(def);
  if (cached) levels.push(...cached);
  else {
    rebuild();
    // Short commutators provide sparse local cycles before the full Schreier
    // closure, keeping the stored turn words substantially smaller.
    const primitive = [...generators];
    for (let i = 0; i < primitive.length; i += 2)
      for (let j = i + 2; j < primitive.length; j += 2) {
        budget();
        const a = primitive[i],
          b = primitive[j],
          commutator = compose(
            inverseElement(b),
            compose(inverseElement(a), compose(b, a)),
          );
        let power = commutator;
        for (let k = 0; k < 5; k++) {
          const residue = sift(power);
          if (insert(residue)) rebuild();
          power = compose(commutator, power);
        }
      }
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let i = levels.length - 1; i >= 0; i--) {
        const level = levels[i];
        for (const x of level.orbit)
          for (const g of level.generators) {
            budget();
            const y = g.p[x],
              ux = level.reps.get(x)!,
              uy = level.reps.get(y)!;
            const schreier = compose(inverseElement(uy), compose(g, ux));
            const remainder = sift(schreier, i + 1);
            if (insert(remainder)) {
              rebuild();
              changed = true;
              break outer;
            }
          }
      }
    }
    chains.set(def, [...levels]);
  }
  progress({ key: 'solver.searching' });
  function factor(permutation: Perm) {
    let current = make(permutation, null);
    const moves: string[] = [],
      stages: Stage[] = [];
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i],
        rep = level.reps.get(current.p[level.base]);
      if (!rep) throw new Error('solver.invalid');
      const start = moves.length,
        segment = flatten(def, invWord(rep.word), 20000 - moves.length);
      moves.push(...segment);
      current = compose(inverseElement(rep), current);
      const key = `puzzle.${baseKinds[i]}`,
        last = stages.at(-1);
      if (moves.length > start) {
        if (last?.params?.kindKey === key) last.end = moves.length;
        else
          stages.push({
            key: 'solver.stage',
            params: { kindKey: key },
            start,
            end: moves.length,
          });
      }
    }
    if (!isIdentity(current.p)) throw new Error('solver.invalid');
    return { moves, stages };
  }
  let { moves, stages } = factor(target);
  if (mode === 'short') {
    for (let g = 1; g < Math.min(13, def.group.quaternions.length); g++) {
      budget();
      const rotation = statePermutation(def, orbits, {
          rotations: def.pieces.map(() => g),
        }),
        candidateTarget = multiply(
          rotation,
          multiply(target, invert(rotation)),
        );
      try {
        const candidate = factor(candidateTarget).moves.map((token) => {
          const move = moveSpec(def, token),
            axis = rotatePoint(def, def.group.inverse[g], move.axis),
            face = def.faces.find(
              (f) => f.normal.reduce((s, x, i) => s + x * axis[i], 0) > 0.99999,
            )!;
          const key =
            def.id === 'megaminx'
              ? face.id
              : move.key.replace(/[RUF]/, face.id);
          return key + token.slice(move.key.length);
        });
        if (candidate.length < moves.length) moves = candidate;
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'solver.limit')
          throw error;
      }
    }
    stages = [];
  }
  stages = stages.map((stage) => ({
    ...stage,
    start: stage.start + frameMoves.length,
    end: stage.end + frameMoves.length,
  }));
  if (frameMoves.length)
    stages.unshift({ key: 'solver.frame', start: 0, end: frameMoves.length });
  moves = [...frameMoves, ...moves];
  progress({ key: 'solver.verify' });
  const result = apply(def, original, moves);
  if (!pictureSolved(def, result)) throw new Error('solver.failed');
  if (mode === 'short') {
    // Whole-state factorization is exact. Adjacent reductions preserve the same
    // permutation and improve the displayed sequence without claiming optimality.
    return {
      moves: flatten(
        def,
        moves.reduce<Word | null>(
          (w, token) => cat(w, { token, length: 1 }),
          null,
        ),
        20000,
      ),
      stages: [],
    };
  }
  return { moves, stages: mode === 'teaching' ? stages : [] };
}
