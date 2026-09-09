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
    ? '当前状态未通过合法性校验，请重新载入已保存方案。'
    : pictureSolved
      ? '魔方与贴片方向均已复原，无需计算。'
      : colorSolved
        ? '六面颜色已还原，中心片仍有方向差异。若要还原照片或标记方向，建议只补充定向步骤。'
        : images
          ? `检测到 ${images} 个图片贴片。建议同时还原图片方向，确保照片完整拼合。`
          : '当前魔方尚未复原。需要较短解法可选 Fast；需要观察人类还原过程可选 CFOP。';
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
