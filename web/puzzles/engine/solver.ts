import { solveMinxCenters } from '../megaminx/centers';
import {
apply,
colorSolved,
pictureSolved
} from './model';
import { shortSolution } from './short-search';
import { solveSmallOrMinx } from './solver-bridge';
import { solveReduction } from '../nxn/reduction-solver';
import { simplifyMoves } from './orbit-solver';
import { minxFrame } from '../megaminx/frame';
import type { Definition,Message,PuzzleState,Stage } from './types';

export async function solvePuzzle(
  def: Definition,
  state: PuzzleState,
  pictures: boolean,
  progress: (message: Message) => void = () => {},
) {
  if (pictures ? pictureSolved(def, state) : colorSolved(def, state))
    return { moves: [], stages: [] as Stage[] };
  const short = shortSolution(def, state);
  if (short) return { moves: short, stages: [] as Stage[] };
  let moves: string[];
  if (def.id === 'cube-4' || def.id === 'cube-5')
    return solveReduction(def, state, pictures, progress);
  progress({ key: 'solver.searching' });
  const frame = def.id === 'megaminx' ? minxFrame(def, state) : [];
  const normalized = apply(def, state, frame);
  moves = [...frame, ...(await solveSmallOrMinx(def, normalized))];
  if (def.id === 'megaminx' && pictures) {
    progress({ key: 'solver.centerPictures' });
    moves.push(...solveMinxCenters(def, apply(def, state, moves)));
  }
  moves = simplifyMoves(def, moves);
  const end = apply(def, state, moves);
  if (!(pictures ? pictureSolved(def, end) : colorSolved(def, end)))
    throw new Error('solver.failed');
  return { moves, stages: [] as Stage[] };
}
