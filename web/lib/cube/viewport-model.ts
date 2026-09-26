import { PUZZLE_DEFAULTS } from '@/lib/puzzle-config';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { disposeMeshes } from '../rendering/resources';
import { createChassisRelief, createPlasticGrain } from '../rendering/studio';
import { createTileGeometry } from './geometry';
import { createCenterHousing, createMechanics } from './mechanics';
import { COLORS, FACE, type Piece, type Vec } from './model';
interface ComponentPart {
  object: T.Object3D;
  base: T.Vector3;
  direction: T.Vector3;
  amount: number;
  magnet?: boolean;
}
interface ModelPiece {
  root: T.Group;
  parts: ComponentPart[];
  source: Piece;
}
const v3 = (v: Vec) => new T.Vector3(...v);
function orient(normal: T.Vector3) {
  return new T.Quaternion().setFromUnitVectors(
    new T.Vector3(0, 1, 0),
    normal.clone().normalize(),
  );
}
export function createCubeModel(pieces: Piece[], anisotropy: number) {
  const modelRoot = new T.Group();
  const grain = createPlasticGrain(anisotropy);
  const plastic = new T.MeshPhysicalMaterial({
    color: '#101114',
    roughness: 0.46,
    metalness: 0,
    ior: 1.48,
    clearcoat: 0.06,
    clearcoatRoughness: 0.35,
    bumpMap: grain,
    bumpScale: 0.0008,
    roughnessMap: grain,
  });
  const railMaterial = new T.MeshStandardMaterial({
    color: '#e3e9df',
    roughness: 0.26,
    metalness: 0,
  });
  const darkMetal = new T.MeshStandardMaterial({
    color: '#69747b',
    roughness: 0.28,
    metalness: 1,
  });
  const magnetMaterial = new T.MeshStandardMaterial({
    color: '#bfc6cc',
    roughness: 0.2,
    metalness: 1,
  });
  const accentMaterial = new T.MeshStandardMaterial({
    color: '#a7b597',
    roughness: 0.29,
    metalness: 0.75,
  });
  const sleeveMaterial = new T.MeshPhysicalMaterial({
    color: '#626d73',
    roughness: 0.4,
    metalness: 0,
    ior: 1.48,
  });
  const core = new T.Group();
  modelRoot.add(core);
  const hub = new T.Mesh(new T.IcosahedronGeometry(0.38, 2), plastic);
  core.add(hub);
  const axisGeometry = new T.CylinderGeometry(0.064, 0.064, 1.16, 24);
  Object.values(FACE).forEach((f) => {
    const axis = new T.Mesh(axisGeometry, darkMetal);
    axis.position.copy(v3(f.n).multiplyScalar(0.64));
    axis.quaternion.copy(orient(v3(f.n)));
    core.add(axis);
    const collar = new T.Mesh(
      new T.TorusGeometry(0.125, 0.045, 8, 32),
      accentMaterial,
    );
    collar.position.copy(v3(f.n).multiplyScalar(0.3));
    collar.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), v3(f.n));
    core.add(collar);
  });
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1]) {
        const direction = new T.Vector3(x, y, z).normalize(),
          socket = new T.Mesh(
            new T.CylinderGeometry(0.1, 0.12, 0.1, 20),
            plastic,
          ),
          magnet = new T.Mesh(
            new T.CylinderGeometry(0.074, 0.074, 0.06, 20),
            magnetMaterial,
          );
        socket.position.copy(direction.clone().multiplyScalar(0.37));
        socket.quaternion.copy(orient(direction));
        core.add(socket);
        magnet.position.copy(direction.clone().multiplyScalar(0.435));
        magnet.quaternion.copy(orient(direction));
        magnet.userData.magnet = true;
        core.add(magnet);
      }
  core.children.forEach((object) => {
    object.userData.base = object.position.clone();
  });
  const models = new Map<string, ModelPiece>(),
    stickers = new Map<string, T.Mesh>(),
    hitMeshes: T.Mesh[] = [];
  const clipMaterials = new Map<string, T.MeshPhysicalMaterial>();
  const shellGeometries = new Map<string, T.BufferGeometry>();
  const relief = createChassisRelief(anisotropy);
  const chassisMaterial = plastic.clone();
  chassisMaterial.color.set('#ffffff');
  chassisMaterial.roughness = 0.42;
  chassisMaterial.bumpMap = relief;
  chassisMaterial.map = relief;
  chassisMaterial.bumpScale = -0.012;
  const buildMechanics = createMechanics({
    body: chassisMaterial,
    plastic,
    guide: railMaterial,
    magnet: magnetMaterial,
    socket: sleeveMaterial,
  });
  const clipGeo = new RoundedBoxGeometry(0.065, 0.055, 0.14, 2, 0.012);
  for (const p of pieces) {
    const root = new T.Group(),
      parts: ComponentPart[] = [];
    modelRoot.add(root);
    const radial = v3(p.home).normalize();
    function part(
      object: T.Object3D,
      pos: T.Vector3,
      direction: T.Vector3,
      amount: number,
      magnet = false,
    ) {
      object.position.copy(pos);
      root.add(object);
      parts.push({
        object,
        base: pos.clone(),
        direction: direction.clone(),
        amount,
        magnet,
      });
      object.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (!o.userData.sticker)
            o.userData = {
              ...o.userData,
              piece: p.id,
              sticker: p.stickers[0].id,
              component: true,
            };
          hitMeshes.push(o);
        }
      });
      return object;
    }
    if (p.kind !== 'center') {
      buildMechanics(p, part);
    } else {
      part(
        createCenterHousing(p, chassisMaterial, plastic),
        new T.Vector3(),
        radial,
        0.45,
      );
      const carriage = new T.Mesh(
        new T.LatheGeometry(
          [
            new T.Vector2(0.175, -0.13),
            new T.Vector2(0.26, -0.13),
            new T.Vector2(0.34, 0.13),
            new T.Vector2(0.175, 0.13),
            new T.Vector2(0.175, -0.13),
          ],
          40,
        ),
        plastic,
      );
      carriage.userData.primary = true;
      carriage.quaternion.copy(orient(radial));
      part(carriage, radial.clone().multiplyScalar(-0.13), radial, 0.12);
      const stem = new T.Mesh(
        new T.LatheGeometry(
          [
            new T.Vector2(0.09, -0.325),
            new T.Vector2(0.13, -0.325),
            new T.Vector2(0.105, 0.325),
            new T.Vector2(0.09, 0.325),
            new T.Vector2(0.09, -0.325),
          ],
          32,
        ),
        railMaterial,
      );
      stem.quaternion.copy(orient(radial));
      part(stem, radial.clone().multiplyScalar(-0.43), radial, -0.19);
      const springPoints = Array.from(
        { length: 129 },
        (_, i) =>
          new T.Vector3(
            0.155 * Math.cos((i / 128) * Math.PI * 14),
            (i / 128) * 0.4 - 0.2,
            0.155 * Math.sin((i / 128) * Math.PI * 14),
          ),
      );
      const spring = new T.Mesh(
        new T.TubeGeometry(
          new T.CatmullRomCurve3(springPoints),
          128,
          0.018,
          6,
          false,
        ),
        magnetMaterial,
      );
      spring.quaternion.copy(orient(radial));
      part(spring, radial.clone().multiplyScalar(-0.27), radial, 0.13);
      for (const offset of [-0.485, -0.055]) {
        const washer = new T.Mesh(
          new T.LatheGeometry(
            [
              new T.Vector2(0.13, -0.015),
              new T.Vector2(0.205, -0.015),
              new T.Vector2(0.205, 0.015),
              new T.Vector2(0.13, 0.015),
              new T.Vector2(0.13, -0.015),
            ],
            32,
          ),
          darkMetal,
        );
        washer.quaternion.copy(orient(radial));
        part(
          washer,
          radial.clone().multiplyScalar(offset),
          radial,
          offset < -0.2 ? -0.08 : 0.24,
        );
      }
      const dial = new T.Group();
      const disk = new T.Mesh(
        new T.CylinderGeometry(0.27, 0.27, 0.07, 40),
        accentMaterial,
      );
      dial.add(disk);
      for (let i = 0; i < 12; i++) {
        const ridge = new T.Mesh(new T.BoxGeometry(0.04, 0.09, 0.035), plastic);
        ridge.position.set(
          Math.cos((i * Math.PI) / 6) * 0.26,
          0,
          Math.sin((i * Math.PI) / 6) * 0.26,
        );
        ridge.rotation.y = (-i * Math.PI) / 6;
        dial.add(ridge);
      }
      dial.quaternion.copy(orient(radial));
      part(dial, radial.clone().multiplyScalar(0.13), radial, 0.43);
      const screw = new T.Mesh(
        new T.CylinderGeometry(0.067, 0.067, 0.075, 6),
        magnetMaterial,
      );
      screw.quaternion.copy(orient(radial));
      part(screw, radial.clone().multiplyScalar(0.22), radial, 0.62);
    }
    for (const s of p.stickers) {
      const f = FACE[s.face],
        normal = v3(f.n);
      const material = new T.MeshPhysicalMaterial({
        color: COLORS[s.face],
        roughness: PUZZLE_DEFAULTS['cube'].settings.roughness,
        metalness: 0,
        ior: 1.48,
        specularIntensity: 0.75,
        clearcoat: 0.2,
        clearcoatRoughness: 0.13,
        vertexColors: true,
        bumpMap: grain,
        bumpScale: 0.00022,
        roughnessMap: grain,
      });
      const shapeKey = `${s.row},${s.col}`;
      if (!shellGeometries.has(shapeKey))
        shellGeometries.set(shapeKey, createTileGeometry(s));
      const shell = new T.Mesh(shellGeometries.get(shapeKey)!, material);
      shell.quaternion.setFromRotationMatrix(
        new T.Matrix4().makeBasis(v3(f.r), v3(f.u), normal),
      );
      shell.userData = { sticker: s.id, piece: p.id, face: s.face };
      part(
        shell,
        normal.clone().multiplyScalar(0.455),
        normal,
        p.kind === 'center' ? 0.95 : 0.65,
      );
      stickers.set(s.id, shell);
      if (p.kind !== 'center') {
        const clips = new T.Group();
        const clipMaterial = material.clone();
        clipMaterial.vertexColors = false;
        clipMaterials.set(s.id, clipMaterial);
        for (const x of [-0.29, 0.29]) {
          const clip = new T.Mesh(clipGeo, clipMaterial);
          clip.position.set(x, 0.22, 0);
          clips.add(clip);
        }
        clips.quaternion.copy(shell.quaternion);
        part(clips, normal.clone().multiplyScalar(0.33), normal, 0.65);
      }
    }
    models.set(p.id, { root, parts, source: p });
  }
  return {
    root: modelRoot,
    core,
    models,
    stickers,
    hitMeshes,
    clipMaterials,
    dispose() {
      disposeMeshes(modelRoot);
      grain.dispose();
      relief.dispose();
    },
  };
}
