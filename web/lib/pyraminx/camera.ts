import { Vector3 } from 'three';
import { VERTICES } from './model';

export const INITIAL_DIRECTION = new Vector3(0, 1, 0);
// The red/yellow edge joins R and B; pointing screen-up toward L makes that
// edge horizontal along the bottom when looking directly down the U axis.
export const INITIAL_UP = new Vector3(
  VERTICES[1][0],
  0,
  VERTICES[1][2],
).normalize();
