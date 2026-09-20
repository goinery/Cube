import * as T from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

interface ClipVertex {
  position: T.Vector3;
  normal: T.Vector3;
  uv: T.Vector2;
}

// Trim mouldings in their assembled coordinate system. A triangular seat moved
// inward along one face otherwise sticks out through the two adjoining faces.
// Preserve UVs, normals and material groups when cutting the actual triangles.
export function clipGeometry(
  source: T.BufferGeometry,
  planes: T.Plane[],
  transform = new T.Matrix4(),
) {
  const positions = source.getAttribute('position'),
    normals = source.getAttribute('normal'),
    uvs = source.getAttribute('uv'),
    normalMatrix = new T.Matrix3().getNormalMatrix(transform),
    inverse = transform.clone().invert(),
    inverseNormal = new T.Matrix3().getNormalMatrix(inverse);
  const vertices: number[] = [],
    normalValues: number[] = [],
    uvValues: number[] = [];
  const geometry = new T.BufferGeometry();
  const read = (index: number): ClipVertex => {
    const i = source.index ? source.index.getX(index) : index;
    return {
      position: new T.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(transform),
      normal: new T.Vector3()
        .fromBufferAttribute(normals, i)
        .applyNormalMatrix(normalMatrix),
      uv: uvs ? new T.Vector2(uvs.getX(i), uvs.getY(i)) : new T.Vector2(),
    };
  };
  const count = source.index?.count ?? positions.count;
  const groups = source.groups.length
    ? source.groups
    : [{ start: 0, count, materialIndex: 0 }];
  for (const group of groups) {
    const start = vertices.length / 3;
    for (
      let i = group.start;
      i < Math.min(count, group.start + group.count);
      i += 3
    ) {
      let polygon = [read(i), read(i + 1), read(i + 2)];
      for (const plane of planes) {
        const next: ClipVertex[] = [];
        for (let j = 0; j < polygon.length; j++) {
          const a = polygon[j],
            b = polygon[(j + 1) % polygon.length],
            da = plane.distanceToPoint(a.position),
            db = plane.distanceToPoint(b.position);
          if (da <= 0) next.push(a);
          if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
            const t = da / (da - db);
            next.push({
              position: a.position.clone().lerp(b.position, t),
              normal: a.normal.clone().lerp(b.normal, t).normalize(),
              uv: a.uv.clone().lerp(b.uv, t),
            });
          }
        }
        polygon = next;
        if (polygon.length < 3) break;
      }
      for (let j = 1; j + 1 < polygon.length; j++) {
        for (const vertex of [polygon[0], polygon[j], polygon[j + 1]]) {
          vertices.push(
            ...vertex.position.clone().applyMatrix4(inverse).toArray(),
          );
          normalValues.push(
            ...vertex.normal.clone().applyNormalMatrix(inverseNormal).toArray(),
          );
          uvValues.push(...vertex.uv.toArray());
        }
      }
    }
    geometry.addGroup(start, vertices.length / 3 - start, group.materialIndex);
  }
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute(
    'normal',
    new T.Float32BufferAttribute(normalValues, 3),
  );
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uvValues, 2));
  return geometry;
}

// Dimensions are visual approximations from GAN's Pyraminx exploded views:
// https://www.gancube.cn/gan-pyraminx/ and .local/images/03.jpg.
// Cap seats are open, smooth mouldings; honeycomb belongs to sliding surfaces.
export function triangleOutline(side: number, rounding: number) {
  const height = (side * Math.sqrt(3)) / 2;
  const corners = [
    new T.Vector2(0, (height * 2) / 3),
    new T.Vector2(-side / 2, -height / 3),
    new T.Vector2(side / 2, -height / 3),
  ];
  const outline: T.Vector2[] = [];
  for (let i = 0; i < 3; i++) {
    const corner = corners[i],
      start = corner.clone().lerp(corners[(i + 2) % 3], rounding),
      end = corner.clone().lerp(corners[(i + 1) % 3], rounding);
    for (let j = 0; j <= 6; j++) {
      const t = j / 6;
      outline.push(
        start
          .clone()
          .multiplyScalar((1 - t) ** 2)
          .addScaledVector(corner, 2 * t * (1 - t))
          .addScaledVector(end, t * t),
      );
    }
  }
  return outline;
}

function extrude(shape: T.Shape, depth: number, bevel = 0.006) {
  const geometry = new T.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments: 24,
    bevelEnabled: bevel > 0,
    bevelSegments: 2,
    bevelSize: bevel,
    bevelThickness: bevel,
  });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

export function capSeat(side: number, rounding: number) {
  const outline = triangleOutline(side, rounding);
  const shape = new T.Shape(
    outline.map((p) => p.clone().multiplyScalar(0.953)),
  );
  // A real opening, not a dark triangle painted over a closed solid.
  shape.holes.push(
    new T.Path(outline.map((p) => p.clone().multiplyScalar(0.79)).reverse()),
  );
  return extrude(shape, 0.065, 0.008);
}

export function sleeve(outer: number, inner: number, height: number) {
  const shape = new T.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new T.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return extrude(shape, height, 0.004);
}

export function perforatedTrack() {
  const shape = new T.Shape();
  shape.absarc(0, 0, 0.37, 0, Math.PI * 2, false);
  const bore = new T.Path();
  bore.absarc(0, 0, 0.23, 0, Math.PI * 2, true);
  shape.holes.push(bore);
  for (let i = 0; i < 15; i++) {
    const angle = (i * Math.PI * 2) / 15,
      hole = new T.Path();
    hole.absarc(
      Math.cos(angle) * 0.305,
      Math.sin(angle) * 0.305,
      0.029,
      0,
      Math.PI * 2,
      true,
    );
    shape.holes.push(hole);
  }
  return extrude(shape, 0.09, 0.005);
}

export function springGeometry() {
  class Helix extends T.Curve<T.Vector3> {
    constructor() {
      super();
    }
    getPoint(t: number, point = new T.Vector3()) {
      const angle = t * Math.PI * 2 * 5;
      return point.set(
        Math.cos(angle) * 0.079,
        Math.sin(angle) * 0.079,
        (t - 0.5) * 0.26,
      );
    }
  }
  return new T.TubeGeometry(new Helix(), 100, 0.012, 6, false);
}

// Remove every exterior sticker plane from the convex chassis. Retain a thin
// inner skin so looking into an empty cap seat reveals a moulded cavity.
export function hollowChassis(
  points: T.Vector3[],
  home: T.Vector3,
  exterior: T.Vector3[],
  openAxis?: T.Vector3,
) {
  const hull = new ConvexGeometry(
    points.map((p) => p.clone().sub(home).multiplyScalar(0.95)),
  );
  const position = hull.getAttribute('position'),
    normal = hull.getAttribute('normal');
  const positions: number[] = [],
    normals: number[] = [],
    uv: number[] = [];
  const groups: { start: number; count: number; material: number }[] = [];
  for (let i = 0; i < position.count; i += 3) {
    const n = new T.Vector3().fromBufferAttribute(normal, i);
    if (exterior.some((face) => face.dot(n) > 0.999)) continue;
    if (openAxis && Math.abs(openAxis.dot(n)) > 0.999) continue;
    const x = new T.Vector3(n.y, -n.x, 0);
    if (x.lengthSq() < 0.01) x.set(1, 0, 0);
    x.normalize();
    const y = n.clone().cross(x);
    for (const inside of [false, true]) {
      const start = positions.length / 3;
      for (const j of inside ? [2, 1, 0] : [0, 1, 2]) {
        const p = new T.Vector3().fromBufferAttribute(position, i + j);
        if (inside) p.addScaledVector(n, -0.045);
        positions.push(...p.toArray());
        normals.push(
          ...n
            .clone()
            .multiplyScalar(inside ? -1 : 1)
            .toArray(),
        );
        uv.push(p.dot(x) * 0.7, p.dot(y) * 0.7);
      }
      groups.push({ start, count: 3, material: inside ? 1 : 0 });
    }
  }
  hull.dispose();
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  groups.forEach((g) => geometry.addGroup(g.start, g.count, g.material));
  return geometry;
}
