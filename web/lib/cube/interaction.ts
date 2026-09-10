import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { moveSpec, rotate, type Vec } from './model';
export const QUARTER = Math.PI / 2;
export interface PartialTurns {
  axis: number;
  angles: [number, number, number];
}
export function layerFace(axis: number, layer: number): string {
  return [
    ['L', 'M', 'R'],
    ['D', 'E', 'U'],
    ['B', 'S', 'F'],
  ][axis][layer + 1];
}
export function canTurn(partial: PartialTurns | null, token: string): boolean {
  const move = moveSpec(token);
  return (
    !partial ||
    !partial.angles.some(Boolean) ||
    partial.axis === move.axis ||
    move.layers.length === 3
  );
}
export function partialAfterMove(
  partial: PartialTurns | null,
  token: string,
): PartialTurns | null {
  if (!partial) return null;
  const move = moveSpec(token);
  if (move.layers.length !== 3 || move.axis === partial.axis) return partial;
  const direction: Vec = [0, 0, 0];
  direction[partial.axis] = 1;
  const rotated = rotate(direction, move.axis, move.turns);
  const axis = rotated.findIndex(Boolean),
    sign = rotated[axis];
  return {
    axis,
    angles:
      sign > 0
        ? [...partial.angles]
        : [-partial.angles[2], -partial.angles[1], -partial.angles[0]],
  };
}
export function canTurnSequence(partial: PartialTurns | null, moves: string[]) {
  for (const token of moves) {
    if (!canTurn(partial, token)) return false;
    partial = partialAfterMove(partial, token);
  }
  return true;
}
export const heldAngle = (
  partial: PartialTurns | null,
  axis: number,
  layer: number,
) => (partial?.axis === axis ? partial.angles[layer + 1] : 0);

export function stepMagnet(
  angle: number,
  velocity: number,
  target: number,
  dt: number,
  strength: number,
  damping: number,
) {
  if (strength <= 0) return { angle, velocity: 0 };
  const stiffness = 360 * strength,
    friction = 2 * Math.sqrt(stiffness) * damping;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240))),
    h = dt / steps;
  for (let i = 0; i < steps; i++) {
    velocity += ((target - angle) * stiffness - friction * velocity) * h;
    angle += velocity * h;
  }
  return { angle, velocity };
}
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
