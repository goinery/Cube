import {
  solved,
  apply,
  facelets,
  FACES,
  FACE,
  equal,
  transform,
  identity,
  rotate,
  parseAlgorithm,
  inverse,
  simplify,
  type CubeState,
  type Basis,
} from './model';
const encode = (a: number[]) => a.reduce((n, v, i) => n + v * 4 ** i, 0);
const decode = (n: number) => FACES.map((_, i) => Math.floor(n / 4 ** i) % 4);
function orientations(cube: CubeState) {
  const fs = facelets(cube);
  return FACES.map((f) => (((fs[f][4].angle / 90) % 4) + 4) % 4);
}
interface Generator {
  moves: string[];
  delta: number[];
}
let generators: Generator[] | null = null,
  parents: Map<number, { previous: number; generator: number }> | null = null;
function initialize() {
  const rotations: Basis[] = [],
    queue = [identity()],
    seen = new Set<string>();
  while (queue.length) {
    const b = queue.shift()!,
      key = b.flat().join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    rotations.push(b);
    for (const axis of [0, 1, 2])
      queue.push(b.map((v) => rotate(v, axis, 1)) as Basis);
  }
  const base = [
    parseAlgorithm("R L U R' L' U2 R L U R' L' U2"),
    parseAlgorithm("R' L U D F U' D' R L' U2 F B U F' B' U2"),
  ];
  generators = [];
  const deltas = new Set<string>();
  for (const basis of rotations)
    for (const algorithm of base)
      for (const sequence of [algorithm, inverse(algorithm)]) {
        const moves = sequence.map((token) => {
          const f = FACES.find((f) =>
            equal(
              FACE[f].n,
              transform(FACE[token[0] as keyof typeof FACE].n, basis),
            ),
          )!;
          return f + token.slice(1);
        });
        const result = apply(solved(), moves),
          fs = facelets(result);
        if (
          !FACES.every((f) => fs[f].every((x, i) => x.sticker.id === f + i)) ||
          !result
            .filter((p) => p.kind !== 'center')
            .every((p) => p.basis.every((v, i) => equal(v, identity()[i])))
        )
          throw new Error('中心定向生成器校验失败。');
        const delta = orientations(result),
          key = delta.join('');
        if (deltas.has(key)) continue;
        deltas.add(key);
        generators.push({ moves, delta });
      }
  parents = new Map([[0, { previous: 0, generator: -1 }]]);
  const states = [0];
  for (let head = 0; head < states.length; head++) {
    const previous = states[head],
      o = decode(previous);
    generators.forEach((g, generator) => {
      const next = encode(o.map((v, i) => (v + g.delta[i]) % 4));
      if (!parents!.has(next)) {
        parents!.set(next, { previous, generator });
        states.push(next);
      }
    });
  }
  if (parents.size !== 2048) throw new Error('中心定向表不完整。');
}
export function correctCenters(cube: CubeState): string[] {
  if (!parents) initialize();
  const wanted = encode(orientations(cube).map((v) => (4 - v) % 4));
  if (!parents!.has(wanted)) throw new Error('中心朝向存在不可能的奇偶关系。');
  let key = wanted;
  const result: string[][] = [];
  while (key) {
    const step = parents!.get(key)!;
    result.unshift(generators![step.generator].moves);
    key = step.previous;
  }
  return simplify(result.flat());
}
