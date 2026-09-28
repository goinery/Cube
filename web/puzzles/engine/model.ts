import { Quaternion } from 'three';
import { cubeDefinition } from '../nxn/definition';
import { megaminxDefinition } from '../megaminx/definition';
import { vec, rotatePoint } from './math';
import type { Definition, Move, PuzzleId, PuzzleState, V3 } from './types';
export { rotatePoint } from './math';

const definitions = new Map<PuzzleId, Definition>();
export function definition(id: PuzzleId): Definition {
  if (!definitions.has(id))
    definitions.set(
      id,
      id === 'megaminx'
        ? megaminxDefinition()
        : cubeDefinition(Number(id.slice(-1))),
    );
  return definitions.get(id)!;
}
export const solved = (def: Definition): PuzzleState => ({
  rotations: def.pieces.map(() => 0),
});
const moveCache = new WeakMap<Definition, Map<string, Move>>();
export function moveSpec(def: Definition, token: string): Move {
  let cache = moveCache.get(def);
  if (!cache) {
    cache = new Map();
    moveCache.set(def, cache);
  }
  if (cache.has(token)) return cache.get(token)!;
  let axis: V3,
    angle: number,
    key: string,
    whole = false,
    affects: Move['affects'];
  if (def.id === 'megaminx') {
    const match = /^(@?)(U|R|F|L|BR|BL|FR|FL|DR|DL|B|D)(w)?(2'?|')?$/.exec(
      token,
    );
    const wca = /^([RD])(\+\+|--)$/.exec(token);
    if (!match && !wca) throw new Error('algorithm.invalid');
    const name = match?.[2] || wca![1],
      face = def.faces.find((f) => f.id === name)!;
    const wide = Boolean(match?.[3] || wca);
    whole = Boolean(match?.[1]);
    if (whole && wide) throw new Error('algorithm.invalid');
    const power = match ? (match[4]?.startsWith('2') ? 2 : 1) : 2,
      sign = token.endsWith("'") || token.endsWith('--') ? -1 : 1;
    axis = face.normal;
    key = whole ? `@${name}` : wide ? `${name}w` : name;
    angle = -def.step * power * sign;
    const opposite = vec(axis).negate();
    affects = (piece, orientation) => {
      if (whole) return true;
      const p = def.pieces[piece];
      const onFace = p.tiles.some((id) => {
        const tile = def.tiles.find((t) => t.id === id)!;
        const n = def.faces.find((f) => f.id === tile.face)!.normal;
        return (
          vec(rotatePoint(def, orientation, n)).dot(
            wide ? opposite : vec(axis),
          ) > 0.99999
        );
      });
      return wide ? !onFace : onFace;
    };
  } else {
    const match = /^(?:(\d+))?([URFDLBxyzMESurfdlb])(w)?(2'?|')?$/.exec(token);
    if (!match) throw new Error('algorithm.invalid');
    const [, prefix, letter, w, suffix] = match,
      upper = letter.toUpperCase();
    const rotation = 'xyz'.includes(letter),
      middle = 'MES'.includes(letter);
    if (middle && def.order % 2 === 0) throw new Error('algorithm.noMiddle');
    const face = def.faces.find(
      (f) =>
        f.id ===
        ({ X: 'R', Y: 'U', Z: 'F', M: 'L', E: 'D', S: 'F' }[upper] || upper),
    )!;
    if (!face) throw new Error('algorithm.invalid');
    axis = face.normal;
    whole = rotation;
    const wide = Boolean(w) || 'urfdlb'.includes(letter),
      count = rotation ? def.order : wide ? Number(prefix || 2) : 1,
      depth = middle ? (def.order + 1) / 2 : Number(prefix || 1);
    whole = rotation || (wide && count === def.order);
    if (
      count > def.order ||
      depth > def.order ||
      depth < 1 ||
      (prefix && (middle || rotation)) ||
      (w && (middle || rotation))
    )
      throw new Error('algorithm.layerRange');
    const levels = rotation
      ? Array.from({ length: def.order }, (_, i) => i)
      : wide
        ? Array.from({ length: count }, (_, i) => i)
        : [depth - 1];
    angle =
      -def.step *
      (suffix?.startsWith('2') ? 2 : 1) *
      (suffix?.endsWith("'") ? -1 : 1);
    key = rotation
      ? letter
      : middle
        ? letter
        : wide
          ? `${count === 2 ? '' : count}${upper}w`
          : `${depth === 1 ? '' : depth}${upper}`;
    affects = (piece, orientation) =>
      levels.some(
        (layer) =>
          Math.abs(
            vec(rotatePoint(def, orientation, def.pieces[piece].anchor)).dot(
              vec(axis),
            ) -
              (def.order - 1 - layer * 2),
          ) < 1e-5,
      );
  }
  const q = new Quaternion().setFromAxisAngle(vec(axis), angle);
  const rotation = def.group.quaternions.findIndex(
    (p) => Math.abs(q.dot(p)) > 1 - 1e-7,
  );
  if (rotation < 0) throw new Error('algorithm.invalid');
  const result = { token, key, axis, angle, rotation, whole, affects };
  cache.set(token, result);
  return result;
}
export function parseAlgorithm(def: Definition, input: string): string[] {
  const tokens = input
    .replace(/[’′]/g, "'")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length > 20000) throw new Error('algorithm.tooLong');
  tokens.forEach((token) => moveSpec(def, token));
  return tokens;
}
export function turn(
  def: Definition,
  state: PuzzleState,
  token: string,
): PuzzleState {
  const move = moveSpec(def, token);
  return {
    rotations: state.rotations.map((r, i) =>
      move.affects(i, r) ? def.group.multiply[move.rotation][r] : r,
    ),
  };
}
export const apply = (def: Definition, state: PuzzleState, tokens: string[]) =>
  tokens.reduce((s, t) => turn(def, s, t), state);
export function inverseMove(def: Definition, token: string): string {
  if (token.endsWith('++')) return token.replace('++', '--');
  if (token.endsWith('--')) return token.replace('--', '++');
  if (def.id !== 'megaminx' && token.endsWith('2')) return token;
  return token.endsWith("'") ? token.slice(0, -1) : token + "'";
}
export const inverse = (def: Definition, moves: string[]) =>
  [...moves].reverse().map((t) => inverseMove(def, t));
export function pictureSolved(def: Definition, state: PuzzleState): boolean {
  return state.rotations.every((r) => r === 0);
}
export function colorSolved(def: Definition, state: PuzzleState): boolean {
  return def.faces.every((face) => {
    let color: string | undefined;
    return def.tiles.every((tile) => {
      const n = def.faces.find((f) => f.id === tile.face)!.normal;
      if (
        vec(rotatePoint(def, state.rotations[tile.piece], n)).dot(
          vec(face.normal),
        ) < 0.99999
      )
        return true;
      if (!color) color = tile.face;
      return color === tile.face;
    });
  });
}
export function scramble(
  def: Definition,
  length = def.id === 'megaminx' ? 70 : def.order * 12,
): string[] {
  const result: string[] = [];
  let previous = '';
  for (let i = 0; i < length; i++) {
    let key: string;
    do {
      key =
        def.primitiveMoves[
          Math.floor(Math.random() * def.primitiveMoves.length)
        ];
    } while (key === previous);
    previous = key;
    result.push(key + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return result;
}
