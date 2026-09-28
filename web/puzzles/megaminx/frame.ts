import { moveSpec, rotatePoint } from '../engine/model';
import type { Definition, PuzzleState } from '../engine/types';

export function minxFrame(def: Definition, state: PuzzleState) {
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
