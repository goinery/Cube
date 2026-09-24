import { solveMinxCenters } from './minx-centers';
import {
  apply,
  colorSolved,
  inverseMove,
  moveSpec,
  pictureSolved,
  rotatePoint,
} from './model';
import { shortSolution } from './short-search';
import { solveSmallOrMinx } from './solver-bridge';
import { simplifyMoves, solveReduction } from './reduction-solver';
import type { Definition, Message, PuzzleState, Stage } from './types';

function minxFrame(def: Definition, state: PuzzleState) {
  const centers = def.pieces.flatMap((p, i) =>
    p.kind === 'center' ? [i] : [],
  );
  const frame = def.group.quaternions.findIndex((_, g) =>
    centers.every((i) => {
      const a = rotatePoint(def, state.rotations[i], def.pieces[i].anchor),
        b = rotatePoint(def, g, def.pieces[i].anchor);
      return a.every((v, j) => Math.abs(v - b[j]) < 1e-5);
    }),
  );
  if (frame < 0) throw new Error('solver.invalid');
  const goal = def.group.inverse[frame],
    paths = new Map<number, string[]>([[0, []]]),
    queue = [0];
  for (let i = 0; i < queue.length && !paths.has(goal); i++)
    for (const face of def.faces) {
      const token = '@' + face.id,
        g = def.group.multiply[moveSpec(def, token).rotation][queue[i]];
      if (!paths.has(g)) {
        paths.set(g, [...paths.get(queue[i])!, token]);
        queue.push(g);
      }
    }
  return paths.get(goal)!;
}
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
