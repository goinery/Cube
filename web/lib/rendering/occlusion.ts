import { Matrix4, Vector3 } from 'three';

/** Conservative low-resolution depth coverage, including unions of caps.
 * A cell is covered only if ALL four corners lie inside an opaque polygon;
 * even a subpixel gap keeps the cell open. No visibility depends on a timer.
 */
export class OcclusionCoverage {
  private readonly size = 96;
  private readonly depth = new Float64Array(this.size * this.size);
  private readonly projected: Vector3[] = [];
  private readonly point = new Vector3();
  private readonly matrix = new Matrix4();

  reset(matrix: Matrix4) {
    this.matrix.copy(matrix);
    this.depth.fill(Infinity);
  }

  add(polygon: Vector3[]) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const p = (this.projected[i] ??= new Vector3())
        .copy(polygon[i])
        .applyMatrix4(this.matrix);
      if (p.z <= -1 || p.z >= 1) return;
      p.x = ((p.x + 1) * this.size) / 2;
      p.y = ((p.y + 1) * this.size) / 2;
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const count = polygon.length;
    const a = this.projected[0],
      b = this.projected[Math.floor(count / 3)],
      c = this.projected[Math.floor((count * 2) / 3)];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      ex = c.x - a.x,
      ey = c.y - a.y;
    const determinant = dx * ey - dy * ex;
    if (Math.abs(determinant) < 1e-9) return;
    const sign = Math.sign(determinant);
    const zx = ((b.z - a.z) * ey - (c.z - a.z) * dy) / determinant;
    const zy = (dx * (c.z - a.z) - ex * (b.z - a.z)) / determinant;
    for (
      let y = Math.max(0, Math.ceil(minY));
      y < Math.min(this.size, Math.floor(maxY));
      y++
    ) {
      for (
        let x = Math.max(0, Math.ceil(minX));
        x < Math.min(this.size, Math.floor(maxX));
        x++
      ) {
        let covered = true;
        for (let i = 0; i < count; i++) {
          const p = this.projected[i],
            q = this.projected[(i + 1) % count];
          const nx = -(q.y - p.y) * sign,
            ny = (q.x - p.x) * sign;
          if (
            nx * (x - p.x) +
              ny * (y - p.y) +
              Math.min(0, nx) +
              Math.min(0, ny) <
            1e-7
          ) {
            covered = false;
            break;
          }
        }
        if (covered) {
          const far =
            a.z +
            zx * (x - a.x) +
            zy * (y - a.y) +
            Math.max(0, zx) +
            Math.max(0, zy) +
            1e-7;
          const index = y * this.size + x;
          this.depth[index] = Math.min(this.depth[index], far);
        }
      }
    }
  }

  occludes(bounds: Vector3[]) {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      near = Infinity;
    for (const corner of bounds) {
      const p = this.point.copy(corner).applyMatrix4(this.matrix);
      if (p.z <= -1 || p.z >= 1) return false;
      minX = Math.min(minX, ((p.x + 1) * this.size) / 2);
      maxX = Math.max(maxX, ((p.x + 1) * this.size) / 2);
      minY = Math.min(minY, ((p.y + 1) * this.size) / 2);
      maxY = Math.max(maxY, ((p.y + 1) * this.size) / 2);
      near = Math.min(near, p.z);
    }
    const left = Math.max(0, Math.floor(minX)),
      right = Math.min(this.size - 1, Math.floor(maxX));
    const bottom = Math.max(0, Math.floor(minY)),
      top = Math.min(this.size - 1, Math.floor(maxY));
    if (left > right || bottom > top) return false;
    for (let y = bottom; y <= top; y++)
      for (let x = left; x <= right; x++)
        if (this.depth[y * this.size + x] >= near - 1e-6) return false;
    return true;
  }
}
