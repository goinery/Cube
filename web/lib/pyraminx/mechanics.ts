import * as T from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { capFrame, capOutline } from './cap-profile';
import { PIECES, VERTICES, type Tile } from './model';

export { clipGeometry } from '../rendering/clip-geometry';

// Small sleeves are retained only for the core bearings and magnet sockets.
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

export function sleeve(outer: number, inner: number, height: number) {
  const shape = new T.Shape();
  shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
  const hole = new T.Path();
  hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return extrude(shape, height, 0.004);
}

interface HullFace {
  points: T.Vector3[];
  normal: T.Vector3;
  mapping?: HullPlane['mapping'];
  spherical?: boolean;
}
interface HullPlane {
  plane: T.Plane;
  mapping?: {
    origin: T.Vector3;
    tangent: T.Vector3;
    depth: T.Vector3;
    arc: number;
  };
}

export const CENTER_SHELL_RADIUS = 0.7;
const SHELL_THICKNESS = 0.035;

function clipPolygon(points: T.Vector3[], plane: T.Plane) {
  const clipped: T.Vector3[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length],
      da = plane.distanceToPoint(a), db = plane.distanceToPoint(b);
    if (da <= 1e-9) clipped.push(a);
    if ((da <= 1e-9) !== (db <= 1e-9))
      clipped.push(a.clone().lerp(b, da / (da - db)));
  }
  return clipped;
}

// Subtract a tessellated sphere from the moulding, sharing the same cuts on
// the side panels and the spherical floor so the resulting shell is closed.
function sphericalFloor(faces: HullFace[], boundaries: HullPlane[], home: T.Vector3, radius: number) {
  const sphere = new T.IcosahedronGeometry(radius, 5),
    positions = sphere.getAttribute('position'),
    facets: HullFace[] = [];
  for (let i = 0; i < positions.count; i += 3) {
    const points = [0, 1, 2].map((j) => new T.Vector3().fromBufferAttribute(positions, i + j).sub(home));
    const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
    facets.push({ points, normal });
  }
  sphere.dispose();
  const planes = facets.map(({ points, normal }) => new T.Plane().setFromNormalAndCoplanarPoint(normal, points[0]));
  const result: HullFace[] = [];
  for (const face of faces) {
    // Most cap backings and the tip-facing wall do not intersect the sphere.
    if (planes.some((p) => face.points.every((v) => p.distanceToPoint(v) >= -1e-9))) {
      result.push(face);
      continue;
    }
    let remaining = face.points;
    for (const plane of planes) {
      if (remaining.length < 3) break;
      const outside = clipPolygon(remaining, plane.clone().negate());
      if (outside.length >= 3) result.push({ ...face, points: outside });
      remaining = clipPolygon(remaining, plane);
    }
  }
  for (const face of facets) {
    let points = face.points;
    for (const { plane } of boundaries) {
      points = clipPolygon(points, plane);
      if (points.length < 3) break;
    }
    if (points.length >= 3)
      result.push({ points: points.reverse(), normal: face.normal.clone().negate(), spherical: true });
  }
  return result;
}

// Unlike trimming existing triangles, clipping a volume also builds the new
// walls along each rounded cap edge. Those walls retain a continuous UV strip.
function clipHull(source: HullFace[], boundaries: HullPlane[]) {
  let faces = source;
  for (const { plane, mapping } of boundaries) {
    const next: HullFace[] = [],
      cut: T.Vector3[] = [];
    for (const face of faces) {
      const points: T.Vector3[] = [];
      for (let i = 0; i < face.points.length; i++) {
        const a = face.points[i],
          b = face.points[(i + 1) % face.points.length],
          da = plane.distanceToPoint(a),
          db = plane.distanceToPoint(b),
          insideA = da <= 1e-9,
          insideB = db <= 1e-9;
        if (insideA) points.push(a);
        if (insideA !== insideB) {
          const point = a.clone().lerp(b, da / (da - db));
          points.push(point);
          if (!cut.some((p) => p.distanceToSquared(point) < 1e-16))
            cut.push(point);
        }
      }
      if (points.length >= 3) next.push({ ...face, points });
    }
    if (cut.length >= 3) {
      const center = cut
          .reduce((c, p) => c.add(p), new T.Vector3())
          .divideScalar(cut.length),
        x = cut[0].clone().sub(center).normalize(),
        y = plane.normal.clone().cross(x);
      cut.sort((a, b) => {
        const pa = a.clone().sub(center),
          pb = b.clone().sub(center);
        return (
          Math.atan2(pa.dot(y), pa.dot(x)) - Math.atan2(pb.dot(y), pb.dot(x))
        );
      });
      next.push({ points: cut, normal: plane.normal, mapping });
    }
    faces = next;
  }
  return faces;
}

// Every piece is a complete moulding: cap-contact backings meet the coloured
// caps, and all remaining faces are honeycomb panels joined along shared edges.
// Start from the tetrahedron so shifted tip cuts cannot leave a short backing.
export function hollowChassis(
  home: T.Vector3,
  tiles: Tile[],
  clearance: T.Plane[],
) {
  const centerPiece = PIECES[tiles[0].piece].kind === 'center';
  // A centre has three cap seats. Intersecting three infinite cap prisms
  // cuts holes under the other two seats; join their actual back contours
  // instead, then close the inner end with the concentric spherical floor.
  const hullPoints = centerPiece
    ? [new T.Vector3().sub(home), ...tiles.flatMap((tile) => {
        const { center, x, y, normal } = capFrame(tile);
        return capOutline(tile).map((p) => center.clone()
          .addScaledVector(x, p.x * 0.968)
          .addScaledVector(y, p.y * 0.968)
          .addScaledVector(normal, -0.0431).sub(home));
      })]
    : VERTICES.map((p) => new T.Vector3(...p).sub(home));
  const hull = new ConvexGeometry(hullPoints);
  const position = hull.getAttribute('position'),
    normal = hull.getAttribute('normal');
  const source: HullFace[] = [],
    boundaries: HullPlane[] = [],
    exterior = tiles.map((tile) => capFrame(tile).normal);
  for (let i = 0; i < position.count; i += 3) {
    const face = {
      normal: new T.Vector3().fromBufferAttribute(normal, i),
      points: [0, 1, 2].map((j) =>
        new T.Vector3().fromBufferAttribute(position, i + j),
      ),
    };
    source.push(face);
    const plane = new T.Plane().setFromNormalAndCoplanarPoint(
      face.normal,
      face.points[0],
    );
    if (
      !boundaries.some(
        (b) =>
          b.plane.normal.dot(plane.normal) > 0.999999 &&
          Math.abs(b.plane.constant - plane.constant) < 1e-6,
      )
    )
      boundaries.push({ plane });
  }
  hull.dispose();
  boundaries.push(
    ...clearance.map((p) => ({
      plane: new T.Plane(p.normal.clone(), p.constant + p.normal.dot(home)),
    })),
  );
  for (const tile of centerPiece ? [] : tiles) {
    const { center, x, y, normal } = capFrame(tile),
      outline = capOutline(tile).map((p) => p.multiplyScalar(0.968));
    let arc = 0;
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length],
        edge = b.clone().sub(a),
        length = edge.length(),
        tangent = x
          .clone()
          .multiplyScalar(edge.x)
          .addScaledVector(y, edge.y)
          .normalize(),
        outward = tangent.clone().cross(normal),
        origin = center
          .clone()
          .sub(home)
          .addScaledVector(x, a.x)
          .addScaledVector(y, a.y);
      boundaries.push({
        plane: new T.Plane().setFromNormalAndCoplanarPoint(outward, origin),
        mapping: { origin, tangent, depth: normal, arc },
      });
      arc += length;
    }
  }
  const surfaces = [0, 1].map(() => ({
      positions: [] as number[],
      normals: [] as number[],
      uv: [] as number[],
    })),
    geometry = new T.BufferGeometry();
  for (const inside of [false, true]) {
    const bounds = boundaries.map((b) => ({
        ...b,
        plane: new T.Plane(
          b.plane.normal,
          b.plane.constant + (inside ? SHELL_THICKNESS : 0),
        ),
      }));
    let faces = clipHull(source, bounds);
    if (centerPiece)
      faces = sphericalFloor(faces, bounds, home, CENTER_SHELL_RADIUS + (inside ? SHELL_THICKNESS : 0));
    for (const { points, normal: n, mapping, spherical } of faces) {
      const contact = exterior.some((face) => face.dot(n) > 0.999),
        { positions, normals, uv } = surfaces[inside || contact ? 1 : 0];
      const x = new T.Vector3(n.y, -n.x, 0);
      if (x.lengthSq() < 0.01) x.set(1, 0, 0);
      x.normalize();
      const y = n.clone().cross(x);
      for (let i = 1; i + 1 < points.length; i++) {
        if (
          points[i]
            .clone()
            .sub(points[0])
            .cross(points[i + 1].clone().sub(points[0]))
            .lengthSq() < 1e-16
        )
          continue;
        for (const j of inside ? [0, i + 1, i] : [0, i, i + 1]) {
          const p = points[j];
          positions.push(...p.toArray());
          const surfaceNormal = spherical ? p.clone().add(home).normalize().negate() : n.clone();
          normals.push(
            ...surfaceNormal
              .multiplyScalar(inside ? -1 : 1)
              .toArray(),
          );
          if (spherical) {
            const world = p.clone().add(home).normalize();
            uv.push(Math.atan2(world.z, world.x) / (2 * Math.PI) * 3,
              Math.acos(T.MathUtils.clamp(world.y, -1, 1)) / Math.PI * 1.5);
          } else if (mapping) {
            const local = p.clone().sub(mapping.origin);
            uv.push(
              (mapping.arc + local.dot(mapping.tangent)) * 0.7,
              local.dot(mapping.depth) * 0.7,
            );
          } else uv.push(p.dot(x) * 0.7, p.dot(y) * 0.7);
        }
      }
    }
  }
  const positions = surfaces.flatMap((s) => s.positions),
    normals = surfaces.flatMap((s) => s.normals),
    uv = surfaces.flatMap((s) => s.uv),
    wallCount = surfaces[0].positions.length / 3;
  geometry.addGroup(0, wallCount, 0);
  geometry.addGroup(wallCount, surfaces[1].positions.length / 3, 1);
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  return geometry;
}
