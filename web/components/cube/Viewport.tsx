'use client';
import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  FACE,
  COLORS,
  FACES,
  moveSpec,
  type Vec,
  type Piece,
  type Face,
} from '@/lib/cube/model';
import {
  getState,
  patch,
  subscribe,
  setAnimator,
  finishLayerTurn,
  allowMoves,
  selectSticker,
  cameraActions,
  notify,
  pause,
} from '@/lib/cube/store';
import { paintSticker } from '@/lib/cube/appearance';
import {
  fitDistance,
  magneticTarget,
  heldAngle,
  layerFace,
  stepMagnet,
} from '@/lib/cube/interaction';
import { createTileGeometry, smoothBevels } from '@/lib/cube/geometry';
import { projectionTransform, facesProjection } from '@/lib/cube/projection';
import { createPlasticGrain, StudioEnvironment } from '@/lib/cube/studio';

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
function basisQuaternion(p: Piece) {
  return new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(v3(p.basis[0]), v3(p.basis[1]), v3(p.basis[2])),
  );
}

export default function Viewport() {
  const host = useRef<HTMLDivElement>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const el = host.current!;
    let disposed = false,
      frame = 0;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      queueMicrotask(() =>
        setError(
          '无法启动 3D 视图。请启用浏览器硬件加速，或使用支持 WebGL 2 的浏览器。',
        ),
      );
      return;
    }
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
    renderer.setClearColor(0, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.domElement.setAttribute(
      'aria-label',
      '交互式 3D 魔方：拖动表面转层，拖动空白旋转视角',
    );
    el.appendChild(renderer.domElement);
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(36, 1, 0.005, 200);
    camera.position.set(6, 4.8, 7.5);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.085;
    controls.enablePan = false;
    controls.minDistance = 0.08;
    controls.maxDistance = 100;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.7;
    controls.touches.ONE = T.TOUCH.ROTATE;
    controls.touches.TWO = T.TOUCH.DOLLY_ROTATE;
    const environment = new StudioEnvironment();
    const pmrem = new T.PMREMGenerator(renderer),
      env = pmrem.fromScene(environment, 0.035);
    scene.environment = env.texture;
    scene.environmentIntensity = 0.85;
    environment.dispose();
    pmrem.dispose();
    scene.add(new T.HemisphereLight(0xeaf0ff, 0x20242a, 0.85));
    const key = new T.DirectionalLight(0xfff3e6, 2.8);
    key.position.set(-3, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    key.shadow.normalBias = 0.008;
    key.shadow.bias = -0.00008;
    key.shadow.radius = 2.5;
    scene.add(key, key.target);
    const rim = new T.DirectionalLight(0xd6e5ff, 1.15);
    rim.position.set(4, 3, -5);
    scene.add(rim);
    const fill = new T.DirectionalLight(0xffffff, 0.55);
    fill.position.set(-5, 0, 1);
    scene.add(fill);
    const ground = new T.Mesh(
      new T.PlaneGeometry(100, 100),
      new T.ShadowMaterial({
        color: '#101720',
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.65;
    ground.receiveShadow = true;
    scene.add(ground);
    const grain = createPlasticGrain(renderer.capabilities.getMaxAnisotropy());
    const plastic = new T.MeshPhysicalMaterial({
      color: '#151c23',
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
      color: '#c0c8c5',
      roughness: 0.43,
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
      transparent: true,
      opacity: 0.9,
    });
    const core = new T.Group();
    scene.add(core);
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
      hitMeshes: T.Mesh[] = [],
      textures = new Map<string, T.CanvasTexture>();
    const shellGeometries = new Map<string, T.BufferGeometry>();
    const frameShape = new T.Shape();
    frameShape.moveTo(-0.43, -0.43);
    frameShape.lineTo(0.43, -0.43);
    frameShape.lineTo(0.43, 0.43);
    frameShape.lineTo(-0.43, 0.43);
    frameShape.closePath();
    const frameHole = new T.Path();
    frameHole.moveTo(-0.29, -0.29);
    frameHole.lineTo(-0.29, 0.29);
    frameHole.lineTo(0.29, 0.29);
    frameHole.lineTo(0.29, -0.29);
    frameHole.closePath();
    frameShape.holes.push(frameHole);
    const cageFrame = smoothBevels(
      new T.ExtrudeGeometry(frameShape, {
        depth: 0.055,
        bevelEnabled: true,
        bevelThickness: 0.014,
        bevelSize: 0.014,
        bevelSegments: 3,
        steps: 1,
      }),
    );
    cageFrame.center();
    const jointGeo = new T.SphereGeometry(0.12, 16, 12),
      magnetGeo = new T.CylinderGeometry(0.072, 0.072, 0.026, 20),
      housingGeo = new T.CylinderGeometry(0.1, 0.11, 0.07, 20);
    for (const p of getState().cube) {
      const root = new T.Group(),
        parts: ComponentPart[] = [];
      scene.add(root);
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
      // Distinct load-bearing chassis: trihedral corner, elongated edge, circular center carriage.
      if (p.kind !== 'center') {
        const chassis = new T.Group();
        for (const sticker of p.stickers) {
          const f = FACE[sticker.face],
            frame = new T.Mesh(cageFrame, plastic);
          frame.quaternion.setFromRotationMatrix(
            new T.Matrix4().makeBasis(v3(f.r), v3(f.u), v3(f.n)),
          );
          frame.position.copy(v3(f.n).multiplyScalar(0.32));
          chassis.add(frame);
          const a = v3(f.n).multiplyScalar(0.26),
            b = radial.clone().multiplyScalar(-0.33),
            rib = new T.Mesh(
              new T.CylinderGeometry(0.055, 0.072, a.distanceTo(b), 12),
              plastic,
            );
          rib.position.copy(a.clone().add(b).multiplyScalar(0.5));
          rib.quaternion.copy(orient(a.clone().sub(b)));
          chassis.add(rib);
        }
        const spine = new T.Mesh(
          p.kind === 'corner'
            ? new T.IcosahedronGeometry(0.22, 1)
            : new RoundedBoxGeometry(0.39, 0.25, 0.32, 3, 0.055),
          plastic,
        );
        spine.position.copy(radial.clone().multiplyScalar(-0.18));
        spine.quaternion.copy(orient(radial));
        chassis.add(spine);
        chassis.userData.primary = true;
        part(chassis, radial.clone().multiplyScalar(-0.045), radial, 0.08);
        const neck = new T.Mesh(
          new T.CylinderGeometry(
            p.kind === 'corner' ? 0.13 : 0.2,
            0.105,
            0.4,
            20,
          ),
          plastic,
        );
        neck.quaternion.copy(orient(radial));
        part(neck, radial.clone().multiplyScalar(-0.48), radial, -0.12);
        const foot = new T.Mesh(
          p.kind === 'corner'
            ? new T.SphereGeometry(
                0.22,
                20,
                12,
                0,
                Math.PI * 2,
                0,
                Math.PI * 0.72,
              )
            : new RoundedBoxGeometry(0.47, 0.17, 0.31, 3, 0.08),
          railMaterial,
        );
        foot.quaternion.copy(orient(radial));
        part(foot, radial.clone().multiplyScalar(-0.67), radial, -0.32);
        const track = new T.Mesh(
          new T.TorusGeometry(
            p.kind === 'corner' ? 0.18 : 0.235,
            0.033,
            8,
            24,
            Math.PI * 1.5,
          ),
          darkMetal,
        );
        track.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), radial);
        part(track, radial.clone().multiplyScalar(-0.61), radial, -0.22);
      } else {
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
          const ridge = new T.Mesh(
            new T.BoxGeometry(0.04, 0.09, 0.035),
            plastic,
          );
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
          roughness: 0.3,
          metalness: 0,
          ior: 1.48,
          specularIntensity: 0.9,
          clearcoat: 0.22,
          clearcoatRoughness: 0.23,
          vertexColors: true,
          bumpMap: grain,
          bumpScale: 0.0012,
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
        // Inner shell bosses establish a physical attachment to the skeleton.
        if (p.kind !== 'center') {
          const boss = new T.Mesh(jointGeo, plastic);
          part(boss, normal.clone().multiplyScalar(0.27), normal, 0.4);
        }
      }
      if (p.kind !== 'center') {
        // Magnets live at shared corner-edge interfaces, in separate retaining cups.
        for (let axis = 0; axis < 3; axis++)
          if (p.kind === 'corner' ? p.home[axis] !== 0 : p.home[axis] === 0) {
            const signs = p.kind === 'corner' ? [-p.home[axis]] : [-1, 1];
            for (const sign of signs) {
              const dir = new T.Vector3().setComponent(axis, sign),
                loc = dir
                  .clone()
                  .multiplyScalar(0.468)
                  .add(radial.clone().multiplyScalar(0.02));
              const cup = new T.Mesh(housingGeo, sleeveMaterial);
              cup.quaternion.copy(orient(dir));
              part(cup, loc, dir, 0.3);
              const magnet = new T.Mesh(magnetGeo, magnetMaterial);
              magnet.quaternion.copy(orient(dir));
              part(
                magnet,
                loc.clone().addScaledVector(dir, 0.018),
                dir,
                0.53,
                true,
              );
            }
          }
        if (p.kind === 'corner') {
          const magnet = new T.Mesh(magnetGeo, magnetMaterial);
          magnet.quaternion.copy(orient(radial));
          const stalk = new T.Mesh(
            new T.CylinderGeometry(0.065, 0.105, 0.46, 18),
            plastic,
          );
          stalk.quaternion.copy(orient(radial));
          part(stalk, radial.clone().multiplyScalar(-0.97), radial, -0.36);
          part(
            magnet,
            radial.clone().multiplyScalar(-1.23),
            radial,
            -0.47,
            true,
          );
        }
      }
      models.set(p.id, { root, parts, source: p });
    }
    let lastArt = -1,
      currentExplode = getState().settings.explode,
      targetCamera: T.Vector3 | null = null,
      targetLookAt: T.Vector3 | null = null,
      animation: {
        token: string;
        axis: number;
        layers: number[];
        from: number;
        to: number;
        magnetic?: boolean;
        angle?: number;
        velocity?: number;
        start: number;
        duration: number;
        resolve: () => void;
      } | null = null;
    interface Drag {
      face: string;
      axis: number;
      layers: number[];
      angle: number;
      initialAngle: number;
      sx: number;
      sy: number;
      pixelsPerRadian: number;
      velocity: number;
      time: number;
    }
    let drag: Drag | null = null;
    // Separate depth pass keeps the underside mapping above the ground shadow,
    // while preserving depth between its own independently moving tiles.
    const mappingScene = new T.Scene();
    const ghostMaterials = new Map<string, T.MeshBasicMaterial>();
    for (const [id] of stickers)
      ghostMaterials.set(
        id,
        new T.MeshBasicMaterial({
          side: T.DoubleSide,
          transparent: true,
          opacity: 0.92,
        }),
      );
    const ghostFaces = new Map<
      Face,
      { mesh: T.Group; tiles: Map<string, T.Mesh> }
    >();
    for (const face of FACES) {
      const mesh = new T.Group(),
        tiles = new Map<string, T.Mesh>();
      mesh.visible = false;
      mappingScene.add(mesh);
      for (const [id, source] of stickers) {
        const tile = new T.Mesh(source.geometry, ghostMaterials.get(id));
        tile.matrixAutoUpdate = false;
        tile.userData = { ...source.userData, mapping: true, face };
        mesh.add(tile);
        tiles.set(id, tile);
        hitMeshes.push(tile);
      }
      ghostFaces.set(face, { mesh, tiles });
    }
    async function updateArt() {
      const s = getState(),
        version = s.artVersion;
      lastArt = version;
      await Promise.all(
        [...stickers].map(async ([id, mesh]) => {
          const canvas = document.createElement('canvas');
          await paintSticker(canvas, id, s.appearance);
          if (disposed || getState().artVersion !== version) return;
          const material = mesh.material as T.MeshPhysicalMaterial;
          const art = s.appearance.stickers[id];
          textures.get(id)?.dispose();
          if (
            art.group ||
            art.image ||
            (id === 'U4' && art.color === COLORS.U)
          ) {
            const tex = new T.CanvasTexture(canvas);
            tex.colorSpace = T.SRGBColorSpace;
            tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
            material.map = tex;
            material.color.set('#ffffff');
            textures.set(id, tex);
          } else {
            material.map = null;
            material.color.set(material.map ? '#ffffff' : art.color);
            textures.delete(id);
          }
          const ghost = ghostMaterials.get(id)!;
          ghost.map = material.map;
          ghost.color.copy(material.color);
          ghost.needsUpdate = true;
          material.needsUpdate = true;
        }),
      );
    }
    const outlineMaterial = new T.MeshBasicMaterial({
      color: '#d5e6ae',
      side: T.BackSide,
      transparent: true,
      opacity: 0.88,
    });
    const selectedOutlines = new Map<string, T.Mesh>();
    for (const [id, mesh] of stickers) {
      const outline = new T.Mesh(mesh.geometry, outlineMaterial);
      outline.userData.ignoreBounds = true;
      outline.scale.set(1.07, 1.07, 1.08);
      outline.visible = false;
      mesh.add(outline);
      selectedOutlines.set(id, outline);
    }
    const unsub = subscribe(() => {
      const s = getState();
      if (s.artVersion !== lastArt) void updateArt();
      for (const [id, o] of selectedOutlines)
        o.visible = s.selected.includes(id);
    });
    setAnimator(
      (token, duration) =>
        new Promise((resolve) => {
          const spec = moveSpec(token);
          animation = {
            token,
            axis: spec.axis,
            layers: spec.layers,
            from: 0,
            to: (spec.turns * Math.PI) / 2,
            start: performance.now(),
            duration,
            resolve,
          };
        }),
    );
    function layoutPieces(explode: number) {
      const s = getState(),
        inner = Math.max(0, explode - 1) * s.settings.internal;
      for (const p of s.cube) {
        const m = models.get(p.id)!;
        m.root.position.copy(
          v3(p.pos).multiplyScalar(1 + s.settings.gap + explode * 0.72),
        );
        m.root.quaternion.copy(basisQuaternion(p));
        m.root.scale.setScalar(s.settings.size);
        for (const part of m.parts) {
          part.object.position
            .copy(part.base)
            .addScaledVector(part.direction, inner * part.amount);
          part.object.visible = !part.magnet || s.settings.showMagnets;
        }
        for (const sticker of p.stickers) {
          const mesh = stickers.get(sticker.id)!;
          mesh.position.addScaledVector(
            v3(FACE[sticker.face].n),
            s.settings.stickerOffset,
          );
          const material = mesh.material as T.MeshPhysicalMaterial;
          material.roughness = s.settings.roughness;
          material.clearcoatRoughness = 0.16 + s.settings.roughness * 0.25;
        }
        if (s.partialTurns) {
          const axis = s.partialTurns.axis;
          const q = new T.Quaternion().setFromAxisAngle(
            new T.Vector3().setComponent(axis, 1),
            heldAngle(s.partialTurns, axis, p.pos[axis]),
          );
          m.root.position.applyQuaternion(q);
          m.root.quaternion.premultiply(q);
        }
      }
    }
    function boundsOf(objects: T.Object3D[]) {
      const box = new T.Box3();
      for (const object of objects) {
        object.updateWorldMatrix(true, true);
        object.traverse((child) => {
          if (child instanceof T.Mesh && !child.userData.ignoreBounds) {
            if (!child.geometry.boundingBox)
              child.geometry.computeBoundingBox();
            box.union(
              child.geometry
                .boundingBox!.clone()
                .applyMatrix4(child.matrixWorld),
            );
          }
        });
      }
      return box;
    }
    function moveCameraToFit(direction: T.Vector3, objects?: T.Object3D[]) {
      if (getState().solving) return;
      layoutPieces(getState().settings.explode);
      const box = boundsOf(objects || [...models.values()].map((m) => m.root)),
        target = box.getCenter(new T.Vector3()),
        distance = fitDistance(
          camera,
          box,
          direction,
          target,
          objects?.length === 1 ? 0.9 : 0.75,
        );
      targetLookAt = target;
      targetCamera = target
        .clone()
        .addScaledVector(direction.clone().normalize(), distance);
    }
    cameraActions.fit = () => {
      moveCameraToFit(camera.position.clone().sub(controls.target));
    };
    cameraActions.reset = () => {
      if (getState().solving) return;
      camera.up.set(0, 1, 0);
      moveCameraToFit(new T.Vector3(6, 4.8, 7.5));
    };
    cameraActions.face = (face) => {
      if (getState().solving) return;
      camera.up.copy(v3(FACE[face].u));
      moveCameraToFit(
        v3(FACE[face].n).addScaledVector(v3(FACE[face].u), 0.0001),
      );
    };
    cameraActions.focus = () => {
      const id = getState().selected[0],
        mesh = id ? stickers.get(id) : undefined;
      if (!mesh) {
        notify('先点击一个贴片，再进入部件特写；也可以直接双击部件。');
        return;
      }
      moveCameraToFit(camera.position.clone().sub(controls.target), [mesh]);
    };
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    cameraActions.reset();
    if (targetCamera) {
      camera.position.copy(targetCamera);
      controls.target.copy(targetLookAt!);
      targetCamera = null;
      targetLookAt = null;
      controls.update();
    }
    const raycaster = new T.Raycaster(),
      pointer = new T.Vector2();
    let down: {
      x: number;
      y: number;
      id: number;
      hit?: T.Intersection<T.Object3D>;
      orbit: boolean;
    } | null = null;
    const activePointers = new Map<number, { x: number; y: number }>();
    let pinch: { distance: number; x: number; y: number } | null = null;
    function pinchState() {
      const [a, b] = [...activePointers.values()];
      return {
        distance: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
      };
    }
    function hitAt(e: PointerEvent) {
      const rect = el.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const visible = hitMeshes.filter((m) => m.visible && m.parent?.visible);
      return (
        raycaster.intersectObjects(
          visible.filter((m) => m.userData.mapping),
          false,
        )[0] ??
        raycaster.intersectObjects(
          visible.filter((m) => !m.userData.mapping),
          false,
        )[0]
      );
    }
    function settleLayer(
      axis: number,
      layer: number,
      from: number,
      velocity = 0,
    ) {
      const face = layerFace(axis, layer),
        to = magneticTarget(from, velocity / 1000);
      patch({ busy: true, dragging: true, currentMove: face + ' · 磁力归位' });
      animation = {
        token: face,
        axis,
        layers: [layer],
        from,
        to,
        angle: from,
        velocity,
        magnetic: true,
        start: performance.now(),
        duration: 0,
        resolve: () => finishLayerTurn(axis, layer, to),
      };
    }
    function finishDrag(cancelled = false) {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (cancelled || getState().settings.magnetStrength === 0)
        finishLayerTurn(d.axis, d.layers[0], d.angle);
      else settleLayer(d.axis, d.layers[0], d.angle, d.velocity * 1000);
    }
    function onDown(e: PointerEvent) {
      if (getState().solving) {
        e.stopImmediatePropagation();
        return;
      }
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size > 1) {
        finishDrag(true);
        down = null;
        controls.enabled = false;
        pinch = pinchState();
        renderer.domElement.setPointerCapture(e.pointerId);
        e.stopImmediatePropagation();
        return;
      }
      const s = getState(),
        hit = hitAt(e),
        orbit =
          !hit ||
          Boolean(hit.object.userData.component) ||
          ['camera', 'explode'].includes(s.mode) ||
          e.button !== 0;
      if (s.busy && !orbit) {
        e.stopImmediatePropagation();
        return;
      }
      controls.enabled = orbit;
      if (orbit) camera.up.set(0, 1, 0);
      down = { x: e.clientX, y: e.clientY, id: e.pointerId, hit, orbit };
      if (!orbit) {
        renderer.domElement.setPointerCapture(e.pointerId);
        e.stopImmediatePropagation();
      }
      targetCamera = null;
      targetLookAt = null;
    }
    function onMove(e: PointerEvent) {
      if (getState().solving) {
        e.stopImmediatePropagation();
        return;
      }
      if (activePointers.has(e.pointerId))
        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (activePointers.size > 1 && pinch) {
        const next = pinchState(),
          spherical = new T.Spherical().setFromVector3(
            camera.position.clone().sub(controls.target),
          );
        spherical.radius = T.MathUtils.clamp(
          (spherical.radius * pinch.distance) / next.distance,
          controls.minDistance,
          controls.maxDistance,
        );
        spherical.theta -= (next.x - pinch.x) * 0.005;
        spherical.phi = T.MathUtils.clamp(
          spherical.phi - (next.y - pinch.y) * 0.005,
          0.025,
          Math.PI - 0.025,
        );
        camera.up.set(0, 1, 0);
        camera.position.setFromSpherical(spherical).add(controls.target);
        pinch = next;
        targetCamera = null;
        targetLookAt = null;
        e.stopImmediatePropagation();
        return;
      }
      if (!down || down.orbit || down.id !== e.pointerId) return;
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y,
        s = getState();
      if (
        s.mode === 'customize' ||
        s.mode === 'inspect' ||
        down.hit?.object.userData.mapping
      )
        return;
      if (!drag) {
        if (Math.hypot(dx, dy) < 5 || s.busy) return;
        const hit = down.hit!,
          piece = s.cube.find((p) => p.id === hit.object.userData.piece)!;
        const normal = new T.Vector3(0, 0, 1)
          .applyQuaternion(hit.object.getWorldQuaternion(new T.Quaternion()))
          .toArray() as Vec;
        let best: {
          score: number;
          face: string;
          axis: number;
          sx: number;
          sy: number;
          pixels: number;
        } | null = null;
        for (let axis = 0; axis < 3; axis++)
          if (Math.abs(normal[axis]) < 0.97) {
            const axial = new T.Vector3().setComponent(axis, 1),
              tangent = axial.clone().cross(hit.point),
              pa = hit.point.clone().project(camera),
              pb = hit.point
                .clone()
                .addScaledVector(tangent, 0.01)
                .project(camera);
            const sx = ((pb.x - pa.x) * el.clientWidth) / 2 / 0.01,
              sy = (-(pb.y - pa.y) * el.clientHeight) / 2 / 0.01,
              pixels = Math.hypot(sx, sy);
            if (pixels < 1) continue;
            const score = Math.abs(dx * sx + dy * sy) / pixels,
              layer = piece.pos[axis],
              face =
                axis === 0
                  ? layer === 1
                    ? 'R'
                    : layer === -1
                      ? 'L'
                      : 'M'
                  : axis === 1
                    ? layer === 1
                      ? 'U'
                      : layer === -1
                        ? 'D'
                        : 'E'
                    : layer === 1
                      ? 'F'
                      : layer === -1
                        ? 'B'
                        : 'S';
            if (!best || score > best.score)
              best = {
                score,
                face,
                axis,
                sx: sx / pixels,
                sy: sy / pixels,
                pixels,
              };
          }
        if (!best) return;
        if (!allowMoves([best.face])) {
          down = null;
          return;
        }
        const spec = moveSpec(best.face);
        const initialAngle = heldAngle(
          s.partialTurns,
          best.axis,
          spec.layers[0],
        );
        drag = {
          face: best.face,
          axis: best.axis,
          layers: spec.layers,
          angle: initialAngle,
          initialAngle,
          sx: best.sx,
          sy: best.sy,
          pixelsPerRadian: Math.max(30, best.pixels),
          velocity: 0,
          time: performance.now(),
        };
        pause();
        patch({
          player: null,
          busy: true,
          dragging: true,
          currentMove: best.face + ' · 拖动',
        });
      }
      const now = performance.now(),
        angle = T.MathUtils.clamp(
          drag.initialAngle +
            (dx * drag.sx + dy * drag.sy) / drag.pixelsPerRadian,
          -Math.PI * 2,
          Math.PI * 2,
        );
      drag.velocity =
        drag.velocity * 0.45 +
        ((angle - drag.angle) / Math.max(8, now - drag.time)) * 0.55;
      drag.time = now;
      drag.angle = angle;
      e.stopImmediatePropagation();
    }
    function onUp(e: PointerEvent) {
      activePointers.delete(e.pointerId);
      if (drag && down?.id === e.pointerId) {
        if (performance.now() - drag.time > 90) drag.velocity = 0;
        finishDrag();
      } else if (
        down &&
        !down.orbit &&
        Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 &&
        down.hit &&
        !getState().solving
      ) {
        const s = getState(),
          id = down.hit.object.userData.sticker;
        selectSticker(id, s.mode === 'customize');
        if (s.mode === 'inspect') {
          const p = s.cube.find(
            (p) => p.id === down!.hit!.object.userData.piece,
          )!;
          notify(
            `${p.kind === 'corner' ? '角块' : p.kind === 'edge' ? '棱块' : '中心块'} · ${id} · 当前坐标 ${p.pos.join(' / ')}`,
          );
        }
      }
      down = null;
      pinch = null;
      controls.enabled = !getState().solving;
    }
    const cancel = () => {
      finishDrag(true);
      down = null;
      pinch = null;
      activePointers.clear();
      controls.enabled = !getState().solving;
    };
    const doubleClick = (e: MouseEvent) => {
      if (getState().solving || getState().busy) return;
      const hit = hitAt(e as PointerEvent);
      if (hit) {
        selectSticker(hit.object.userData.sticker, false);
        moveCameraToFit(camera.position.clone().sub(controls.target), [
          hit.object,
        ]);
      }
    };
    renderer.domElement.addEventListener('dblclick', doubleClick);
    renderer.domElement.addEventListener('pointerdown', onDown, true);
    renderer.domElement.addEventListener('pointermove', onMove, true);
    renderer.domElement.addEventListener('pointerup', onUp, true);
    renderer.domElement.addEventListener('pointercancel', cancel, true);
    let last = performance.now(),
      visibilityAt = 0,
      lastQuality = '';
    const surfaceBounds = new T.Box3(),
      capBounds = new T.Box3();
    const surfaceSize = new T.Vector3(),
      surfaceCenter = new T.Vector3();
    const keyDirection = key.position.clone().normalize();
    function render(now: number) {
      if (disposed) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const s = getState();
      if (
        !animation &&
        !drag &&
        !down &&
        !pinch &&
        !s.busy &&
        !s.solving &&
        s.settings.magnetStrength > 0 &&
        s.partialTurns
      ) {
        const index = s.partialTurns.angles.findIndex((angle) => angle !== 0);
        if (index >= 0)
          settleLayer(
            s.partialTurns.axis,
            index - 1,
            s.partialTurns.angles[index],
          );
      }
      currentExplode = T.MathUtils.damp(
        currentExplode,
        s.settings.explode,
        9,
        dt,
      );
      const inner = Math.max(0, currentExplode - 1) * s.settings.internal;
      layoutPieces(currentExplode);
      core.visible = true;
      core.children.forEach((object) => {
        const base = object.userData.base as T.Vector3;
        object.position.copy(base).multiplyScalar(1 + inner * 0.28);
        if (object.userData.magnet) object.visible = s.settings.showMagnets;
      });
      if (animation || drag) {
        const a = animation;
        let angle = drag?.angle || 0,
          axis = drag?.axis || 0,
          layers = drag?.layers || [];
        if (a) {
          axis = a.axis;
          layers = a.layers;
          if (a.magnetic) {
            const next = stepMagnet(
              a.angle!,
              a.velocity!,
              a.to,
              dt,
              s.settings.magnetStrength,
              s.settings.magnetDamping,
            );
            a.angle = angle = next.angle;
            a.velocity = next.velocity;
            if (s.settings.magnetStrength === 0) {
              animation = null;
              finishLayerTurn(axis, layers[0], angle);
            } else if (
              Math.abs(angle - a.to) < 0.0001 &&
              Math.abs(a.velocity) < 0.003
            ) {
              angle = a.to;
              animation = null;
              a.resolve();
            }
          } else {
            const raw = Math.min(1, (now - a.start) / a.duration);
            let t = raw;
            if (s.settings.easing === 'smooth') t = raw * raw * (3 - 2 * raw);
            else if (s.settings.easing === 'magnetic')
              t = 1 - Math.pow(1 - raw, 3);
            angle = a.from + (a.to - a.from) * t;
            if (raw === 1) {
              animation = null;
              a.resolve();
            }
          }
        }
        // Drag/spring angles already include the held offset; programmed moves are relative.
        if (drag || a?.magnetic)
          angle -= heldAngle(s.partialTurns, axis, layers[0]);
        const q = new T.Quaternion().setFromAxisAngle(
          new T.Vector3().setComponent(axis, 1),
          angle,
        );
        for (const p of s.cube)
          if (layers.includes(p.pos[axis])) {
            const root = models.get(p.id)!.root;
            root.position.applyQuaternion(q);
            root.quaternion.premultiply(q);
          }
      }
      if (s.solving) {
        targetCamera = null;
        targetLookAt = null;
      }
      if (targetCamera) {
        camera.position.lerp(targetCamera, 1 - Math.exp(-dt * 7));
        if (camera.position.distanceTo(targetCamera) < 0.002)
          targetCamera = null;
      }
      if (targetLookAt) {
        controls.target.lerp(targetLookAt, 1 - Math.exp(-dt * 7));
        if (controls.target.distanceTo(targetLookAt) < 0.001)
          targetLookAt = null;
      }
      if (s.solving) controls.enabled = false;
      else if (!down && !drag && !pinch) controls.enabled = true;
      controls.autoRotate =
        s.settings.autoRotate && !animation && !drag && !s.solving;
      controls.autoRotateSpeed = 0.7;
      if (!s.solving) controls.update();
      scene.updateMatrixWorld(true);
      surfaceBounds.makeEmpty();
      for (const mesh of stickers.values())
        surfaceBounds.union(
          capBounds
            .copy(mesh.geometry.boundingBox!)
            .applyMatrix4(mesh.matrixWorld),
        );
      // Drop the floor immediately as a layer tilts down, then ease it back toward contact.
      const floorHeight = surfaceBounds.min.y - 0.065;
      ground.position.y = Math.min(
        floorHeight,
        T.MathUtils.damp(ground.position.y, floorHeight, 10, dt),
      );
      surfaceBounds.getSize(surfaceSize);
      surfaceBounds.getCenter(surfaceCenter);
      const shadowExtent = Math.max(2, surfaceSize.length() * 0.62);
      key.position
        .copy(surfaceCenter)
        .addScaledVector(keyDirection, shadowExtent * 3.5);
      key.target.position.copy(surfaceCenter);
      const shadowCamera = key.shadow.camera;
      shadowCamera.left = shadowCamera.bottom = -shadowExtent;
      shadowCamera.right = shadowCamera.top = shadowExtent;
      shadowCamera.near = shadowExtent;
      shadowCamera.far = shadowExtent * 6;
      shadowCamera.updateProjectionMatrix();
      key.shadow.radius = s.settings.quality === 'low' ? 1.5 : 2.5;
      const direction = camera.position
          .clone()
          .sub(controls.target)
          .normalize(),
        anchors: typeof s.faceAnchors = {},
        visible: Face[] = [];
      const centerProjection = new T.Vector3(0, 0, 0).project(camera);
      for (const [face, g] of ghostFaces) {
        const f = FACE[face],
          normal = v3(f.n),
          facing = normal.dot(direction);
        if (facing > 0.13) visible.push(face);
        g.mesh.visible =
          s.view === 'hidden' && !s.presentation && facing <= 0.13;
        if (!g.mesh.visible) continue;
        const radius =
            1 +
            s.settings.gap +
            currentExplode * 0.72 +
            (0.507 + s.settings.stickerOffset + inner * 0.95) * s.settings.size,
          raw = normal
            .clone()
            .multiplyScalar(radius + 1.8 + s.settings.explode * 0.7),
          projection = raw.clone().project(camera);
        let dx = projection.x - centerProjection.x,
          dy = projection.y - centerProjection.y;
        if (Math.hypot(dx, dy) < 0.07) {
          dx = face === 'B' ? 0.7 : face === 'F' ? -0.7 : face === 'R' ? 1 : -1;
          dy = -0.45;
        }
        const length = Math.hypot(dx, dy),
          nx = dx / length,
          ny = dy / length;
        const ndc = new T.Vector3(
          T.MathUtils.clamp(centerProjection.x + nx * 0.78, -0.8, 0.8),
          T.MathUtils.clamp(centerProjection.y + ny * 0.68, -0.68, 0.64),
          centerProjection.z,
        );
        const target = ndc.clone().unproject(camera);
        g.mesh.position.copy(target);
        const adjusted = normal.clone();
        if (Math.abs(facing) < 0.3)
          adjusted
            .addScaledVector(
              direction,
              facing < 0 ? -(0.3 - Math.abs(facing)) : 0.3 - Math.abs(facing),
            )
            .normalize();
        const q = new T.Quaternion().setFromUnitVectors(normal, adjusted),
          basis = new T.Matrix4().makeBasis(v3(f.r), v3(f.u), normal);
        g.mesh.quaternion.setFromRotationMatrix(basis).premultiply(q);
        // Keep the auxiliary faces within their screen slots even when exploded or zoomed.
        const viewHeight =
          2 *
          camera.position.distanceTo(target) *
          Math.tan(T.MathUtils.degToRad(camera.fov / 2));
        const scale =
          Math.min(viewHeight * 0.22, viewHeight * camera.aspect * 0.23) /
          (radius * 2);
        g.mesh.scale.setScalar(scale);
        const transform = projectionTransform(
          face,
          radius,
          adjusted.dot(direction) < 0,
        );
        for (const [id, tile] of g.tiles) {
          const source = stickers.get(id)!;
          tile.visible = facesProjection(source.matrixWorld, face);
          if (tile.visible)
            tile.matrix.multiplyMatrices(transform, source.matrixWorld);
        }
        g.mesh.updateMatrixWorld(true);
        const top = new T.Vector3(0, radius + 0.2, 0)
            .applyMatrix4(g.mesh.matrixWorld)
            .project(camera),
          origin = normal.clone().multiplyScalar(radius).project(camera);
        anchors[face] = {
          x: (top.x + 1) * 50,
          y: (1 - top.y) * 50,
          fromX: (origin.x + 1) * 50,
          fromY: (1 - origin.y) * 50,
        };
      }
      if (now - visibilityAt > 60) {
        visibilityAt = now;
        if (
          visible.join('') !== s.visibleFaces.join('') ||
          JSON.stringify(anchors) !== JSON.stringify(s.faceAnchors)
        )
          patch({ visibleFaces: visible, faceAnchors: anchors });
      }
      if (lastQuality !== s.settings.quality) {
        lastQuality = s.settings.quality;
        const shadowSize =
          s.settings.quality === 'low'
            ? 512
            : s.settings.quality === 'high'
              ? 2048
              : mobile
                ? 1024
                : 2048;
        if (key.shadow.mapSize.x !== shadowSize) {
          key.shadow.mapSize.set(shadowSize, shadowSize);
          key.shadow.map?.dispose();
          key.shadow.map = null;
        }
        renderer.setPixelRatio(
          s.settings.quality === 'low'
            ? 1
            : Math.min(
                devicePixelRatio,
                s.settings.quality === 'high' ? 2 : mobile ? 1.5 : 2,
              ),
        );
      }
      renderer.render(scene, camera);
      if (s.view === 'hidden' && !s.presentation) {
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(mappingScene, camera);
        renderer.autoClear = true;
      }
      frame = requestAnimationFrame(render);
    }
    void updateArt();
    frame = requestAnimationFrame(render);
    patch({ ready: true });
    const loss = (e: Event) => {
      e.preventDefault();
      setError('3D 显示连接已中断。请刷新页面恢复，已保存的方案会自动载入。');
    };
    renderer.domElement.addEventListener('webglcontextlost', loss);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (animation?.magnetic)
        finishLayerTurn(animation.axis, animation.layers[0], animation.angle!);
      else animation?.resolve();
      setAnimator(async () => {});
      unsub();
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('dblclick', doubleClick);
      if (drag) patch({ busy: false, dragging: false, currentMove: '' });
      renderer.domElement.removeEventListener('pointerdown', onDown, true);
      renderer.domElement.removeEventListener('pointermove', onMove, true);
      renderer.domElement.removeEventListener('pointerup', onUp, true);
      renderer.domElement.removeEventListener('pointercancel', cancel, true);
      renderer.domElement.removeEventListener('webglcontextlost', loss);
      const geos = new Set<T.BufferGeometry>(),
        mats = new Set<T.Material>();
      scene.traverse((o) => {
        if (o instanceof T.Mesh) {
          geos.add(o.geometry);
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            mats.add(m),
          );
        }
      });
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      ghostMaterials.forEach((m) => m.dispose());
      grain.dispose();
      key.shadow.dispose();
      env.dispose();
      renderer.dispose();
      el.replaceChildren();
    };
  }, []);
  return (
    <div ref={host} className="viewport">
      {error && (
        <div className="webgl-error">
          <strong>3D 视图暂不可用</strong>
          <p>{error}</p>
          <button onClick={() => location.reload()}>重新加载</button>
        </div>
      )}
    </div>
  );
}
