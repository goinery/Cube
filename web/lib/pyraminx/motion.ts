import { MathUtils, Object3D, Quaternion } from 'three';
import { affects, type PuzzleState } from './model';
import { quaternions, vertices } from './geometry';
import type { PartialTurn } from './store';

export interface AlignmentPose {
  rotations: Quaternion[];
  progress: number;
}
const identity = new Quaternion();

// Store offsets in each piece's local frame, as in the three-layer cube.
// They then remain continuous even if the new layer commits during alignment.
export function captureAlignment(
  puzzle: PuzzleState,
  partial: PartialTurn,
  previous?: AlignmentPose | null,
): AlignmentPose {
  const worldRotation = new Quaternion().setFromAxisAngle(
    vertices[partial.axis].clone().normalize(),
    partial.angle,
  );
  return {
    progress: 0,
    rotations: [...puzzle.rotations, puzzle.frame].map((orientation, piece) => {
      const basis = quaternions[orientation];
      const affected =
        piece === puzzle.rotations.length
          ? partial.layer === 'base'
          : affects(piece, orientation, partial);
      const local = affected
        ? basis.clone().invert().multiply(worldRotation).multiply(basis)
        : new Quaternion();
      if (previous)
        local.multiply(
          previous.rotations[piece].clone().slerp(identity, previous.progress),
        );
      return local;
    }),
  };
}

const local = new Quaternion(),
  inverse = new Quaternion(),
  world = new Quaternion();
export function applyAlignment(
  root: Object3D,
  rotation: Quaternion,
  progress: number,
) {
  local.copy(rotation).slerp(identity, progress);
  inverse.copy(root.quaternion).invert();
  world.copy(root.quaternion).multiply(local).multiply(inverse);
  root.position.applyQuaternion(world);
  root.quaternion.multiply(local);
}

export interface DragMotion {
  angle: number;
  targetAngle: number;
  initial: number;
  transition?: { start: number; duration: number };
}
export function updateDragTransition(drag: DragMotion, now: number) {
  if (!drag.transition) return;
  const { start, duration } = drag.transition;
  const progress = MathUtils.smoothstep(now, start, start + duration);
  drag.angle = MathUtils.lerp(drag.initial, drag.targetAngle, progress);
  if (progress === 1) drag.transition = undefined;
}
