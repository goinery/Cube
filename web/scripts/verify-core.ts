import assert from 'node:assert/strict';
import Cube from '../lib/vendor/cubejs/index.cjs';
import {
  solved,
  apply,
  turn,
  facelets,
  FACES,
  inverse,
  isPictureSolved,
  toFaceletString,
  scramble,
  parseAlgorithm,
  isSolved,
} from '../lib/cube/model';
import { solveState } from '../lib/cube/solver-core';
import { correctCenters } from '../lib/cube/centers';
const initial = solved();
for (const f of FACES)
  for (const suffix of ['', "'", '2']) {
    const token = f + suffix;
    const c = new Cube();
    c.move(token);
    assert.equal(toFaceletString(turn(initial, token)), c.asString(), token);
  }
console.log('PASS all 18 face turns match independent cube.js model');
for (let n = 0; n < 20; n++) {
  const moves = scramble(100),
    state = apply(initial, moves),
    c = new Cube();
  c.move(moves.join(' '));
  assert.equal(toFaceletString(state), c.asString());
  assert.ok(isPictureSolved(apply(state, inverse(moves))));
  const ids = FACES.flatMap((f) => facelets(state)[f].map((x) => x.sticker.id));
  assert.equal(new Set(ids).size, 54);
}
console.log(
  'PASS 2,000 random turns: identity, all sticker ownership, inverse orientations',
);
for (const m of ['M', 'E', 'S', 'x', 'y', 'z', 'r', 'u', 'f', 'l', 'd', 'b'])
  assert.ok(isPictureSolved(apply(initial, [m, m, m, m])), m);
const sample = apply(initial, parseAlgorithm("R U R' B' R2 F2 L D2"));
for (const mode of ['fast', 'near', 'cfop'] as const) {
  const result = solveState(sample, mode, true, (message) =>
    console.log(mode, message),
  );
  assert.ok(isPictureSolved(apply(sample, result.moves)), mode);
  console.log(
    'PASS',
    mode,
    result.moves.length,
    'moves',
    result.colorMoves,
    'color',
    result.centerMoves,
    'picture',
  );
  if (mode === 'cfop') {
    for (const stage of result.stages) {
      const state = apply(sample, result.moves.slice(0, stage.end)),
        fs = facelets(state);
      if (stage.name === 'Cross') {
        assert.ok(
          [1, 3, 5, 7].every(
            (i) => fs.D[i].sticker.face === fs.D[4].sticker.face,
          ),
        );
      }
      if (stage.name === 'F2L') {
        assert.ok(
          ['F', 'R', 'B', 'L'].every((f) =>
            [3, 4, 5, 6, 7, 8].every(
              (i) =>
                fs[f as 'F'][i].sticker.face === fs[f as 'F'][4].sticker.face,
            ),
          ),
        );
      }
      if (stage.name === 'OLL') {
        assert.ok(fs.U.every((x) => x.sticker.face === fs.U[4].sticker.face));
      }
      console.log('  verified stage', stage.name);
    }
  }
}
for (let n = 0; n < 8; n++) {
  const state = apply(initial, scramble()),
    r = solveState(state, 'cfop', true);
  assert.ok(isPictureSolved(apply(state, r.moves)));
  console.log('PASS randomized CFOP picture cube', n + 1);
}
console.log('All core verification passed.');
