import { solved as cubeSolved, type Basis, type Vec } from '../cube/model';
import { solveState } from '../cube/solver-core';
import { apply, rotatePoint, pictureSolved, colorSolved } from './model';
import { solveFourColor } from './four-phase';
import { solveFiveSkeleton } from './five-reduction';
import { solveOrbit, simplifyMoves } from './orbit-solver';
import type { Definition, Message, PuzzleState, Stage } from './types';
export { simplifyMoves } from './orbit-solver';
const near = (a: number[], b: number[]) =>
  a.every((v, i) => Math.abs(v - b[i]) < 1e-5);
function reducedThree(def: Definition, state: PuzzleState) {
  return cubeSolved().map((piece) => {
    const index = def.pieces.findIndex((p) =>
      near(
        p.anchor,
        piece.home.map((x) => x * (def.order - 1)),
      ),
    );
    if (index < 0) throw new Error('solver.invalid');
    const rotation = state.rotations[index];
    return {
      ...piece,
      pos: rotatePoint(def, rotation, piece.home).map(Math.round) as Vec,
      basis: (
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ] as Vec[]
      ).map((v) => rotatePoint(def, rotation, v).map(Math.round)) as Basis,
    };
  });
}

export async function solveReduction(
  def: Definition,
  initial: PuzzleState,
  pictures: boolean,
  progress: (message: Message) => void,
) {
  let state = initial;
  const moves: string[] = [];
  const add = (sequence: string[]) => {
    moves.push(...sequence);
    state = apply(def, state, sequence);
  };
  progress({ key: 'solver.reducing' });
  if (def.order === 4) add(solveFourColor(def, state));
  else add(solveFiveSkeleton(def, state));
  if (pictures && def.order === 5)
    add(solveState(reducedThree(def, state), 'fast', true).moves);
  const kinds =
    def.order === 4
      ? pictures
        ? ['wing', 'center']
        : []
      : pictures
        ? ['wing', 'x-center', 't-center']
        : ['t-center'];
  for (const kind of kinds) {
    progress({ key: 'solver.orbit', params: { kindKey: `puzzle.${kind}` } });
    add(solveOrbit(def, state, kind, pictures));
  }
  if (!(pictures ? pictureSolved(def, state) : colorSolved(def, state)))
    throw new Error('solver.failed');
  return { moves: simplifyMoves(def, moves), stages: [] as Stage[] };
}
