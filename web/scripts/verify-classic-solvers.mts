import assert from 'node:assert/strict';
import * as cube from '../lib/cube/model';
import * as pyraminx from '../lib/pyraminx/model';
import { solveState } from '../lib/cube/solver-core';
import { solvePuzzle } from '../lib/pyraminx/solver';
let seed = 1729;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
for (const kind of ['cube-3', 'pyraminx']) {
  const lengths: number[] = [];
  for (let n = 0; n < 30; n++) {
    if (kind === 'cube-3') {
      const tokens = [
        'R',
        'U',
        'F',
        'L',
        'D',
        'B',
        'M',
        'E',
        'S',
        'x',
        'y',
        'z',
      ];
      const scramble = Array.from(
        { length: 80 },
        () =>
          tokens[Math.floor(random() * tokens.length)] +
          ['', "'", '2'][Math.floor(random() * 3)],
      );
      const state = cube.apply(cube.solved(), scramble),
        result = solveState(state, 'fast', n % 2 === 0);
      const end = cube.apply(state, result.moves);
      assert.ok(n % 2 === 0 ? cube.isPictureSolved(end) : cube.isSolved(end));
      lengths.push(result.moves.length);
    } else {
      const tokens = [
        'U',
        'L',
        'R',
        'B',
        'u',
        'l',
        'r',
        'b',
        'Uw',
        'Lw',
        'Rw',
        'Bw',
      ];
      const scramble = Array.from(
        { length: 80 },
        () =>
          tokens[Math.floor(random() * tokens.length)] +
          (random() < 0.5 ? "'" : ''),
      );
      const state = pyraminx.apply(pyraminx.solved(), scramble),
        result = solvePuzzle(state),
        end = pyraminx.apply(state, result.moves);
      assert.ok(pyraminx.isSolved(end));
      assert.equal(end.frame, 0);
      lengths.push(result.moves.length);
    }
  }
  console.log(
    JSON.stringify({
      id: kind,
      cases: lengths.length,
      minMoves: Math.min(...lengths),
      maxMoves: Math.max(...lengths),
    }),
  );
}
