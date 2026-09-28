import { Plane,Vector2,Vector3 } from 'three';

// Match the three-by-three cap's narrow seam and mitred underside.
export const CAP_INSET = 0.002;
export const CAP_MITER_CLEARANCE = 0.001;

export function insetCapOutline(points: Vector2[], inset = CAP_INSET) {
  return points.map((point, i) => {
    const before = points[(i + points.length - 1) % points.length]
        .clone()
        .sub(point)
        .normalize(),
      after = points[(i + 1) % points.length].clone().sub(point).normalize();
    return point
      .clone()
      .addScaledVector(
        before.clone().add(after).normalize(),
        inset / Math.sqrt((1 - before.dot(after)) / 2),
      );
  });
}

// Boundaries are in cap-local coordinates. Keep each ring at its original
// depth while trimming its outline against the adjoining faces/layer cuts.
export function trimCapVertex(
  point: Vector3,
  boundaries: readonly Plane[],
  normal: Vector3,
) {
  let scale = 1;
  for (const { normal: n, constant } of boundaries) {
    const radial = point.x * n.x + point.y * n.y;
    if (radial > 1e-10)
      scale = Math.min(scale, (-constant - point.z * n.z) / radial);
  }
  if (scale >= 1) return;
  point.x *= Math.max(0, scale);
  point.y *= Math.max(0, scale);
  normal.set(0, 0, 0);
  for (const boundary of boundaries)
    if (Math.abs(boundary.distanceToPoint(point)) < 1e-7)
      normal.add(boundary.normal);
  normal.normalize();
}
