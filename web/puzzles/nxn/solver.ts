import { solveState } from '../cube/solver-core';
import { apply, colorSolved, definition, pictureSolved } from '../engine/model';
import { simplifyMoves } from '../engine/orbit-solver';
import { shortSolution } from '../engine/short-search';
import { solveSmallOrMinx } from '../engine/solver-bridge';
import type { NxnSolveRequest, SolveOutput } from '../engine/solver-types';
import type { Message } from '../engine/types';
import { solveReduction } from './reduction-solver';

/** One entry point for every supported cube order; only 3×3 offers CFOP. */
export async function solveNxn(
  request: NxnSolveRequest,
  progress: (message: Message) => void = () => {},
): Promise<SolveOutput> {
  if (request.id === 'cube')
    return solveState(request.state, request.mode, request.pictures, progress);
  if (request.mode !== 'standard') throw new Error('solver.unsupportedMode');
  const { state, pictures } = request;
  const def = definition(request.id);
  const isSolved = pictures ? pictureSolved : colorSolved;
  if (isSolved(def, state)) return { moves: [], stages: [] };
  progress({ key: 'solver.searching' });
  const short = shortSolution(def, state);
  const result = short
    ? { moves: short, stages: [] }
    : def.order === 2
      ? { moves: await solveSmallOrMinx(def, state), stages: [] }
      : await solveReduction(def, state, pictures, progress);
  const moves = simplifyMoves(def, result.moves);
  if (!isSolved(def, apply(def, state, moves))) throw new Error('solver.failed');
  return { ...result, moves };
}
