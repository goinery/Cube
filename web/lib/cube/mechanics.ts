import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { smoothBevels } from './geometry';
import type { Piece } from './model';

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
    bevelEnabled: true,
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

function sidePanel() {
  const s = new T.Shape();
  s.moveTo(-0.4, 0.45);
  s.lineTo(0.4, 0.45);
  s.quadraticCurveTo(0.45, 0.45, 0.45, 0.38);
  s.lineTo(0.45, -0.25);
  s.bezierCurveTo(0.45, -0.48, 0.27, -0.49, 0.12, -0.34);
  s.quadraticCurveTo(0, -0.23, -0.12, -0.34);
  s.bezierCurveTo(-0.27, -0.49, -0.45, -0.48, -0.45, -0.25);
  s.lineTo(-0.45, 0.38);
  s.quadraticCurveTo(-0.45, 0.45, -0.4, 0.45);
  return extrude(s, 0.05);
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
  const mounts: { position: T.Vector3; normal: T.Vector3 }[] = [];
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
  const panel = innerPanel(true),
    plainPanel = sidePanel();
  const backing = new RoundedBoxGeometry(0.84, 0.84, 0.045, 3, 0.018);
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
      piece.kind === 'corner' ? '角块 · 三面蜂窝壳体' : '边块 · 鞍形蜂窝壳体';
    chassis.userData.primary = true;
    const occupied = piece.home
      .map((sign, axis) => ({ sign, axis }))
      .filter(({ sign }) => sign);
    const missing = piece.home.indexOf(0);
    for (const { sign, axis } of occupied) {
      const normal = new T.Vector3().setComponent(axis, sign);
      const backingMesh = new T.Mesh(backing, materials.plastic);
      backingMesh.position.copy(normal).multiplyScalar(0.375);
      backingMesh.quaternion.setFromUnitVectors(Z, normal);
      chassis.add(backingMesh);
      const other = occupied.filter((a) => a.axis !== axis);
      const u = new T.Vector3().setComponent(other[0].axis, other[0].sign);
      const v =
        piece.kind === 'corner'
          ? new T.Vector3().setComponent(other[1].axis, other[1].sign)
          : new T.Vector3().setComponent(missing, 1);
      const face = new T.Mesh(
        piece.kind === 'corner' ? panel : plainPanel,
        materials.body,
      );
      if (piece.kind === 'corner') {
        if (u.clone().cross(v).dot(normal) > 0) {
          const temp = u.clone();
          u.copy(v);
          v.copy(temp);
        }
      } else {
        u.setComponent(other[0].axis, 0).setComponent(missing, 1);
        v.set(0, 0, 0).setComponent(other[0].axis, other[0].sign);
        if (u.clone().cross(v).dot(normal) > 0) u.negate();
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
    if (piece.kind === 'edge') {
      for (const sign of [-1, 1]) {
        const normal = new T.Vector3().setComponent(missing, sign);
        let u = new T.Vector3().setComponent(
          occupied[0].axis,
          occupied[0].sign,
        );
        let v = new T.Vector3().setComponent(
          occupied[1].axis,
          occupied[1].sign,
        );
        if (u.clone().cross(v).dot(normal) < 0) [u, v] = [v, u];
        const wall = new T.Mesh(panel, materials.body);
        wall.quaternion.setFromRotationMatrix(
          new T.Matrix4().makeBasis(u, v, normal),
        );
        wall.position.copy(normal).multiplyScalar(0.424);
        chassis.add(wall);
      }
    }
    add(chassis, new T.Vector3(), radial, 0.06);
    const stem = new T.Mesh(neck, materials.plastic);
    stem.name = '空心连接颈';
    stem.quaternion.setFromUnitVectors(Z, inward);
    add(stem, radial.clone().multiplyScalar(-0.59), radial, -0.13);

    const foot = new T.Group();
    if (piece.kind === 'corner') {
      foot.name = '角块 · 三角碟形防脱卡脚';
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
      foot.name = '边块 · 双翼导向脚与防脱槽';
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
      cup.name = '嵌入式磁铁仓';
      cup.quaternion.setFromUnitVectors(Z, mount.normal);
      add(cup, mount.position, mount.normal, 0.3);
      const disk = new T.Mesh(magnet, materials.magnet);
      disk.name = '角边配对磁铁';
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
