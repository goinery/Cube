import assert from 'node:assert/strict';
import {
  definition,
  solved,
  apply,
  colorSolved,
  pictureSolved,
} from '../lib/puzzle/model';
import { solvePuzzle } from '../lib/puzzle/solver';
let seed = 0x6d2b79f5;
const sampleCount = Number(process.env.SOLVER_SAMPLES || 50);
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
for (const id of ['cube-2', 'cube-4', 'cube-5', 'megaminx'] as const) {
  const def = definition(id),
    records: { moves: number; ms: number; pictures: boolean }[] = [];
  const generators = def.primitiveMoves;
  for (let sample = 0; sample < sampleCount; sample++) {
    const scramble = Array.from(
      { length: id === 'cube-2' ? 30 : sample < 20 ? 80 : 200 },
      () =>
        generators[Math.floor(random() * generators.length)] +
        ['', "'", '2'][Math.floor(random() * 3)],
    );
    if (sample % 2 === 0)
      scramble.push(
        ...(id === 'megaminx' ? ['R++', 'D--', '@F'] : ['x', 'y2', "z'"]),
      );
    if (sample >= 20 && id !== 'megaminx') scramble.push('Rw', "Uw'", 'Fw2');
    const initial = apply(def, solved(def), scramble),
      pictures = sample % 2 === 0,
      start = performance.now();
    const result = await solvePuzzle(def, structuredClone(initial), pictures);
    const end = apply(def, initial, result.moves);
    assert.ok(
      pictures ? pictureSolved(def, end) : colorSolved(def, end),
      `${id} sample ${sample}`,
    );
    const limit =
      id === 'cube-2'
        ? 15
        : id === 'cube-4'
          ? pictures
            ? 220
            : 70
          : id === 'cube-5'
            ? pictures
              ? 600
              : 340
            : pictures
              ? 650
              : 230;
    assert.ok(
      result.moves.length < limit,
      `${id}: ${result.moves.length} moves exceeds ${limit}`,
    );
    records.push({
      moves: result.moves.length,
      ms: Math.round(performance.now() - start),
      pictures,
    });
  }
  for (const pictures of [false, true]) {
    const selected = records.filter((r) => r.pictures === pictures);
    console.log(
      JSON.stringify({
        id,
        pictures,
        cases: selected.length,
        minMoves: Math.min(...selected.map((r) => r.moves)),
        maxMoves: Math.max(...selected.map((r) => r.moves)),
        maxMs: Math.max(...selected.map((r) => r.ms)),
      }),
    );
  }
  const near = apply(def, solved(def), ['R', 'U']);
  assert.ok((await solvePuzzle(def, near, true)).moves.length <= 2);
  const regressions =
    id === 'megaminx'
      ? [
          Array.from({ length: 18 }, () => ['F', "U2'"]).flat(),
          ['R++', 'D--', 'R++', 'D--', '@F', '@U'],
        ]
      : id === 'cube-2'
        ? [['x', 'y', 'R', 'U', "F'", 'z']]
        : id === 'cube-4'
          ? [
              '2R2 U2 2R2 Uw2 2R2 Uw2'.split(' '),
              ['Rw', 'Fw', 'Uw', 'Lw', 'Bw', 'Dw'],
            ]
          : [
              "3R 3U2 3F' 3R2 3U".split(' '),
              "R U 3R U' R' U 3R' U'".split(' '),
              ['Rw', '3Uw', 'Fw2', '2L', "3B'", 'z'],
            ];
  for (const scramble of regressions)
    for (const pictures of [false, true]) {
      const initial = apply(def, solved(def), scramble);
      const result = await solvePuzzle(def, initial, pictures);
      const end = apply(def, initial, result.moves);
      assert.ok(
        pictures ? pictureSolved(def, end) : colorSolved(def, end),
        `${id} regression ${scramble.join(' ')}`,
      );
    }
}
process.exit(0);
