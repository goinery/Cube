import { Vector2, Vector3 } from 'three';
import { PIECES, VERTICES, type Tile } from './model';

// Measured against .local/images/正视图.png: the tip seam is slightly
// above one third; the six centre-facing corners have much larger fillets.
export const TIP_CUT = 1.37;
export const CAP_SEAM = 0.0075;

export function capFrame(tile: Tile) {
  const points = tile.points.map((p) => new Vector3(...p)),
    center = points.reduce((c, p) => c.add(p), new Vector3()).divideScalar(3),
    x = points[2].clone().sub(points[1]).normalize(),
    y = points[0].clone().sub(center).normalize();
  return { center, x, y, normal: x.clone().cross(y).normalize() };
}

export function capOutline(tile: Tile) {
  const points = tile.points.map((p) => new Vector3(...p)),
    { center, x, y } = capFrame(tile),
    faceCenter = new Vector3(...VERTICES[tile.face]).multiplyScalar(-1 / 3),
    piece = PIECES[tile.piece];
  const rounding = points.map((p) =>
    p.distanceTo(faceCenter) < 1e-6
      ? piece.kind === 'center'
        ? 0.29
        : 0.34
      : piece.kind === 'tip'
        ? 0.095
        : 0.08,
  );
  if (piece.kind !== 'edge') {
    const tip = new Vector3(...VERTICES[piece.vertices[0]]),
      axis = tip.clone().normalize();
    for (const p of points)
      if (Math.abs(p.dot(axis) - 4 / 3) < 1e-6)
        p.lerp(tip, (TIP_CUT - 4 / 3) / (2.4 - 4 / 3));
  }
  const corners = points.map((p) => {
    const local = p.clone().sub(center);
    return new Vector2(local.dot(x), local.dot(y));
  });
  // Offset each straight edge by a physical distance, so all seams have the
  // same width even though the three cap types have different proportions.
  const inset = corners.map((p, i) => {
    const a = corners[(i + 2) % 3].clone().sub(p).normalize(),
      b = corners[(i + 1) % 3].clone().sub(p).normalize(),
      bisector = a.clone().add(b).normalize();
    return p
      .clone()
      .addScaledVector(bisector, CAP_SEAM / Math.sqrt((1 - a.dot(b)) / 2));
  });
  return inset.flatMap((corner, i) => {
    const start = corner.clone().lerp(inset[(i + 2) % 3], rounding[i]),
      end = corner.clone().lerp(inset[(i + 1) % 3], rounding[i]);
    return Array.from({ length: 13 }, (_, j) => {
      const t = j / 12;
      return start
        .clone()
        .multiplyScalar((1 - t) ** 2)
        .addScaledVector(corner, 2 * t * (1 - t))
        .addScaledVector(end, t * t);
    });
  });
}
