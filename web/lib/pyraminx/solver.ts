import { tx } from '@/lib/i18n';
import {
  AXES,
  COMPOSE,
  INVERSE,
  ROTATIONS,
  affects,
  apply,
  isSolved,
  moveRotation,
  moveToken,
  parseMove,
  turn,
  type PuzzleState,
} from './model';
const MOVES = AXES.flatMap((a) => [a, a + "'"]);
const specs = MOVES.map(parseMove);
const encode = (r: number[]) => r.reduce((n, x) => n * 12 + x, 0);
interface Coordinate {
  index: Map<number, number>;
  transitions: Uint16Array;
}
function coordinate(pieces: number[]): Coordinate {
  const states = [pieces.map(() => 0)],
    index = new Map([[0, 0]]),
    transitions: number[] = [];
  for (let head = 0; head < states.length; head++) {
    for (const move of specs) {
      const rotation = moveRotation(move);
      const next = states[head].map((r, i) =>
        affects(pieces[i], r, move) ? COMPOSE[rotation][r] : r,
      );
      const key = encode(next);
      let n = index.get(key);
      if (n === undefined) {
        n = states.length;
        index.set(key, n);
        states.push(next);
      }
      transitions.push(n);
    }
  }
  return { index, transitions: Uint16Array.from(transitions) };
}
let tables:
  | {
      edges: Coordinate;
      centers: Coordinate;
      distance: Uint8Array;
      width: number;
    }
  | undefined;
export function prepareSolver(progress?: (status: string) => void) {
  if (tables) return tables;
  progress?.(tx('legacy.m500'));
  const edges = coordinate([8, 9, 10, 11, 12, 13]),
    centers = coordinate([4, 5, 6, 7]);
  const width = centers.index.size,
    count = edges.index.size * width;
  const distance = new Uint8Array(count).fill(255),
    queue = new Uint32Array(count);
  distance[0] = 0;
  let tail = 1;
  progress?.(tx('legacy.m501'));
  for (let head = 0; head < tail; head++) {
    const state = queue[head],
      e = Math.floor(state / width),
      c = state % width;
    for (let m = 0; m < 8; m++) {
      const next =
        edges.transitions[e * 8 + m] * width + centers.transitions[c * 8 + m];
      if (distance[next] !== 255) continue;
      distance[next] = distance[state] + 1;
      queue[tail++] = next;
    }
  }
  tables = { edges, centers, distance, width };
  return tables;
}
export function solvePuzzle(
  original: PuzzleState,
  progress?: (status: string) => void,
) {
  const { edges, centers, distance, width } = prepareSolver(progress);
  const inv = INVERSE[original.frame];
  let state: PuzzleState = {
    rotations: original.rotations.map((r) => COMPOSE[inv][r]),
    frame: 0,
  };
  const e = edges.index.get(encode(state.rotations.slice(8))),
    c = centers.index.get(encode(state.rotations.slice(4, 8)));
  if (e === undefined || c === undefined || distance[e * width + c] === 255)
    throw new Error(tx('legacy.m502'));
  let key = e * width + c;
  const moves: string[] = [];
  while (distance[key]) {
    const edge = Math.floor(key / width),
      center = key % width;
    const m = specs.findIndex(
      (_, i) =>
        distance[
          edges.transitions[edge * 8 + i] * width +
            centers.transitions[center * 8 + i]
        ] ===
        distance[key] - 1,
    );
    const token = MOVES[m];
    moves.push(token);
    state = turn(state, token);
    key =
      edges.transitions[edge * 8 + m] * width +
      centers.transitions[center * 8 + m];
  }
  const bodyLength = moves.length;
  for (let axis = 0; axis < 4; axis++) {
    if (!state.rotations[axis]) continue;
    const token = [moveToken(axis, 'tip'), moveToken(axis, 'tip', -1)].find(
      (m) => turn(state, m).rotations[axis] === 0,
    );
    if (!token) throw new Error(tx('legacy.m503'));
    moves.push(token);
    state = turn(state, token);
  }
  const result = moves.map((token) => {
    const m = parseMove(token);
    return moveToken(ROTATIONS[original.frame][m.axis], m.layer, m.direction);
  });
  const tipLength = result.length - bodyLength;
  // A base turn changes the puzzle frame. Matching all colours alone leaves
  // that frame rotated, which also leaves face photos in the wrong direction.
  // A matching body/base pair rotates the complete tetrahedron by 120 degrees.
  const frames = [{ frame: original.frame, moves: [] as string[] }];
  const seen = new Set([original.frame]);
  for (let i = 0; i < frames.length; i++) {
    const current = frames[i];
    if (current.frame === 0) {
      result.push(...current.moves);
      break;
    }
    for (const move of specs) {
      const frame = COMPOSE[moveRotation(move)][current.frame];
      if (seen.has(frame)) continue;
      seen.add(frame);
      frames.push({
        frame,
        moves: [
          ...current.moves,
          moveToken(move.axis, 'body', move.direction),
          moveToken(move.axis, 'base', move.direction),
        ],
      });
    }
  }
  const restored = apply(original, result);
  if (!isSolved(restored) || restored.frame !== 0)
    throw new Error(tx('legacy.m504'));
  return {
    moves: result,
    bodyLength,
    tipLength,
    orientationLength: result.length - bodyLength - tipLength,
  };
}
