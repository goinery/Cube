import Cube from 'cubejs';
import cfop from 'rubiks-cube-solver/lib/index.common.js';
import {
apply,
facelets,
isSolved,
isPictureSolved,
toFaceletString,
parseAlgorithm,
uprightMoves,
type CubeState,
type Face,
} from './model';
import { correctCenters } from './centers';
import type { SolveMode, SolveOutput } from '../engine/solver-types';
import type { Message, Stage } from '../engine/types';
let initialized = false;
export function solveState(
  initial: CubeState,
  mode: SolveMode,
  pictures: boolean,
  onProgress = (_message: Message) => {},
): SolveOutput {
  if (mode !== 'standard' && mode !== 'cfop') throw new Error('solver.unsupportedMode');
  if (pictures ? isPictureSolved(initial) : isSolved(initial))
    return { moves: [], stages: [], colorMoves: 0, centerMoves: 0 };
  const setup = uprightMoves(initial),
    cube = apply(initial, setup),
    stages: Stage[] = [];
  const moves: string[] = [...setup];
  let colorMoves = 0;
  if (mode === 'cfop' && !isSolved(cube)) {
    onProgress({ key: 'legacy.m466' });
    const fs = facelets(cube);
    const input = (['F', 'R', 'U', 'D', 'L', 'B'] as Face[])
      .map((f) => fs[f].map((x) => x.sticker.face.toLowerCase()).join(''))
      .join('');
    const parts = cfop(input, { partitioned: true }) as Record<
      'cross' | 'f2l' | 'oll' | 'pll',
      string | string[]
    >;
    const descriptions: Record<string, [string, string]> = {
      cross: ['legacy.m467', 'legacy.m468'],
      f2l: ['legacy.m469', 'legacy.m470'],
      oll: ['legacy.m471', 'legacy.m472'],
      pll: ['legacy.m473', 'legacy.m474'],
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
        key: label,
        descriptionKey: description,
        start: key === 'cross' ? 0 : start,
        end: moves.length,
      });
    }
  } else if (!isSolved(cube)) {
    if (!initialized) {
      onProgress({ key: 'legacy.m475' });
      Cube.initSolver();
      initialized = true;
    }
    onProgress({ key: 'solver.searching' });
    const c = Cube.fromString(toFaceletString(cube));
    moves.push(...parseAlgorithm(c.solve()));
  }
  let result = apply(initial, moves);
  if (!isSolved(result)) throw new Error('solver.failed');
  const alignment = uprightMoves(result);
  moves.push(...alignment);
  result = apply(result, alignment);
  colorMoves = moves.length;
  if (mode !== 'cfop' && colorMoves)
    stages.push({
      key: 'legacy.m479',
      descriptionKey: 'legacy.m480',
      start: 0,
      end: colorMoves,
    });
  if (pictures) {
    onProgress({ key: 'solver.centerPictures' });
    const centerMoves = correctCenters(result),
      start = moves.length;
    moves.push(...centerMoves);
    if (centerMoves.length)
      stages.push({
        key: 'legacy.m483',
        descriptionKey: 'legacy.m484',
        start,
        end: moves.length,
      });
    if (!isPictureSolved(apply(initial, moves)))
      throw new Error('solver.failed');
  }
  return {
    moves,
    stages,
    colorMoves,
    centerMoves: moves.length - colorMoves,
  };
}
