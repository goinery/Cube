import { tx } from '@/lib/i18n';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { smoothBevels, tileOutline } from './geometry';
import { FACE, type Piece } from './model';
import { clipGeometry } from '../rendering/clip-geometry';
type AddPart = (
  object: T.Object3D,
  position: T.Vector3,
  direction: T.Vector3,
  amount: number,
  magnet?: boolean,
) => T.Object3D;
interface Materials {
  body: T.Material;
  plastic: T.Material;
  guide: T.Material;
  magnet: T.Material;
  socket: T.Material;
}
function extrude(shape: T.Shape, depth: number, bevel = 0.012) {
  const geometry = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 16,
    steps: 1,
  });
  geometry.translate(0, 0, -depth / 2);
  const uv = geometry.getAttribute('uv'),
    p = geometry.getAttribute('position');
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, p.getX(i) + 0.5, p.getY(i) + 0.5);
  return smoothBevels(geometry);
}
function bore(shape: T.Shape, x: number, y: number, radius: number) {
  const hole = new T.Path();
  hole.absarc(x, y, radius, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}
function innerPanel(magnet: boolean) {
  const s = new T.Shape();
  s.moveTo(-0.4, 0.45);
  s.lineTo(0.4, 0.45);
  s.quadraticCurveTo(0.45, 0.45, 0.45, 0.4);
  s.lineTo(0.45, -0.4);
  s.quadraticCurveTo(0.45, -0.45, 0.38, -0.45);
  s.lineTo(-0.03, -0.45);
  s.bezierCurveTo(-0.1, -0.22, -0.22, -0.1, -0.45, -0.03);
  s.lineTo(-0.45, 0.38);
  s.quadraticCurveTo(-0.45, 0.45, -0.4, 0.45);
  if (magnet) bore(s, 0.2, 0.2, 0.115);
  return extrude(s, 0.05);
}
// Intersect the two cap silhouettes. At each cross-section both inward
// edges follow exactly the same quadratic curve as the coloured edge caps.
function edgeHousing(piece: Piece, materials: Materials) {
  const outline = tileOutline(0, 1).map(({ point }) =>
      point.clone().multiplyScalar(0.968),
    ),
    occupied = piece.home
      .map((sign, axis) => ({ sign, axis }))
      .filter(({ sign }) => sign),
    missing = piece.home.indexOf(0),
    points: T.Vector3[] = [],
    profile: {
      x: number;
      lower: number;
      length: number;
    }[] = [];
  for (const x of [...new Set(outline.map((p) => p.x))].sort((a, b) => a - b)) {
    const crossings: number[] = [];
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i],
        b = outline[(i + 1) % outline.length];
      if (Math.abs(a.x - x) < 1e-8) crossings.push(a.y);
      if (x > Math.min(a.x, b.x) && x < Math.max(a.x, b.x))
        crossings.push(a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y));
    }
    const lower = Math.min(...crossings),
      upper = Math.min(0.4045, Math.max(...crossings));
    const previous = profile.at(-1);
    profile.push({
      x,
      lower,
      length: previous
        ? previous.length + Math.hypot(x - previous.x, lower - previous.lower)
        : 0,
    });
    for (const a of [lower, upper])
      for (const b of [lower, upper])
        points.push(
          new T.Vector3()
            .setComponent(missing, x)
            .setComponent(occupied[0].axis, a * occupied[0].sign)
            .setComponent(occupied[1].axis, b * occupied[1].sign),
        );
  }
  const geometry = new ConvexGeometry(points),
    positions = geometry.getAttribute('position'),
    normals = geometry.getAttribute('normal'),
    surfaces = [0, 1].map(() => ({
      positions: [] as number[],
      normals: [] as number[],
      uv: [] as number[],
    }));
  for (let i = 0; i < positions.count; i += 3) {
    const n = new T.Vector3().fromBufferAttribute(normals, i);
    // Replace the two flat magnetic mating faces with drilled panels below.
    if (Math.abs(n.getComponent(missing)) > 1 - 1e-6) continue;
    const capBack = occupied.some(
        ({ axis, sign }) => n.getComponent(axis) * sign > 0.999,
      ),
      dominant = [0, 1, 2].sort(
        (a, b) => Math.abs(n.getComponent(b)) - Math.abs(n.getComponent(a)),
      )[0],
      axes = [0, 1, 2].filter((a) => a !== dominant),
      surface = surfaces[capBack ? 1 : 0],
      curved = occupied.find(
        ({ axis, sign }) => n.getComponent(axis) * sign < -1e-5,
      );
    for (let j = 0; j < 3; j++) {
      const p = new T.Vector3().fromBufferAttribute(positions, i + j);
      surface.positions.push(...p.toArray());
      surface.normals.push(...n.toArray());
      if (curved) {
        const along = profile.reduce((best, sample) =>
            Math.abs(sample.x - p.getComponent(missing)) <
            Math.abs(best.x - p.getComponent(missing))
              ? sample
              : best,
          ),
          other = occupied.find(({ axis }) => axis !== curved.axis)!;
        surface.uv.push(
          along.length,
          p.getComponent(other.axis) * other.sign + 0.5,
        );
      } else
        surface.uv.push(
          p.getComponent(axes[0]) + 0.5,
          p.getComponent(axes[1]) + 0.5,
        );
    }
  }
  for (const sign of [-1, 1]) {
    const section = sign < 0 ? profile[0] : profile.at(-1)!,
      shape = new T.Shape(),
      lower = section.lower,
      upper = 0.4045;
    shape.moveTo(lower, lower);
    shape.lineTo(upper, lower);
    shape.lineTo(upper, upper);
    shape.lineTo(lower, upper);
    shape.closePath();
    bore(shape, 0.2, 0.2, 0.115);
    const panel = new T.ShapeGeometry(shape, 24),
      normal = new T.Vector3().setComponent(missing, sign);
    let u = new T.Vector3().setComponent(occupied[0].axis, occupied[0].sign),
      v = new T.Vector3().setComponent(occupied[1].axis, occupied[1].sign);
    if (u.clone().cross(v).dot(normal) < 0) [u, v] = [v, u];
    const p = panel.getAttribute('position'),
      surface = surfaces[0];
    for (let i = 0; i < panel.index!.count; i++) {
      const index = panel.index!.getX(i),
        point = u
          .clone()
          .multiplyScalar(p.getX(index))
          .addScaledVector(v, p.getY(index))
          .setComponent(missing, section.x);
      surface.positions.push(...point.toArray());
      surface.normals.push(...normal.toArray());
      surface.uv.push(p.getX(index) + 0.5, p.getY(index) + 0.5);
    }
    panel.dispose();
  }
  // Keep the entire honeycomb wall in one draw group, including its curves.
  geometry.setAttribute(
    'position',
    new T.Float32BufferAttribute(
      surfaces.flatMap((s) => s.positions),
      3,
    ),
  );
  geometry.setAttribute(
    'normal',
    new T.Float32BufferAttribute(
      surfaces.flatMap((s) => s.normals),
      3,
    ),
  );
  geometry.setAttribute(
    'uv',
    new T.Float32BufferAttribute(
      surfaces.flatMap((s) => s.uv),
      2,
    ),
  );
  const wallCount = surfaces[0].positions.length / 3;
  geometry.addGroup(0, wallCount, 0);
  geometry.addGroup(wallCount, surfaces[1].positions.length / 3, 1);
  const mesh = new T.Mesh(geometry, [materials.body, materials.plastic]);
  mesh.name = tx('legacy.m428');
  return mesh;
}
export function createCenterHousing(
  piece: Piece,
  body: T.Material,
  plastic: T.Material,
) {
  const housing = new T.Group(),
    outline = tileOutline(1, 1).map(({ point }) =>
      point.clone().multiplyScalar(0.968),
    ),
    count = outline.length / 4;
  housing.name = tx('legacy.m429');
  housing.userData.primary = true;
  for (let side = 0; side < 4; side++) {
    const outer = Array.from(
        { length: count + 1 },
        (_, i) => outline[(side * count + i) % outline.length],
      ),
      inner = outer.map((p) => p.clone().multiplyScalar(0.91)).reverse(),
      panel = new T.Mesh(
        extrude(new T.Shape([...outer, ...inner]), 0.56, 0),
        body,
      );
    panel.position.z = 0.105;
    panel.name = tx('legacy.m430', { p0: side + 1 });
    // Use arc length around the shell and physical depth so hexagons keep
    // their aspect ratio on vertical walls and on the rounded corners.
    const p = panel.geometry.getAttribute('position'),
      uv = panel.geometry.getAttribute('uv');
    const startAngle = Math.atan2(outer[0].y, outer[0].x);
    for (let i = 0; i < p.count; i++) {
      let angle = Math.atan2(p.getY(i), p.getX(i));
      if (angle < startAngle - 1e-5) angle += Math.PI * 2;
      uv.setXY(i, angle * 0.47, p.getZ(i) + 0.28);
    }
    housing.add(panel);
  }
  const backing = new T.Mesh(
    extrude(new T.Shape(outline), 0.045, 0.004),
    plastic,
  );
  backing.position.z = 0.377;
  backing.name = tx('legacy.m431');
  housing.add(backing);
  const face = FACE[piece.stickers[0].face];
  housing.quaternion.setFromRotationMatrix(
    new T.Matrix4().makeBasis(
      new T.Vector3(...face.r),
      new T.Vector3(...face.u),
      new T.Vector3(...face.n),
    ),
  );
  return housing;
}
function triangle() {
  const s = new T.Shape();
  s.moveTo(0, 0.38);
  s.bezierCurveTo(0.08, 0.38, 0.36, -0.09, 0.36, -0.2);
  s.quadraticCurveTo(0.36, -0.3, 0.24, -0.31);
  s.quadraticCurveTo(0, -0.35, -0.24, -0.31);
  s.quadraticCurveTo(-0.36, -0.3, -0.36, -0.2);
  s.bezierCurveTo(-0.36, -0.09, -0.08, 0.38, 0, 0.38);
  return s;
}
function scaledHole(shape: T.Shape, scale: number) {
  const points = shape
    .getPoints(36)
    .reverse()
    .map((p) => p.multiplyScalar(scale));
  return new T.Path(points);
}
function wing() {
  const s = new T.Shape();
  s.moveTo(-0.36, -0.13);
  s.bezierCurveTo(-0.44, -0.02, -0.34, 0.24, -0.22, 0.25);
  s.quadraticCurveTo(-0.13, 0.24, -0.105, 0.1);
  s.quadraticCurveTo(0, 0.025, 0.105, 0.1);
  s.quadraticCurveTo(0.13, 0.24, 0.22, 0.25);
  s.bezierCurveTo(0.34, 0.24, 0.44, -0.02, 0.36, -0.13);
  s.quadraticCurveTo(0.29, -0.23, 0.14, -0.16);
  s.quadraticCurveTo(0, -0.095, -0.14, -0.16);
  s.quadraticCurveTo(-0.29, -0.23, -0.36, -0.13);
  bore(s, 0, 0, 0.048);
  return s;
}
function tube(outer: number, inner: number, depth: number) {
  return new T.LatheGeometry(
    [
      new T.Vector2(inner, -depth / 2),
      new T.Vector2(outer, -depth / 2),
      new T.Vector2(outer, depth / 2),
      new T.Vector2(inner, depth / 2),
      new T.Vector2(inner, -depth / 2),
    ],
    32,
  ).rotateX(Math.PI / 2);
}
export function magnetMounts(piece: Piece) {
  const mounts: {
    position: T.Vector3;
    normal: T.Vector3;
  }[] = [];
  for (let axis = 0; axis < 3; axis++) {
    if (
      piece.kind === 'corner' ? piece.home[axis] === 0 : piece.home[axis] !== 0
    )
      continue;
    for (const sign of piece.kind === 'corner'
      ? [-piece.home[axis]]
      : [-1, 1]) {
      const normal = new T.Vector3().setComponent(axis, sign);
      const position = new T.Vector3(...piece.home)
        .multiplyScalar(0.2)
        .setComponent(axis, sign * 0.457);
      mounts.push({ position, normal });
    }
  }
  return mounts;
}
export function createMechanics(materials: Materials) {
  const panel = innerPanel(true);
  const backing = new RoundedBoxGeometry(0.97, 0.97, 0.065, 3, 0.06);
  const rib = new RoundedBoxGeometry(0.07, 0.56, 0.07, 2, 0.014);
  const socket = tube(0.112, 0.084, 0.058);
  const magnet = new T.CylinderGeometry(0.081, 0.081, 0.03, 32).rotateX(
    Math.PI / 2,
  );
  const neck = tube(0.115, 0.055, 0.3);
  const triangleShape = triangle();
  const webShape = triangle();
  const hex = new T.Path();
  for (let i = 0; i <= 6; i++) {
    const angle = (-i * Math.PI) / 3;
    const x = Math.cos(angle) * 0.063,
      y = Math.sin(angle) * 0.063;
    if (i === 0) hex.moveTo(x, y);
    else hex.lineTo(x, y);
  }
  webShape.holes.push(hex);
  const triangleWeb = extrude(webShape, 0.036, 0.008);
  triangleShape.holes.push(scaledHole(triangle(), 0.72));
  const triangleRim = extrude(triangleShape, 0.065, 0.014);
  const wingGeo = extrude(wing(), 0.07, 0.016);
  const saddle = extrude(wing(), 0.042, 0.012);
  const spindle = tube(0.13, 0.06, 0.21);
  const lip = tube(0.15, 0.105, 0.04);
  const coreStalk = tube(0.068, 0.039, 0.31);
  const Z = new T.Vector3(0, 0, 1);
  return (piece: Piece, add: AddPart) => {
    const radial = new T.Vector3(...piece.home).normalize(),
      inward = radial.clone().negate();
    const chassis = new T.Group();
    chassis.name =
      piece.kind === 'corner' ? tx('legacy.m432') : tx('legacy.m433');
    chassis.userData.primary = true;
    const occupied = piece.home
      .map((sign, axis) => ({ sign, axis }))
      .filter(({ sign }) => sign);
    const missing = piece.home.indexOf(0);
    if (piece.kind === 'edge') chassis.add(edgeHousing(piece, materials));
    for (const { sign, axis } of piece.kind === 'corner' ? occupied : []) {
      const normal = new T.Vector3().setComponent(axis, sign);
      const backingMesh = new T.Mesh(backing, materials.plastic);
      backingMesh.position.copy(normal).multiplyScalar(0.375);
      backingMesh.quaternion.setFromUnitVectors(Z, normal);
      chassis.add(backingMesh);
      const other = occupied.filter((a) => a.axis !== axis);
      const u = new T.Vector3().setComponent(other[0].axis, other[0].sign);
      const v = new T.Vector3().setComponent(other[1].axis, other[1].sign);
      const face = new T.Mesh(panel, materials.body);
      if (u.clone().cross(v).dot(normal) > 0) {
        const temp = u.clone();
        u.copy(v);
        v.copy(temp);
      }
      face.quaternion.setFromRotationMatrix(
        new T.Matrix4().makeBasis(u, v, normal.clone().negate()),
      );
      face.position.copy(normal).multiplyScalar(-0.424);
      chassis.add(face);
      const brace = new T.Mesh(rib, materials.plastic);
      brace.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), radial);
      brace.position
        .copy(normal)
        .multiplyScalar(0.19)
        .addScaledVector(radial, -0.16);
      chassis.add(brace);
    }
    // Corner mouldings need trimming at the cap backs. The curved edge shell
    // already incorporates those bounds while constructing its cross-sections.
    const capPlanes = occupied.map(
      ({ sign, axis }) =>
        new T.Plane(new T.Vector3().setComponent(axis, sign), -0.4045),
    );
    if (piece.kind === 'corner')
      chassis.traverse((object) => {
        if (!(object instanceof T.Mesh)) return;
        object.updateMatrix();
        object.geometry = clipGeometry(
          object.geometry,
          capPlanes,
          object.matrix,
        );
      });
    add(chassis, new T.Vector3(), radial, 0.06);
    const stem = new T.Mesh(neck, materials.plastic);
    stem.name = tx('legacy.m434');
    stem.quaternion.setFromUnitVectors(Z, inward);
    add(stem, radial.clone().multiplyScalar(-0.59), radial, -0.13);
    const foot = new T.Group();
    if (piece.kind === 'corner') {
      foot.name = tx('legacy.m435');
      const web = new T.Mesh(triangleWeb, materials.guide);
      web.position.z = -0.035;
      foot.add(web, new T.Mesh(triangleRim, materials.guide));
      const boss = new T.Mesh(tube(0.105, 0.066, 0.065), materials.guide);
      boss.position.z = 0.004;
      foot.add(boss);
      const u = new T.Vector3(piece.home[0], -piece.home[1], 0).normalize();
      const v = inward.clone().cross(u).normalize();
      foot.quaternion.setFromRotationMatrix(
        new T.Matrix4().makeBasis(u, v, inward),
      );
    } else {
      foot.name = tx('legacy.m436');
      const base = new T.Mesh(saddle, materials.guide);
      base.scale.set(1.07, 1.16, 1);
      base.position.z = -0.13;
      const shaft = new T.Mesh(spindle, materials.guide);
      shaft.position.z = -0.015;
      const flange = new T.Mesh(wingGeo, materials.guide);
      flange.position.z = 0.1;
      const collar = new T.Mesh(lip, materials.guide);
      collar.position.z = 0.16;
      foot.add(base, shaft, flange, collar);
      const u = new T.Vector3().setComponent(missing, 1),
        v = inward.clone().cross(u).normalize();
      foot.quaternion.setFromRotationMatrix(
        new T.Matrix4().makeBasis(u, v, inward),
      );
    }
    add(
      foot,
      radial.clone().multiplyScalar(piece.kind === 'corner' ? -0.8 : -0.72),
      radial,
      -0.31,
    );
    for (const mount of magnetMounts(piece)) {
      const cup = new T.Mesh(socket, materials.socket);
      cup.name = tx('legacy.m437');
      cup.quaternion.setFromUnitVectors(Z, mount.normal);
      add(cup, mount.position, mount.normal, 0.3);
      const disk = new T.Mesh(magnet, materials.magnet);
      disk.name = tx('legacy.m438');
      disk.quaternion.copy(cup.quaternion);
      add(
        disk,
        mount.position.clone().addScaledVector(mount.normal, 0.008),
        mount.normal,
        0.5,
        true,
      );
    }
    if (piece.kind === 'corner') {
      const stalk = new T.Mesh(coreStalk, materials.plastic);
      stalk.quaternion.setFromUnitVectors(Z, inward);
      add(stalk, radial.clone().multiplyScalar(-1.01), radial, -0.36);
      const disk = new T.Mesh(magnet, materials.magnet);
      disk.quaternion.copy(stalk.quaternion);
      add(disk, radial.clone().multiplyScalar(-1.18), radial, -0.47, true);
    }
  };
}
