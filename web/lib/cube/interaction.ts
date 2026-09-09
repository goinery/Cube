import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { moveSpec } from './model';
export const QUARTER = Math.PI / 2;
/** The preview is continuous. Only this release decision becomes a legal move. */
export function magneticTarget(angle: number, velocity = 0): number {
  const progress = angle / QUARTER;
  let quarter = Math.round(progress);
  if (Math.abs(velocity) > 0.0025 && Math.abs(angle) > 0.16) {
    const projected =
      (angle + Math.max(-0.42, Math.min(0.42, velocity * 75))) / QUARTER;
    quarter = Math.round(projected);
  }
  return quarter * QUARTER;
}
export function moveForAngle(face: string, target: number): string | null {
  const spec = moveSpec(face),
    q = (((Math.round(target / QUARTER) * Math.sign(spec.turns)) % 4) + 4) % 4;
  return q === 0 ? null : face + (q === 1 ? '' : q === 2 ? '2' : "'");
}
export function magneticEase(t: number): number {
  return t >= 1
    ? 1
    : 1 - Math.exp(-9 * t) * (Math.cos(12 * t) + 0.75 * Math.sin(12 * t));
}
/** Fits the actual projected bounds, so 0.75 means 75% of the limiting viewport dimension. */
export function fitDistance(
  camera: PerspectiveCamera,
  box: Box3,
  direction: Vector3,
  target: Vector3,
  occupancy = 0.75,
): number {
  const c = camera.clone(),
    corners: Vector3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z])
        corners.push(new Vector3(x, y, z));
  const d = direction.clone().normalize();
  let low = 0.015,
    high = 150;
  for (let i = 0; i < 34; i++) {
    const distance = (low + high) / 2;
    c.position.copy(target).addScaledVector(d, distance);
    c.lookAt(target);
    c.updateMatrixWorld(true);
    let fill = 0;
    for (const corner of corners) {
      const view = corner.clone().applyMatrix4(c.matrixWorldInverse);
      if (view.z >= -0.01) {
        fill = Infinity;
        break;
      }
      const p = corner.clone().project(c);
      fill = Math.max(fill, Math.abs(p.x), Math.abs(p.y));
    }
    if (fill > occupancy) low = distance;
    else high = distance;
  }
  return high;
}
