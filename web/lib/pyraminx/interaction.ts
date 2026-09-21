import { ROTATIONS, moveRotation, type Move } from './model';

export interface PartialTurn {
  axis: number;
  layer: Move['layer'];
  angle: number;
}

export const sameLayer = (a: Pick<Move, 'axis' | 'layer'>, b: Pick<Move, 'axis' | 'layer'>) =>
  a.axis === b.axis && a.layer === b.layer;

// Tips have their own bearings. Coaxial layers commute; only cuts about
// different body/base axes can split one another's moving pieces.
export const turnsConflict = (a: PartialTurn, b: Pick<Move, 'axis' | 'layer'>) =>
  a.axis !== b.axis && a.layer !== 'tip' && b.layer !== 'tip';

export function partialsAfterMove(partials: PartialTurn[], move: Move) {
  if (move.layer !== 'base') return partials;
  const rotation = ROTATIONS[moveRotation(move)];
  return partials.map((p) => p.layer === 'tip' && p.axis !== move.axis
    ? { ...p, axis: rotation[p.axis] }
    : p);
}

export const heldAngle = (partials: PartialTurn[], move: Pick<Move, 'axis' | 'layer'>) =>
  partials.find((p) => sameLayer(p, move))?.angle ?? 0;

// Apply independent tip rotations before the larger layer that carries them.
export function visibleTurns(partials: PartialTurn[], active?: PartialTurn | null) {
  return [...partials.filter((p) => !active || !sameLayer(p, active)), ...(active ? [active] : [])]
    .sort((a, b) => Number(a.layer !== 'tip') - Number(b.layer !== 'tip'));
}
