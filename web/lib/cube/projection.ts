import { Matrix4, Vector3 } from 'three';
import { FACE, type Face } from './model';

export function projectionTransform(
  face: Face,
  radius: number,
  reverse: boolean,
) {
  const f = FACE[face];
  const inverse = new Matrix4()
    .makeBasis(new Vector3(...f.r), new Vector3(...f.u), new Vector3(...f.n))
    .invert();
  return new Matrix4()
    .makeRotationY(reverse ? Math.PI : 0)
    .multiply(new Matrix4().makeTranslation(0, 0, -radius))
    .multiply(inverse);
}

export function facesProjection(world: Matrix4, face: Face) {
  const normal = new Vector3(0, 0, 1).transformDirection(world);
  return normal.dot(new Vector3(...FACE[face].n)) > 0.001;
}
