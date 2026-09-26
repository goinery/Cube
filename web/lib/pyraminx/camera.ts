import { Vector3 } from 'three';
import { PUZZLE_DEFAULTS } from '../puzzle-config';
export const INITIAL_DIRECTION = new Vector3(
  ...PUZZLE_DEFAULTS.pyraminx.camera.direction,
).normalize();
export const INITIAL_UP = new Vector3(
  ...PUZZLE_DEFAULTS.pyraminx.camera.up,
).normalize();
