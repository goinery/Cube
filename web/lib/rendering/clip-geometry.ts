import * as T from 'three';

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
