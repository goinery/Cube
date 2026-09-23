import { Vector3 } from 'three';
import { facePoint } from './geometry';
import type { Definition, V2 } from './types';
export interface NetFace {
  face: string;
  x: number;
  y: number;
  angle: number;
  points: V2[];
}
const distance = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function interior(poly: V2[], point: V2) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i],
      b = poly[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
function overlaps(a: V2[], b: V2[]) {
  const ac = a.reduce(
      (s, p) => [s[0] + p[0] / a.length, s[1] + p[1] / a.length] as V2,
      [0, 0] as V2,
    ),
    bc = b.reduce(
      (s, p) => [s[0] + p[0] / b.length, s[1] + p[1] / b.length] as V2,
      [0, 0] as V2,
    );
  return (
    a.some((p) =>
      interior(b, [p[0] * 0.999 + ac[0] * 0.001, p[1] * 0.999 + ac[1] * 0.001]),
    ) ||
    b.some((p) =>
      interior(a, [p[0] * 0.999 + bc[0] * 0.001, p[1] * 0.999 + bc[1] * 0.001]),
    )
  );
}
const cache = new WeakMap<Definition, NetFace[]>();
export function unfoldedNet(def: Definition): NetFace[] {
  if (cache.has(def)) return cache.get(def)!;
  if (def.id !== 'megaminx') {
    const places: Record<string, V2> = {
      U: [1, 0],
      L: [0, 1],
      F: [1, 1],
      R: [2, 1],
      B: [3, 1],
      D: [1, 2],
    };
    const result = def.faces.map((f) => ({
      face: f.id,
      x: places[f.id][0] * 3,
      y: -places[f.id][1] * 3,
      angle: 0,
      points: f.outline.map(
        (p) => [p[0] + places[f.id][0] * 3, p[1] - places[f.id][1] * 3] as V2,
      ),
    }));
    cache.set(def, result);
    return result;
  }
  const world = def.faces.map((f) => f.outline.map((p) => facePoint(f, p)));
  const adjacency = def.faces.map((_, a) =>
    def.faces.flatMap((__, b) => {
      if (a === b) return [];
      const pairs = world[a].flatMap((p, i) =>
        world[b].flatMap((q, j) => (p.distanceTo(q) < 1e-5 ? [[i, j]] : [])),
      );
      return pairs.length === 2 ? [{ other: b, pairs }] : [];
    }),
  );
  const placed = new Map<number, NetFace>([
    [
      0,
      {
        face: def.faces[0].id,
        x: 0,
        y: 0,
        angle: 0,
        points: def.faces[0].outline,
      },
    ],
  ]);
  let attempts = 0;
  function expand(): boolean {
    if (placed.size === def.faces.length) return true;
    if (++attempts > 100000) return false;
    const candidates = [...placed.keys()].reverse();
    for (const a of candidates)
      for (const { other: b, pairs } of adjacency[a]) {
        if (placed.has(b)) continue;
        const parent = placed.get(a)!,
          p0 = parent.points[pairs[0][0]],
          p1 = parent.points[pairs[1][0]],
          q0 = def.faces[b].outline[pairs[0][1]],
          q1 = def.faces[b].outline[pairs[1][1]];
        const angle =
            Math.atan2(p1[1] - p0[1], p1[0] - p0[0]) -
            Math.atan2(q1[1] - q0[1], q1[0] - q0[0]),
          c = Math.cos(angle),
          s = Math.sin(angle),
          x = p0[0] - q0[0] * c + q0[1] * s,
          y = p0[1] - q0[0] * s - q0[1] * c;
        const item = {
          face: def.faces[b].id,
          x,
          y,
          angle,
          points: def.faces[b].outline.map(
            ([px, py]) => [x + px * c - py * s, y + px * s + py * c] as V2,
          ),
        };
        if ([...placed.values()].some((f) => overlaps(f.points, item.points)))
          continue;
        placed.set(b, item);
        if (expand()) return true;
        placed.delete(b);
      }
    return false;
  }
  if (!expand()) throw new Error('Invalid dodecahedron net');
  const result = [...placed.values()];
  cache.set(def, result);
  return result;
}
