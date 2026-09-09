import Cube from '../vendor/cubejs/index.cjs';
// The package's `module` field points to a legacy UMD build with a different
// export shape. Use its CommonJS entry consistently in Node and browser Workers.
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
    onProgress('正在识别 Cross / F2L / OLL / PLL…');
    const fs = facelets(cube);
    const input = (['F', 'R', 'U', 'D', 'L', 'B'] as Face[])
      .map((f) => fs[f].map((x) => x.sticker.face.toLowerCase()).join(''))
      .join('');
    const parts = cfop(input, { partitioned: true }) as Record<
      'cross' | 'f2l' | 'oll' | 'pll',
      string | string[]
    >;
    const descriptions: Record<string, [string, string]> = {
      cross: [
        '十字 · Cross',
        '把四个白色棱块归位，并与侧面中心对齐。完成后翻转整体，让白色十字位于底面。',
      ],
      f2l: [
        '前两层 · F2L',
        '将角块与相邻棱块配成一对，逐一插入四个槽位，同时保留已完成的十字。',
      ],
      oll: [
        '顶层定向 · OLL',
        '保留前两层，调整最后一层角块与棱块方向，让顶面颜色一致。',
      ],
      pll: [
        '顶层排列 · PLL',
        '在方向正确的基础上交换顶层块的位置，完成六面还原。',
      ],
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
      onProgress('首次求解：正在准备两阶段搜索表…');
      Cube.initSolver();
      initialized = true;
    }
    onProgress('正在从当前状态搜索还原路径…');
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
        onProgress(`近优搜索 ${i + 1} / 12 · 当前 ${bestCost} 步`);
      }
    }
    moves.push(...best);
  }
  let result = apply(initial, moves);
  if (!isSolved(result))
    throw new Error('求解结果未通过物理状态验证，未应用任何操作。');
  const alignment = uprightMoves(result);
  moves.push(...alignment);
  result = apply(result, alignment);
  colorMoves = moves.length;
  if (mode !== 'cfop' && colorMoves)
    stages.push({
      name: '颜色',
      label: '六面颜色还原',
      description:
        '从当前真实状态搜索还原路径。每一步都执行合法转层，并同步所有辅助视图。',
      start: 0,
      end: colorMoves,
    });
  if (pictures) {
    onProgress('正在校正照片中心片方向…');
    const centerMoves = correctCenters(result),
      start = moves.length;
    moves.push(...centerMoves);
    if (centerMoves.length)
      stages.push({
        name: '图片',
        label: '照片中心定向',
        description:
          '普通颜色还原不约束中心片方向。通过合法转层校正中心片，让每一面照片准确拼合。',
        start,
        end: moves.length,
      });
    if (!isPictureSolved(apply(initial, moves)))
      throw new Error('照片方向校验未通过，未应用任何操作。');
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
