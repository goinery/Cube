import { tx } from '@/lib/i18n';
import Cube from 'cubejs';
import cfop from 'rubiks-cube-solver/lib/index.common.js';
import {
  apply,
  facelets,
  isSolved,
  isPictureSolved,
  toFaceletString,
  parseAlgorithm,
  simplify,
  uprightMoves,
  type CubeState,
  type Face,
} from './model';
import { correctCenters } from './centers';
import type { Stage } from './store';
export type SolveMode = 'fast' | 'near' | 'cfop';
export interface Solution {
  moves: string[];
  stages: Stage[];
  colorMoves: number;
  centerMoves: number;
  elapsed: number;
  mode: SolveMode;
}
let initialized = false;
export function solveState(
  initial: CubeState,
  mode: SolveMode,
  pictures: boolean,
  onProgress = (_message: string) => {},
): Solution {
  const started = performance.now(),
    setup = uprightMoves(initial),
    cube = apply(initial, setup),
    stages: Stage[] = [];
  const moves: string[] = [...setup];
  let colorMoves = 0;
  if (mode === 'cfop') {
    onProgress(tx('legacy.m466'));
    const fs = facelets(cube);
    const input = (['F', 'R', 'U', 'D', 'L', 'B'] as Face[])
      .map((f) => fs[f].map((x) => x.sticker.face.toLowerCase()).join(''))
      .join('');
    const parts = cfop(input, { partitioned: true }) as Record<
      'cross' | 'f2l' | 'oll' | 'pll',
      string | string[]
    >;
    const descriptions: Record<string, [string, string]> = {
      cross: [tx('legacy.m467'), tx('legacy.m468')],
      f2l: [tx('legacy.m469'), tx('legacy.m470')],
      oll: [tx('legacy.m471'), tx('legacy.m472')],
      pll: [tx('legacy.m473'), tx('legacy.m474')],
    };
    const x2: Record<string, string> = {
      U: 'D',
      D: 'U',
      F: 'B',
      B: 'F',
      R: 'R',
      L: 'L',
      u: 'd',
      d: 'u',
      f: 'b',
      b: 'f',
      r: 'r',
      l: 'l',
      M: 'M',
      E: 'E',
      S: 'S',
    };
    const conjugate = (m: string) => {
      const f = m[0],
        flip = f === 'E' || f === 'S';
      return (
        x2[f] + (m.includes('2') ? '2' : m.endsWith("'") !== flip ? "'" : '')
      );
    };
    for (const key of ['cross', 'f2l', 'oll', 'pll'] as const) {
      const start = moves.length;
      const part = parseAlgorithm([parts[key]].flat().join(' '));
      moves.push(...(key === 'cross' ? part : part.map(conjugate)));
      if (key === 'cross') moves.push('x2');
      if (key === 'pll') moves.push('x2');
      const [label, description] = descriptions[key];
      stages.push({
        name: key === 'cross' ? 'Cross' : key.toUpperCase(),
        label,
        description,
        start: key === 'cross' ? 0 : start,
        end: moves.length,
      });
    }
  } else if (!isSolved(cube)) {
    if (!initialized) {
      onProgress(tx('legacy.m475'));
      Cube.initSolver();
      initialized = true;
    }
    onProgress(tx('legacy.m476'));
    const c = Cube.fromString(toFaceletString(cube));
    let best = parseAlgorithm(c.solve());
    if (mode === 'near') {
      const cost = (candidate: string[]) =>
        candidate.length +
        (pictures ? correctCenters(apply(cube, candidate)).length : 0);
      let bestCost = cost(best);
      const prefixes = [
        'R',
        "R'",
        'U',
        "U'",
        'F',
        "F'",
        'L',
        "L'",
        'D',
        "D'",
        'B',
        "B'",
      ];
      for (let i = 0; i < prefixes.length; i++) {
        if (performance.now() - started > 14000) break;
        const pre = prefixes[i],
          candidate = Cube.fromString(toFaceletString(cube));
        candidate.move(pre);
        const option = simplify([pre, ...parseAlgorithm(candidate.solve())]),
          optionCost = cost(option);
        if (optionCost < bestCost) {
          best = option;
          bestCost = optionCost;
        }
        onProgress(tx('legacy.m477', { p0: i + 1, p1: bestCost }));
      }
    }
    moves.push(...best);
  }
  let result = apply(initial, moves);
  if (!isSolved(result)) throw new Error(tx('legacy.m478'));
  const alignment = uprightMoves(result);
  moves.push(...alignment);
  result = apply(result, alignment);
  colorMoves = moves.length;
  if (mode !== 'cfop' && colorMoves)
    stages.push({
      name: tx('legacy.m271'),
      label: tx('legacy.m479'),
      description: tx('legacy.m480'),
      start: 0,
      end: colorMoves,
    });
  if (pictures) {
    onProgress(tx('legacy.m481'));
    const centerMoves = correctCenters(result),
      start = moves.length;
    moves.push(...centerMoves);
    if (centerMoves.length)
      stages.push({
        name: tx('legacy.m482'),
        label: tx('legacy.m483'),
        description: tx('legacy.m484'),
        start,
        end: moves.length,
      });
    if (!isPictureSolved(apply(initial, moves)))
      throw new Error(tx('legacy.m485'));
  }
  return {
    moves,
    stages,
    colorMoves,
    centerMoves: moves.length - colorMoves,
    elapsed: performance.now() - started,
    mode,
  };
}
