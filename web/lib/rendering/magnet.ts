export function stepMagnet(
  angle: number,
  velocity: number,
  target: number,
  dt: number,
  strength: number,
  damping: number,
) {
  if (strength <= 0) return { angle, velocity: 0 };
  const stiffness = 360 * strength,
    friction = 2 * Math.sqrt(stiffness) * damping;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240))),
    h = dt / steps;
  for (let i = 0; i < steps; i++) {
    velocity += ((target - angle) * stiffness - friction * velocity) * h;
    angle += velocity * h;
  }
  return { angle, velocity };
}
export function magneticTarget(angle: number, velocity = 0, step = Math.PI / 2): number {
  const progress = angle / step;
  let quarter = Math.round(progress);
  if (Math.abs(velocity) > 0.0025 && Math.abs(angle) > 0.16) {
    const projected =
      (angle + Math.max(-0.42, Math.min(0.42, velocity * 75))) / step;
    quarter = Math.round(projected);
  }
  return quarter * step;
}
export function magneticEase(t: number): number {
  return t >= 1
    ? 1
    : 1 - Math.exp(-9 * t) * (Math.cos(12 * t) + 0.75 * Math.sin(12 * t));
}
