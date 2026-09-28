import { Quaternion, Vector3 } from 'three';
import type { Definition, RotationGroup, V2, V3 } from './types';

export const vec = (p: V3) => new Vector3(...p);
export const tuple = (p: Vector3) => p.toArray() as V3;
export const close = (a: V3, b: V3) => a.every((x, i) => Math.abs(x - b[i]) < 1e-5);
export function rotatePoint(def: Definition, rotation: number, point: V3): V3 {
  return tuple(vec(point).applyQuaternion(def.group.quaternions[rotation]));
}
export function rotationGroup(axes: V3[], angle: number): RotationGroup {
  const generators = axes.map((axis) =>
    new Quaternion().setFromAxisAngle(vec(axis), angle),
  );
  const quaternions = [new Quaternion()];
  const find = (q: Quaternion) =>
    quaternions.findIndex((p) => Math.abs(p.dot(q)) > 1 - 1e-8);
  for (let i = 0; i < quaternions.length; i++) {
    for (const generator of generators) {
      const q = generator.clone().multiply(quaternions[i]).normalize();
      if (find(q) < 0) quaternions.push(q);
    }
    if (quaternions.length > 60) throw new Error('Invalid rotation group');
  }
  return {
    quaternions,
    multiply: quaternions.map((a) =>
      quaternions.map((b) => find(a.clone().multiply(b))),
    ),
    inverse: quaternions.map((q) => find(q.clone().invert())),
  };
}
export function roundedPolygon(
  points: V2[],
  fractions: number | number[],
  samples = 9,
): V2[] {
  const result: V2[] = [];
  points.forEach((p, i) => {
    const before = points[(i + points.length - 1) % points.length],
      after = points[(i + 1) % points.length];
    const f = typeof fractions === 'number' ? fractions : fractions[i];
    const start = p.map((v, j) => v + (before[j] - v) * f) as V2;
    const end = p.map((v, j) => v + (after[j] - v) * f) as V2;
    for (let k = 0; k <= samples; k++) {
      const t = k / samples,
        u = 1 - t;
      result.push([
        u * u * start[0] + 2 * u * t * p[0] + t * t * end[0],
        u * u * start[1] + 2 * u * t * p[1] + t * t * end[1],
      ]);
    }
  });
  return result;
}
