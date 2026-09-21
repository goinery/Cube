import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector2,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Sticker } from './model';

export function tileRadii(row: number, col: number): number[] {
  if (row === 1 && col === 1) return [0.29, 0.29, 0.29, 0.29];
  const small = 0.035,
    large = 0.31;
  if (row === 0 && col === 1) return [small, small, large, large];
  if (row === 2 && col === 1) return [large, large, small, small];
  if (row === 1 && col === 0) return [small, large, large, small];
  if (row === 1 && col === 2) return [large, small, small, large];
  return [small, small, small, small];
}

export function smoothBevels(geometry: BufferGeometry) {
  geometry.deleteAttribute('normal');
  const smooth = mergeVertices(geometry, 0.00001);
  smooth.computeVertexNormals();
  geometry.dispose();
  return smooth;
}

export function createTileGeometry(sticker: Pick<Sticker, 'row' | 'col'>) {
  const outline = tileOutline(sticker.row, sticker.col),
    positions: number[] = [],
    normals: number[] = [],
    uv: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  // Indexed profile rings give the cap a rolled lip and a very slight crown.
  // Small corners use fewer samples; the larger centre-facing curves stay smooth.
  const profile = [
    [0.968, -0.05],
    [0.99, -0.044],
    [1, -0.03],
    [1, 0.019],
    [0.997, 0.03],
    [0.989, 0.04],
    [0.976, 0.047],
    [0.958, 0.05],
    [0.82, 0.054],
    [0.52, 0.058],
  ];
  let miterX = 0,
    miterY = 0;
  const vertex = (x: number, y: number, z: number) => {
    // Adjacent caps meet at a mitred underside, not overlapping thick slabs.
    // These are piece-local dimensions, so small cubies retain the same fit.
    const seam = 0.455 + z - 0.001;
    miterX = miterY = 0;
    if (sticker.col === 0 && x < -seam) {
      x = -seam;
      miterX = -1;
    }
    if (sticker.col === 2 && x > seam) {
      x = seam;
      miterX = 1;
    }
    if (sticker.row === 0 && y > seam) {
      y = seam;
      miterY = 1;
    }
    if (sticker.row === 2 && y < -seam) {
      y = -seam;
      miterY = -1;
    }
    positions.push(x, y, z);
    uv.push(x / 0.996 + 0.5, y / 0.996 + 0.5);
    const shade = z < 0.019 ? 0.82 + ((z + 0.05) / 0.069) * 0.18 : 1;
    colors.push(shade, shade, shade);
  };
  const lipNormals = [
    [0, -1],
    [0.707, -0.707],
    [1, 0],
    [1, 0],
    [0.924, 0.383],
    [0.707, 0.707],
    [0.383, 0.924],
  ];
  const normal = new Vector3();
  for (const [ring, [scale, z]] of profile.entries())
    for (const { point, outward } of outline) {
      const x = point.x * scale,
        y = point.y * scale;
      if (ring >= 7) {
        const h2 = 0.498 ** 2;
        vertex(x, y, 0.05 + 0.01 * (1 - (x * x) / h2) * (1 - (y * y) / h2));
        normal
          .set(
            ((0.02 * x) / h2) * (1 - (y * y) / h2),
            ((0.02 * y) / h2) * (1 - (x * x) / h2),
            1,
          )
          .normalize();
      } else {
        vertex(x, y, z);
        const [radial, axial] = lipNormals[ring];
        normal.set(outward.x * radial, outward.y * radial, axial).normalize();
      }
      if (miterX || miterY)
        normal
          .set(miterX, miterY, -Math.abs(miterX) - Math.abs(miterY))
          .normalize();
      normals.push(...normal.toArray());
    }
  const count = outline.length;
  for (let ring = 0; ring < profile.length - 1; ring++)
    for (let i = 0; i < count; i++) {
      const a = ring * count + i,
        b = ring * count + ((i + 1) % count),
        c = a + count,
        d = b + count;
      indices.push(a, b, c, b, d, c);
    }
  const front = positions.length / 3;
  vertex(0, 0, 0.06);
  normals.push(0, 0, 1);
  const back = positions.length / 3;
  vertex(0, 0, -0.05);
  normals.push(0, 0, -1);
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % count,
      lastRing = (profile.length - 1) * count;
    indices.push(lastRing + i, lastRing + next, front, next, i, back);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  // This convex polygon is inside the solid cap at z=0.019, including its bevel.
  geometry.userData.occluder = outline.map((_, i) => [
    positions[(3 * count + i) * 3] * 0.995,
    positions[(3 * count + i) * 3 + 1] * 0.995,
    0.019,
  ]);
  return geometry;
}

function tileOutline(row: number, col: number) {
  const radii = tileRadii(row, col),
    h = 0.498;
  const points: { point: Vector2; outward: Vector2 }[] = [];
  // Counterclockwise quadratic corners, matching the face-map silhouettes.
  for (const [index, x, y] of [
    [2, 1, -1],
    [1, 1, 1],
    [0, -1, 1],
    [3, -1, -1],
  ]) {
    const radius = radii[index] + 0.014;
    const corner = new Vector2(x * h, y * h);
    const start = corner
      .clone()
      .add(new Vector2(y < 0 ? -x * radius : 0, y > 0 ? -y * radius : 0));
    const end = corner
      .clone()
      .add(new Vector2(y > 0 ? -x * radius : 0, y < 0 ? -y * radius : 0));
    // The top-left / bottom-left corners run in the opposite axis order.
    if (x < 0) {
      const temp = start.clone();
      start.copy(end);
      end.copy(temp);
    }
    const segments = radius < 0.1 ? 4 : 12;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments,
        u = 1 - t;
      const tangent = corner
        .clone()
        .sub(start)
        .multiplyScalar(u)
        .addScaledVector(end.clone().sub(corner), t)
        .normalize();
      points.push({
        point: start
          .clone()
          .multiplyScalar(u * u)
          .addScaledVector(corner, 2 * u * t)
          .addScaledVector(end, t * t),
        outward: new Vector2(tangent.y, -tangent.x),
      });
    }
  }
  return points.flatMap((p, i) => {
    const next = points[(i + 1) % points.length];
    return p.point.distanceTo(next.point) > 0.2
      ? [
          p,
          {
            point: p.point.clone().lerp(next.point, 0.5),
            outward: p.outward.clone().lerp(next.outward, 0.5).normalize(),
          },
        ]
      : [p];
  });
}
