import { solveMinxCenters } from '../megaminx/centers';
import {
apply,
definition,
colorSolved,
pictureSolved
} from './model';
import { shortSolution } from './short-search';
import { solveSmallOrMinx } from './solver-bridge';
import { solveNxn } from '../nxn/solver';
import { simplifyMoves } from './orbit-solver';
import { minxFrame } from '../megaminx/frame';
import type { Definition,Message,PuzzleState,Stage } from './types';
import type { SolveRequest, Solution } from './solver-types';

export async function solvePuzzle(
  def: Definition,
  state: PuzzleState,
  pictures: boolean,
  progress: (message: Message) => void = () => {},
) {
  if (def.id !== 'megaminx')
    return solveNxn({ id: def.id, state, pictures, mode: 'standard' }, progress);
  if (pictures ? pictureSolved(def, state) : colorSolved(def, state))
    return { moves: [], stages: [] as Stage[] };
  const short = shortSolution(def, state);
  if (short) return { moves: short, stages: [] as Stage[] };
  let moves: string[];
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

export async function solveRequest(
  request: SolveRequest,
  progress: (message: Message) => void = () => {},
): Promise<Solution> {
  const started = performance.now();
  const result = request.id === 'megaminx'
    ? await solvePuzzle(definition(request.id), request.state, request.pictures, progress)
    : await solveNxn(request, progress);
  return {
    ...result,
    count: result.moves.length,
    seconds: Math.round((performance.now() - started) / 10) / 100,
    mode: request.mode,
  };
}
