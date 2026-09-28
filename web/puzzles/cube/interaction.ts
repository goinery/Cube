import { moveSpec,rotate,type Vec } from './model';
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
export function withinTurnTolerance(
  partial: PartialTurns | null,
  degrees: number,
) {
  if (!partial || !partial.angles.some(Boolean)) return true;
  if (!Number.isFinite(degrees) || degrees <= 0) return false;
  const radians = (Math.min(degrees, 45) * Math.PI) / 180;
  return partial.angles.every((angle) => Math.abs(angle) <= radians + 1e-10);
}
export function canTurn(
  partial: PartialTurns | null,
  token: string,
  tolerance = 0,
): boolean {
  const move = moveSpec(token);
  return (
    !partial ||
    !partial.angles.some(Boolean) ||
    partial.axis === move.axis ||
    move.layers.length === 3 ||
    withinTurnTolerance(partial, tolerance)
  );
}
/** The logical cube already records the nearest quarter-turn in finishLayerTurn. */
export function alignedPartialForTurn(
  partial: PartialTurns | null,
  token: string,
  tolerance: number,
) {
  return !canTurn(partial, token) && withinTurnTolerance(partial, tolerance)
    ? null
    : partial;
}
export function partialAfterAllowedMove(
  partial: PartialTurns | null,
  token: string,
  tolerance: number,
) {
  return partialAfterMove(
    alignedPartialForTurn(partial, token, tolerance),
    token,
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
export function canTurnSequence(
  partial: PartialTurns | null,
  moves: string[],
  tolerance = 0,
) {
  for (const token of moves) {
    if (!canTurn(partial, token, tolerance)) return false;
    partial = partialAfterAllowedMove(partial, token, tolerance);
  }
  return true;
}
export const heldAngle = (
  partial: PartialTurns | null,
  axis: number,
  layer: number,
) => (partial?.axis === axis ? partial.angles[layer + 1] : 0);

export function moveForAngle(face: string, target: number): string | null {
  const spec = moveSpec(face),
    q = (((Math.round(target / QUARTER) * Math.sign(spec.turns)) % 4) + 4) % 4;
  return q === 0 ? null : face + (q === 1 ? '' : q === 2 ? '2' : "'");
}
