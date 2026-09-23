import { tx } from '@/lib/i18n';
import {
  apply,
  solved,
  isSolved,
  isPictureSolved,
  type CubeState,
} from './model';
import type { Appearance } from './appearance';
export interface Preflight {
  valid: boolean;
  needed: boolean;
  colorSolved: boolean;
  pictureSolved: boolean;
  images: number;
  groups: number;
  recommendPictures: boolean;
  message: string;
  fingerprint: string;
}
export function cubeFingerprint(cube: CubeState) {
  return JSON.stringify(cube.map((p) => [p.id, p.pos, p.basis]));
}
export function checkBeforeSolve(
  cube: CubeState,
  history: string[],
  cursor: number,
  appearance: Appearance,
): Preflight {
  const fingerprint = cubeFingerprint(cube),
    colorSolved = isSolved(cube),
    pictureSolved = isPictureSolved(cube),
    images = Object.values(appearance.stickers).filter(
      (a) => a.image || a.group,
    ).length,
    groups = Object.values(appearance.groups).filter(
      (g) => g.members.length > 1,
    ).length;
  let valid = false;
  try {
    valid =
      fingerprint ===
      cubeFingerprint(apply(solved(), history.slice(0, cursor)));
  } catch {
    valid = false;
  }
  const message = !valid
    ? tx('legacy.m461')
    : pictureSolved
      ? tx('legacy.m462')
      : colorSolved
        ? tx('legacy.m463')
        : images
          ? tx('legacy.m464', { p0: images })
          : tx('legacy.m465');
  return {
    valid,
    needed: valid && !pictureSolved,
    colorSolved,
    pictureSolved,
    images,
    groups,
    recommendPictures: images > 0 || colorSolved,
    message,
    fingerprint,
  };
}
