import { tx, useLanguage } from '@/lib/i18n';
import { memo, useEffect, useRef, useState } from 'react';
import * as T from 'three';
import {
  FACE_NAMES,
  FACE_VERTICES,
  ROTATIONS,
  TILES,
  affects,
  dragCandidates,
  type Move,
} from '@/lib/pyraminx/model';
import { createModel, normals, vertices } from '@/lib/pyraminx/geometry';
import { INITIAL_DIRECTION, INITIAL_UP } from '@/lib/pyraminx/camera';
import { paintPhoto } from '@/lib/pyraminx/appearance';
import {
  heldAngle,
  turnsConflict,
  visibleTurns,
} from '@/lib/pyraminx/interaction';
import { FACE_BASES, createHiddenProjections } from '@/lib/pyraminx/projection';
import {
  applyAlignment,
  applyPartialTurn,
  rebaseTipAlignment,
  captureAlignment,
  updateDragTransition,
  updateShapeTransition,
  SHAPE_SETTINGS,
  type AlignmentPose,
  type DragMotion,
} from '@/lib/pyraminx/motion';
import {
  beginDrag,
  cameraActions,
  finishDrag,
  getState,
  interruptSettling,
  notify,
  patch,
  releaseDrag,
  selectTile,
  setAnimator,
  setAlignmentAnimator,
  settings,
  subscribe,
  type Animation,
  type Photo,
  type State,
} from '@/lib/pyraminx/store';
import {
  lightRotation,
  rotateView,
  transitionView,
  zoomView,
  updateDepthRange,
} from '@/lib/cube/camera';
import { magneticEase, stepMagnet } from '@/lib/cube/interaction';
import { StudioEnvironment, createContactShadow } from '@/lib/cube/studio';
import {
  CubeRenderOptimizer,
  isHierarchyVisible,
} from '@/lib/cube/render-optimizer';
import { warmRenderer } from '@/lib/rendering/warmup';
interface Drag extends DragMotion {
  pointer: number;
  start: T.Vector2;
  last: T.Vector2;
  point: T.Vector3;
  piece: number;
  face: number;
  localFace?: number;
  tile: string;
  move?: Move;
  tangent?: T.Vector2;
  scale?: number;
  velocity: number;
  time: number;
  orbit: boolean;
  moved: boolean;
  mapping?: boolean;
}
export default memo(function PyraminxViewport() {
  useLanguage();
  const host = useRef<HTMLDivElement>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const el = host.current!;
    let renderer: T.WebGLRenderer;
    try {
      renderer = new T.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      queueMicrotask(() => setError(tx('legacy.m403')));
      return;
    }
    let disposed = false,
      warming = true,
      frame = 0,
      lastTime = 0,
      drag: Drag | null = null;
    let animation:
      | (Animation & {
          start: number;
          angle: number;
          velocity: number;
          resolve: (angle: number) => void;
        })
      | null = null;
    let alignment:
      | (AlignmentPose & {
          start: number;
          duration: number;
          resolve: () => void;
        })
      | null = null;
    let width = 1,
      height = 1;
    const displayedSettings = { ...getState().settings };
    const viewWeights = { hidden: 0, six: 0, net: 0 };
    let cameraDestination: {
      position: T.Vector3;
      target: T.Vector3;
      orientation: T.Quaternion;
    } | null = null;
    const canvas = renderer.domElement;
    canvas.setAttribute('aria-label', tx('legacy.m404'));
    canvas.tabIndex = 0;
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.78;
    // This scene uses a contact-shadow texture and no mesh receives a shadow.
    // A depth-map pass therefore had no visual contribution, even while dragging.
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    const maps = document.createElement('canvas');
    maps.className = 'pyr-maps';
    maps.setAttribute('aria-label', tx('legacy.m405'));
    el.append(canvas, maps);
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(31, 1, 0.01, 100),
      target = new T.Vector3(0, 0.15, 0);
    const model = createModel(renderer.capabilities.getMaxAnisotropy());
    scene.add(model.root);
    const mechanics: T.Mesh[] = [];
    model.root.traverse((object) => {
      if (object instanceof T.Mesh && !object.userData.cap)
        mechanics.push(object);
    });
    const optimizer = new CubeRenderOptimizer(
      mechanics,
      [...model.tiles.values()],
      { shadows: false },
    );
    scene.add(optimizer.group);
    const projections = createHiddenProjections(model.tiles, (face) =>
      cameraActions.face(face),
    );
    el.append(projections.labels);
    const environment = new StudioEnvironment(),
      pmrem = new T.PMREMGenerator(renderer),
      env = pmrem.fromScene(environment, 0.035);
    environment.dispose();
    pmrem.dispose();
    scene.environment = env.texture;
    scene.environmentIntensity = 0.5;
    scene.add(new T.HemisphereLight(0xf2f4f7, 0x17191d, 0.4));
    const lights = new T.Group(),
      key = new T.DirectionalLight(0xfff3e6, 2.8),
      fill = new T.DirectionalLight(0xfffbf5, 1.2),
      rim = new T.DirectionalLight(0xd6e5ff, 1.15);
    key.position.set(-3, 7, 5);
    key.castShadow = false;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, {
      left: -7,
      right: 7,
      top: 7,
      bottom: -7,
    });
    key.shadow.normalBias = 0.012;
    key.shadow.bias = -0.0001;
    fill.position.set(6, 1, 5);
    rim.position.set(4, 3, -5);
    lights.add(key, fill, rim);
    scene.add(lights);
    if (import.meta.env.DEV)
      Object.defineProperty(canvas, 'renderStats', {
        configurable: true,
        get: () => optimizer.stats,
      });
    const shadowTexture = createContactShadow(),
      shadow = new T.Mesh(
        new T.PlaneGeometry(8, 8),
        new T.MeshBasicMaterial({
          map: shadowTexture,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          toneMapped: false,
        }),
      );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.89;
    scene.add(shadow);
    const textures = new Map<
        string,
        {
          src: string;
          texture: T.CanvasTexture;
          image: HTMLImageElement;
          photo: Photo;
        }
      >(),
      pendingPhotos = new Map<string, string>();
    const raycaster = new T.Raycaster(),
      pointer = new T.Vector2(),
      rotation = new T.Quaternion();
    raycaster.layers.enable(1);
    const touches = new Map<number, T.Vector2>();
    let previousState: State | null = null;
    let previousAlignmentPose: AlignmentPose | null = null,
      surfaceBoundsDirty = true;
    let previousModel: State | null = null,
      previousTurnAngle = NaN,
      previousTurnAxis = -1,
      previousTurnLayer = '',
      previousAlignment = -1;
    const surfaceBounds = new T.Box3(),
      meshBounds = new T.Box3(),
      surfaceSize = new T.Vector3();
    function invalidate() {
      if (!disposed && !frame && !document.hidden)
        frame = requestAnimationFrame(render);
    }
    function moveCameraToFit(
      direction: T.Vector3,
      object: T.Object3D = model.root,
      up = camera.up,
      immediate = false,
    ) {
      if (getState().solving) return;
      // Measure the destination assembly, then restore the displayed pose before
      // the next frame. Fitting must not snap an unfinished disassembly.
      updateModel(true);
      const destinationTarget =
        object === model.root
          ? new T.Vector3()
          : new T.Box3().setFromObject(object).getCenter(new T.Vector3());
      const destination = camera.clone();
      direction = direction.clone().normalize();
      destination.position.copy(destinationTarget).add(direction);
      destination.up.copy(up);
      destination.lookAt(destinationTarget);
      const inverse = destination.quaternion.clone().invert(),
        tangent = Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      let distance = 0;
      // Fit the tetrahedron's actual silhouette; its enclosing box has empty
      // corners that would make the assembled puzzle appear unnecessarily small.
      object.traverse((object) => {
        if (!(object instanceof T.Mesh)) return;
        const positions = object.geometry.getAttribute('position');
        const p = new T.Vector3();
        for (let i = 0; i < positions.count; i++) {
          p.fromBufferAttribute(positions, i)
            .applyMatrix4(object.matrixWorld)
            .sub(destinationTarget)
            .applyQuaternion(inverse);
          distance = Math.max(
            distance,
            p.z + Math.abs(p.x) / (tangent * camera.aspect * 0.7),
            p.z + Math.abs(p.y) / (tangent * 0.7),
          );
        }
      });
      cameraDestination = {
        target: destinationTarget,
        position: destinationTarget
          .clone()
          .addScaledVector(direction, Math.max(0.4, distance)),
        orientation: destination.quaternion.clone(),
      };
      updateModel();
      if (immediate) {
        transitionView(
          camera,
          target,
          cameraDestination.position,
          cameraDestination.target,
          cameraDestination.orientation,
          1,
        );
        cameraDestination = null;
      }
      invalidate();
    }
    const viewDirection = () => camera.position.clone().sub(target).normalize();
    cameraActions.fit = () => moveCameraToFit(viewDirection());
    cameraActions.reset = () =>
      moveCameraToFit(INITIAL_DIRECTION, model.root, INITIAL_UP);
    cameraActions.face = (face) => {
      if (normals[face])
        moveCameraToFit(normals[face], model.root, FACE_BASES[face].y);
    };
    cameraActions.focus = () => {
      const selected = getState().selected[0],
        mesh = selected ? model.tiles.get(selected) : undefined;
      if (mesh) {
        moveCameraToFit(viewDirection(), mesh);
      } else notify(tx('legacy.m291'));
    };
    function updateAppearance(s: State) {
      for (const tile of TILES) {
        const mesh = model.tiles.get(tile.id)!,
          photo = s.photos[tile.face];
        mesh.material.roughness = s.settings.roughness;
        mesh.material.emissive.set(
          s.selected.includes(tile.id) ? '#566c38' : '#000000',
        );
        mesh.material.emissiveIntensity = 0.28;
        mesh.material.color.set(photo ? '#ffffff' : s.colors[tile.id]);
        const entry = textures.get(String(tile.face));
        const map = photo && entry?.src === photo.src ? entry.texture : null;
        if (mesh.material.map !== map) {
          mesh.material.map = map;
          mesh.material.needsUpdate = true;
        }
      }
      for (let face = 0; face < 4; face++) {
        const photo = s.photos[face],
          old = textures.get(String(face));
        if (!photo) {
          if (old) {
            old.texture.dispose();
            textures.delete(String(face));
          }
          continue;
        }
        if (old?.src === photo.src) {
          if (old.photo !== photo) {
            paintPhoto(old.texture.image, old.image, photo);
            old.texture.needsUpdate = true;
            old.photo = photo;
          }
          continue;
        }
        if (pendingPhotos.get(String(face)) === photo.src) continue;
        pendingPhotos.set(String(face), photo.src);
        const img = new Image();
        img.src = photo.src;
        void img
          .decode()
          .then(() => {
            if (disposed || getState().photos[face]?.src !== photo.src) return;
            const currentPhoto = getState().photos[face];
            const c = document.createElement('canvas');
            paintPhoto(c, img, currentPhoto);
            const texture = new T.CanvasTexture(c);
            texture.colorSpace = T.SRGBColorSpace;
            texture.anisotropy = 4;
            textures.get(String(face))?.texture.dispose();
            textures.set(String(face), {
              src: photo.src,
              texture,
              image: img,
              photo: currentPhoto,
            });
            pendingPhotos.delete(String(face));
            updateAppearance(getState());
            invalidate();
          })
          .catch(() => {
            if (!disposed) {
              pendingPhotos.delete(String(face));
              notify(tx('legacy.m300'));
            }
          });
      }
    }
    function updateModel(destination = false) {
      const s = getState();
      const layout = destination ? s.settings : displayedSettings;
      const turn = animation
        ? { ...animation.move, angle: animation.angle }
        : drag?.move
          ? { ...drag.move, angle: drag.angle }
          : null;
      const progress = alignment?.progress ?? -1;
      if (
        !destination &&
        previousModel?.puzzle === s.puzzle &&
        previousModel.partials === s.partials &&
        SHAPE_SETTINGS.every(
          (key) => previousModel!.settings[key] === layout[key],
        ) &&
        previousModel.settings.showMagnets === layout.showMagnets &&
        previousTurnAngle === (turn?.angle ?? 0) &&
        previousTurnAxis === (turn?.axis ?? -1) &&
        previousTurnLayer === (turn?.layer ?? '') &&
        previousAlignment === progress &&
        previousAlignmentPose === alignment
      )
        return false;
      model.update({ ...s, settings: layout });
      if (alignment) {
        if (previousModel && previousModel.puzzle !== s.puzzle)
          rebaseTipAlignment(alignment, previousModel.puzzle, s.puzzle);
        model.pieces.forEach((piece, index) => {
          applyAlignment(
            piece.root,
            alignment!.rotations[index],
            alignment!.progress,
          );
        });
        applyAlignment(
          model.core,
          alignment.rotations[model.pieces.length],
          alignment.progress,
        );
      }
      for (const visible of visibleTurns(s.partials, turn)) {
        rotation.setFromAxisAngle(
          vertices[visible.axis].clone().normalize(),
          visible.angle,
        );
        for (let i = 0; i < model.pieces.length; i++)
          if (affects(i, s.puzzle.rotations[i], visible)) {
            applyPartialTurn(
              model.pieces[i].root,
              s.puzzle.rotations[i],
              visible,
            );
          }
        if (visible.layer === 'base')
          model.core.quaternion.premultiply(rotation);
      }
      model.root.updateMatrixWorld(true);
      previousModel = destination ? null : { ...s, settings: { ...layout } };
      previousTurnAngle = turn?.angle ?? 0;
      previousTurnAxis = turn?.axis ?? -1;
      previousTurnLayer = turn?.layer ?? '';
      previousAlignment = progress;
      previousAlignmentPose = alignment;
      surfaceBoundsDirty = true;
      optimizer.updateBounds();
      return true;
    }
    const faceBases = FACE_BASES;
    function drawMaps(s: State, net: boolean, opacity: number) {
      const ctx = maps.getContext('2d')!;
      if (opacity < 0.001) return;
      ctx.save();
      ctx.globalAlpha = opacity;
      const faces = [0, 1, 2, 3];
      const side = net
        ? Math.min(width * 0.4, height * 0.42, 280)
        : Math.min(width / Math.max(faces.length, 2) - 20, 120);
      const h = (side * Math.sqrt(3)) / 2;
      const currentN = new T.Vector3(),
        q = new T.Quaternion();
      faces.forEach((face, index) => {
        let cx = 22 + side / 2 + index * (side + 14),
          cy = height - 112 - h / 2;
        let angle = 0;
        if (net) {
          const centerX = width / 2,
            centerY = height / 2 - 8;
          if (index === 0) {
            cx = centerX;
            cy = centerY;
          } else {
            const shared = FACE_VERTICES[0].filter((v) => v !== face);
            const project = (f: number, v: number) => {
              const basis = faceBases[f],
                p = vertices[v].clone().sub(basis.center);
              const scale = side / vertices[0].distanceTo(vertices[1]);
              return new T.Vector2(
                p.dot(basis.x) * scale,
                -p.dot(basis.y) * scale,
              );
            };
            const a = project(face, shared[0]),
              b = project(face, shared[1]);
            const toA = project(0, shared[0]),
              toB = project(0, shared[1]);
            angle =
              Math.atan2(toB.y - toA.y, toB.x - toA.x) -
              Math.atan2(b.y - a.y, b.x - a.x);
            a.rotateAround(new T.Vector2(), angle);
            cx = centerX + toA.x - a.x;
            cy = centerY + toA.y - a.y;
          }
        }
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        const { center, x, y } = faceBases[face],
          scale = side / vertices[0].distanceTo(vertices[1]);
        ctx.beginPath();
        ctx.moveTo(0, (-h * 2) / 3);
        ctx.lineTo(-side / 2, h / 3);
        ctx.lineTo(side / 2, h / 3);
        ctx.closePath();
        ctx.fillStyle = '#11171bd9';
        ctx.fill();
        ctx.strokeStyle = '#a9ba9a40';
        ctx.stroke();
        for (const tile of TILES) {
          const mesh = model.tiles.get(tile.id)!;
          mesh.getWorldQuaternion(q);
          currentN.set(0, 0, 1).applyQuaternion(q);
          if (currentN.dot(normals[face]) < 0.42) continue;
          const pos = mesh.geometry.getAttribute('position'),
            ring = 21 * 5;
          const projected: T.Vector2[] = [];
          for (let i = 0; i < 21; i++) {
            const p = new T.Vector3()
              .fromBufferAttribute(pos, ring + i)
              .applyMatrix4(mesh.matrixWorld)
              .sub(center);
            projected.push(new T.Vector2(p.dot(x) * scale, -p.dot(y) * scale));
          }
          ctx.beginPath();
          projected.forEach((p, i) =>
            i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
          );
          ctx.closePath();
          ctx.fillStyle = s.colors[tile.id];
          ctx.fill();
          const photo = textures.get(String(tile.face));
          if (s.photos[tile.face] && photo && mesh.material.map) {
            const uv = mesh.geometry.getAttribute('uv'),
              map = mesh.material.map;
            const a = new T.Vector2(uv.getX(ring), uv.getY(ring)),
              b = new T.Vector2(uv.getX(ring + 7), uv.getY(ring + 7)),
              c = new T.Vector2(uv.getX(ring + 14), uv.getY(ring + 14));
            map.updateMatrix();
            [a, b, c].forEach((p) => {
              p.applyMatrix3(map.matrix);
              p.y = 1 - p.y;
              p.set(
                p.x * photo.texture.image.width,
                p.y * photo.texture.image.height,
              );
            });
            const det = (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
            if (Math.abs(det) > 0.001) {
              const p = projected[0],
                u = projected[7].clone().sub(p),
                v = projected[14].clone().sub(p);
              const xx = (u.x * (c.y - a.y) - v.x * (b.y - a.y)) / det,
                xy = (v.x * (b.x - a.x) - u.x * (c.x - a.x)) / det;
              const yx = (u.y * (c.y - a.y) - v.y * (b.y - a.y)) / det,
                yy = (v.y * (b.x - a.x) - u.y * (c.x - a.x)) / det;
              ctx.save();
              ctx.clip();
              ctx.transform(
                xx,
                yx,
                xy,
                yy,
                p.x - xx * a.x - xy * a.y,
                p.y - yx * a.x - yy * a.y,
              );
              ctx.drawImage(photo.texture.image, 0, 0);
              ctx.restore();
            }
          }
          ctx.strokeStyle = '#13191f';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.restore();
        if (!net) {
          ctx.fillStyle = '#aab4ab';
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(FACE_NAMES[face], cx, cy + h / 3 + 20);
        }
      });
      ctx.restore();
    }
    function render(time: number) {
      frame = 0;
      if (disposed || warming) return;
      const dt = Math.min(0.04, (time - (lastTime || time)) / 1000);
      lastTime = time;
      const s = getState();
      const shapeMoving = updateShapeTransition(
        displayedSettings,
        s.settings,
        dt,
      );
      let viewMoving = false;
      for (const view of ['hidden', 'six', 'net'] as const) {
        const goal = !s.presentation && s.view === view ? 1 : 0;
        const value = T.MathUtils.damp(viewWeights[view], goal, 10, dt);
        viewWeights[view] = Math.abs(value - goal) < 0.001 ? goal : value;
        viewMoving ||= viewWeights[view] !== goal;
      }
      if (alignment)
        alignment.progress = T.MathUtils.smoothstep(
          time,
          alignment.start,
          alignment.start + alignment.duration,
        );
      if (drag?.move) updateDragTransition(drag, time);
      let completed: typeof animation = null;
      if (animation) {
        const a = animation;
        a.start ||= time;
        const duration = a.duration ?? 330 / s.settings.speed;
        let done = false;
        if (a.magnetic) {
          if (s.settings.magnetStrength === 0) done = true;
          else {
            const next = stepMagnet(
              a.angle,
              a.velocity,
              a.to,
              dt,
              s.settings.magnetStrength,
              s.settings.magnetDamping,
            );
            a.angle = next.angle;
            a.velocity = next.velocity;
            if (
              Math.abs(a.angle - a.to) < 0.0001 &&
              Math.abs(a.velocity) < 0.003
            ) {
              a.angle = a.to;
              done = true;
            }
          }
        } else {
          const t = Math.min(1, (time - a.start) / duration),
            eased =
              s.settings.easing === 'linear'
                ? t
                : s.settings.easing === 'magnetic' && !a.duration
                  ? magneticEase(t)
                  : t * t * (3 - 2 * t);
          a.angle = T.MathUtils.lerp(a.from, a.to, eased);
          done = t === 1;
        }
        if (done) completed = a;
      }
      if (s.solving) cameraDestination = null;
      if (cameraDestination) {
        const { position, target: lookAt, orientation } = cameraDestination;
        transitionView(
          camera,
          target,
          position,
          lookAt,
          orientation,
          1 - Math.exp(-dt * 7),
        );
        if (
          camera.position.distanceTo(position) < 0.002 &&
          target.distanceTo(lookAt) < 0.002 &&
          camera.quaternion.angleTo(orientation) < 0.001
        ) {
          transitionView(camera, target, position, lookAt, orientation, 1);
          cameraDestination = null;
        }
      }
      if (
        s.settings.autoRotate &&
        !drag &&
        !cameraDestination &&
        !animation &&
        !alignment &&
        !s.solving
      )
        rotateView(camera, target, dt * 0.18, 0);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      lights.quaternion.copy(
        lightRotation(
          s.settings.lightAzimuth,
          s.settings.lightElevation,
          s.settings.lightFollowCamera,
          camera.quaternion,
        ),
      );
      key.intensity = s.settings.lightIntensity;
      updateModel();
      if (surfaceBoundsDirty) {
        surfaceBounds.makeEmpty();
        for (const mesh of model.tiles.values())
          surfaceBounds.union(
            meshBounds
              .copy(mesh.geometry.boundingBox!)
              .applyMatrix4(mesh.matrixWorld),
          );
        surfaceBounds.getSize(surfaceSize);
        shadow.position.y = surfaceBounds.min.y - 0.08;
        shadow.scale.set(
          (surfaceSize.x * 1.5) / 8,
          (surfaceSize.z * 1.5) / 8,
          1,
        );
        surfaceBoundsDirty = false;
      }
      shadow.material.opacity = 0.22 / (1 + displayedSettings.explode);
      updateDepthRange(camera, surfaceBounds);
      canvas.style.opacity = String(1 - viewWeights.net);
      canvas.style.visibility = viewWeights.net === 1 ? 'hidden' : 'visible';
      const projectionsMoving = projections.update(
        { ...s, settings: displayedSettings },
        camera,
        target,
        viewWeights.hidden,
        dt,
      );
      if (canvas.style.visibility !== 'hidden') {
        optimizer.prepareCamera(camera);
        renderer.render(scene, camera);
        if (viewWeights.hidden > 0) {
          // Preserve the main model's depth so it occludes the auxiliary faces.
          renderer.autoClear = false;
          renderer.render(projections.scene, camera);
          renderer.autoClear = true;
        }
      }
      maps.getContext('2d')!.clearRect(0, 0, width, height);
      maps.style.display =
        viewWeights.six + viewWeights.net > 0 ? 'block' : 'none';
      drawMaps(s, false, viewWeights.six);
      drawMaps(s, true, viewWeights.net);
      if (alignment?.progress === 1) {
        const completedAlignment = alignment;
        alignment = null;
        completedAlignment.resolve();
      }
      if (completed) {
        animation = null;
        completed.resolve(completed.angle);
      }
      if (
        animation ||
        alignment ||
        drag?.transition ||
        cameraDestination ||
        shapeMoving ||
        viewMoving ||
        projectionsMoving ||
        s.settings.autoRotate
      )
        invalidate();
    }
    setAlignmentAnimator(
      (partial, duration) =>
        new Promise((resolve) => {
          const pose = captureAlignment(getState().puzzle, partial, alignment);
          alignment?.resolve();
          alignment = { ...pose, start: performance.now(), duration, resolve };
          invalidate();
        }),
    );
    setAnimator(
      (a) =>
        new Promise((resolve) => {
          animation = {
            ...a,
            start: 0,
            angle: a.from,
            velocity: a.velocity ?? 0,
            resolve,
          };
          invalidate();
        }),
      () => {
        const settling = animation;
        if (!settling?.layerTurn) return;
        animation = null;
        finishDrag(settling.move, settling.angle);
        settling.resolve(settling.angle);
        updateModel();
      },
    );
    function sync() {
      const s = getState();
      if (
        !previousState ||
        previousState.colors !== s.colors ||
        previousState.photos !== s.photos ||
        previousState.selected !== s.selected ||
        previousState.settings !== s.settings
      )
        updateAppearance(s);
      if (
        !previousState ||
        previousState.settings.quality !== s.settings.quality
      ) {
        renderer.setPixelRatio(
          Math.min(
            devicePixelRatio,
            s.settings.quality === 'low'
              ? 1
              : s.settings.quality === 'high'
                ? 2
                : width < 760
                  ? 1.5
                  : 2,
          ),
        );
        renderer.setSize(width, height);
      }
      if (
        previousState &&
        SHAPE_SETTINGS.some(
          (key) => previousState!.settings[key] !== s.settings[key],
        )
      )
        cameraActions.fit();
      previousState = s;
      invalidate();
    }
    const unsubscribe = subscribe(sync);
    function resize() {
      width = Math.max(1, el.clientWidth);
      height = Math.max(1, el.clientHeight);
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      const ratio = Math.min(devicePixelRatio, 2);
      maps.width = width * ratio;
      maps.height = height * ratio;
      maps.style.width = `${width}px`;
      maps.style.height = `${height}px`;
      maps.getContext('2d')!.setTransform(ratio, 0, 0, ratio, 0, 0);
      cameraActions.fit();
      invalidate();
    }
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    function hit(e: PointerEvent | MouseEvent) {
      const bounds = canvas.getBoundingClientRect();
      pointer.set(
        ((e.clientX - bounds.left) / width) * 2 - 1,
        (-(e.clientY - bounds.top) / height) * 2 + 1,
      );
      camera.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      const physical = raycaster
        .intersectObjects(model.hits, false)
        .find(
          (h) =>
            isHierarchyVisible(h.object) &&
            optimizer.isVisible(h.object as T.Mesh),
        );
      return (
        physical ??
        raycaster
          .intersectObjects(projections.hits, false)
          .find((h) => h.object.visible && h.object.parent?.visible)
      );
    }
    function screen(p: T.Vector3) {
      const v = p.clone().project(camera);
      return new T.Vector2((v.x * width) / 2, (-v.y * height) / 2);
    }
    function down(e: PointerEvent) {
      if (warming) return;
      if (getState().solving) return;
      if (getState().busy && !drag && !getState().settling) return;
      cameraDestination = null;
      canvas.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, new T.Vector2(e.clientX, e.clientY));
      if (touches.size > 1) {
        if (drag?.move) finishDrag(drag.move, drag.angle);
        drag = null;
        return;
      }
      const s = getState(),
        h = hit(e),
        data = h?.object.userData;
      let face = data?.face as number | undefined;
      if (face === undefined && h) {
        const q = new T.Quaternion();
        h.object.getWorldQuaternion(q);
        const n = (
          h.face?.normal.clone() ?? new T.Vector3(0, 0, 1)
        ).applyQuaternion(q);
        face = normals.reduce(
          (best, normal, i) =>
            normal.dot(n) > normals[best].dot(n) ? i : best,
          0,
        );
      } else if (face !== undefined && data)
        face = ROTATIONS[s.puzzle.rotations[data.piece]][face];
      drag = {
        pointer: e.pointerId,
        start: new T.Vector2(e.clientX, e.clientY),
        last: new T.Vector2(e.clientX, e.clientY),
        point: h?.point ?? new T.Vector3(),
        piece: data?.piece ?? -1,
        face: face ?? 0,
        localFace: data?.face,
        tile: data?.tile ?? '',
        angle: 0,
        targetAngle: 0,
        initial: 0,
        velocity: 0,
        time: performance.now(),
        moved: false,
        mapping: Boolean(data?.mapping),
        orbit:
          e.button !== 0 ||
          !h ||
          s.mode === 'camera' ||
          s.mode === 'explode' ||
          s.presentation,
      };
      e.preventDefault();
    }
    function updateDrag(e: PointerEvent) {
      const d = drag;
      if (!d) return;
      const position = new T.Vector2(e.clientX, e.clientY),
        delta = position.clone().sub(d.last),
        total = position.clone().sub(d.start);
      d.last.copy(position);
      d.moved ||= total.length() > 5;
      if (!d.moved) return;
      if (d.orbit) {
        rotateView(
          camera,
          target,
          e.shiftKey ? 0 : delta.x * 0.006,
          e.shiftKey ? 0 : delta.y * 0.006,
          e.shiftKey ? delta.x * 0.006 : 0,
        );
        invalidate();
        return;
      }
      if (d.mapping) return;
      let s = getState();
      if (s.mode !== 'play' && s.mode !== 'solver') return;
      if (!d.move) {
        interruptSettling();
        s = getState();
        if (s.busy) return;
        const face =
          d.localFace === undefined
            ? d.face
            : ROTATIONS[s.puzzle.rotations[d.piece]][d.localFace];
        const move = dragCandidates(s.puzzle, d.piece, face)[0];
        const n = vertices[move.axis].clone().normalize();
        if (move.layer === 'tip')
          for (const partial of s.partials)
            if (partial.layer === 'base' && partial.axis !== move.axis)
              n.applyAxisAngle(
                vertices[partial.axis].clone().normalize(),
                partial.angle,
              );
        const rotated = d.point.clone().applyAxisAngle(n, 0.01);
        const tangent = screen(rotated)
          .sub(screen(d.point))
          .multiplyScalar(100);
        if (tangent.length() < 4) {
          notify(tx('legacy.m406'));
          return;
        }
        const needsAlignment = s.partials.some((p) => turnsConflict(p, move));
        if (!beginDrag(move)) return;
        d.move = move;
        d.scale = tangent.length();
        d.tangent = tangent.normalize();
        d.initial = heldAngle(getState().partials, move);
        d.angle = d.targetAngle = d.initial;
        if (needsAlignment)
          d.transition = {
            start: performance.now(),
            duration: Math.max(100, 120 / s.settings.speed),
          };
        updateAngle(d);
      } else if (d.move) updateAngle(d);
    }
    function updateAngle(d: Drag) {
      const angle =
        d.initial + d.last.clone().sub(d.start).dot(d.tangent!) / d.scale!;
      const now = performance.now(),
        dt = Math.max(8, now - d.time) / 1000;
      d.velocity = d.velocity * 0.35 + ((angle - d.targetAngle) / dt) * 0.65;
      d.targetAngle = angle;
      if (!d.transition) d.angle = angle;
      d.time = now;
      invalidate();
    }
    function move(e: PointerEvent) {
      if (!touches.has(e.pointerId)) return;
      if (touches.size >= 2) {
        const before = [...touches.values()].slice(0, 2).map((v) => v.clone());
        touches.set(e.pointerId, new T.Vector2(e.clientX, e.clientY));
        const after = [...touches.values()].slice(0, 2);
        const b = before[1].clone().sub(before[0]),
          a = after[1].clone().sub(after[0]);
        const shift = after[0]
          .clone()
          .add(after[1])
          .sub(before[0])
          .sub(before[1])
          .multiplyScalar(0.5);
        rotateView(
          camera,
          target,
          shift.x * 0.006,
          shift.y * 0.006,
          Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x),
        );
        if (a.length() > 5) zoomView(camera, target, b.length() / a.length());
        invalidate();
      } else {
        touches.set(e.pointerId, new T.Vector2(e.clientX, e.clientY));
        updateDrag(e);
      }
    }
    function end(e: PointerEvent) {
      touches.delete(e.pointerId);
      const d = drag;
      if (!d || d.pointer !== e.pointerId) return;
      drag = null;
      const cancelled =
        e.type === 'pointercancel' || e.type === 'lostpointercapture';
      if (d.move) {
        if (cancelled) finishDrag(d.move, d.initial);
        else
          void releaseDrag(
            d.move,
            d.angle,
            performance.now() - d.time > 100 ? 0 : d.velocity,
            d.targetAngle,
          );
      } else if (!d.moved && !cancelled) {
        if (getState().presentation && d.piece < 0)
          settings({ autoRotate: !getState().settings.autoRotate });
        else if (
          getState().mode === 'customize' ||
          getState().mode === 'inspect'
        ) {
          if (d.tile) selectTile(d.tile);
          else patch({ selected: [] });
        }
      }
      invalidate();
    }
    function wheel(e: WheelEvent) {
      e.preventDefault();
      if (!getState().solving) {
        const destination = camera.clone(),
          lookAt = cameraDestination?.target.clone() ?? target.clone();
        if (cameraDestination) {
          destination.position.copy(cameraDestination.position);
          destination.quaternion.copy(cameraDestination.orientation);
        }
        zoomView(
          destination,
          lookAt,
          Math.exp(T.MathUtils.clamp(e.deltaY, -500, 500) * 0.001),
        );
        cameraDestination = {
          position: destination.position.clone(),
          target: lookAt,
          orientation: destination.quaternion.clone(),
        };
        invalidate();
      }
    }
    function doubleClick(e: MouseEvent) {
      if (getState().busy || getState().solving) return;
      const h = hit(e);
      if (h) {
        const object = h.object.userData.mapping
          ? model.tiles.get(h.object.userData.tile)
          : (model.pieces[h.object.userData.piece]?.root ?? h.object);
        if (object) moveCameraToFit(viewDirection(), object);
      }
    }
    function context(e: Event) {
      e.preventDefault();
    }
    function visibility() {
      if (document.hidden) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else {
        lastTime = 0;
        invalidate();
      }
    }
    function contextLost(e: Event) {
      e.preventDefault();
      setError(tx('legacy.m407'));
      if (animation) {
        animation.resolve(animation.to);
        animation = null;
      }
      alignment?.resolve();
      alignment = null;
    }
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('dblclick', doubleClick);
    canvas.addEventListener('contextmenu', context);
    canvas.addEventListener('webglcontextlost', contextLost);
    document.addEventListener('visibilitychange', visibility);
    model.update(getState());
    camera.position.set(-2.4, 1.7, 10);
    resize();
    moveCameraToFit(INITIAL_DIRECTION, model.root, INITIAL_UP, true);
    sync();
    patch({ ready: false });
    const warmup = warmRenderer(
      renderer,
      scene,
      camera,
      optimizer,
      projections.scene,
      () => disposed,
    )
      .then(() => {
        warming = false;
        if (disposed) return;
        previousModel = null;
        patch({ ready: true });
        invalidate();
      })
      .catch(() => {
        warming = false;
        if (!disposed) setError(tx('legacy.m295'));
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      unsubscribe();
      observer.disconnect();
      if (animation) animation.resolve(animation.to);
      alignment?.resolve();
      setAnimator(async (a) => a.to);
      setAlignmentAnimator(async () => {});
      patch({
        ready: false,
        busy: false,
        dragging: false,
        settling: false,
        currentMove: '',
      });
      cameraActions.fit = cameraActions.reset = cameraActions.focus = () => {};
      cameraActions.face = () => {};
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointercancel', end);
      canvas.removeEventListener('lostpointercapture', end);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('dblclick', doubleClick);
      canvas.removeEventListener('contextmenu', context);
      canvas.removeEventListener('webglcontextlost', contextLost);
      document.removeEventListener('visibilitychange', visibility);
      const disposeResources = () => {
        optimizer.dispose();
        model.dispose();
        projections.dispose();
        textures.forEach((v) => v.texture.dispose());
        key.shadow.dispose();
        shadowTexture.dispose();
        shadow.geometry.dispose();
        shadow.material.dispose();
        env.dispose();
        renderer.dispose();
      };
      if (warming) void warmup.then(disposeResources);
      else disposeResources();
      el.replaceChildren();
    };
  }, []);
  return (
    <div className="viewport pyr-viewport" ref={host}>
      {error && (
        <div className="webgl-error">
          <strong>{tx('legacy.m297')}</strong>
          <p>{error}</p>
          <button onClick={() => location.reload()}>{tx('legacy.m298')}</button>
        </div>
      )}
    </div>
  );
});
