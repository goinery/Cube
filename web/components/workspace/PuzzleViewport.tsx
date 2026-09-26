import StudioLoading from './StudioLoading';
import { fitDistance } from '@/lib/cube/interaction';
import { i18n, t } from '@/lib/i18n';
import { PUZZLE_DEFAULTS, STUDIO_DEFAULTS } from '@/lib/puzzle-config';
import { paintFace } from '@/lib/puzzle/appearance';
import { buildPuzzle } from '@/lib/puzzle/geometry';
import { HiddenFaces } from '@/lib/puzzle/hidden-faces';
import type { Session } from '@/lib/puzzle/session';
import { createPuzzleInteraction } from '@/lib/puzzle/viewport-interaction';
import {
  lightRotation,
  rotateView,
  transitionView,
  updateDepthRange,
} from '@/lib/rendering/camera';
import { createFrameLoop } from '@/lib/rendering/frame-loop';
import { MinimalRenderer } from '@/lib/rendering/minimal';
import { createPlasticGrain } from '@/lib/rendering/studio';
import {
  attachOptimizer,
  createPuzzleOptimizer,
  createRenderer,
  createStudio,
  pixelRatio,
} from '@/lib/rendering/viewport';
import { useEffect, useRef, useState } from 'react';
import * as T from 'three';

export default function PuzzleViewport({ session }: { session: Session }) {
  const host = useRef<HTMLDivElement>(null),
    [error, setError] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const el = host.current!,
      def = session.def;
    let renderer: T.WebGLRenderer;
    try {
      renderer = createRenderer(def.id);
    } catch {
      setError(true);
      return;
    }
    const defaults = PUZZLE_DEFAULTS[def.id];
    el.appendChild(renderer.domElement);
    const studio = createStudio(renderer, def.id, def.faces);
    const { scene, camera, target, rig, key, fill, rim, ground, contact } =
      studio;
    const model = buildPuzzle(def, renderer.capabilities.getMaxAnisotropy());
    scene.add(model.root);
    const mechanics: T.Mesh[] = [],
      caps = [...model.caps.values()];
    const capSet = new Set(caps);
    model.root.traverse((object) => {
      if (object instanceof T.Mesh && !capSet.has(object))
        mechanics.push(object);
    });
    const optimizer = createPuzzleOptimizer(def.id, mechanics, caps);
    attachOptimizer(renderer, scene, key, optimizer);
    const grain = createPlasticGrain(renderer.capabilities.getMaxAnisotropy());
    model.caps.forEach((mesh) => {
      const material = mesh.material as T.MeshPhysicalMaterial;
      material.bumpMap = grain;
      material.bumpScale = 0.0006;
    });
    const textures = new Map<string, T.CanvasTexture>();
    let firstFrameReady = false,
      initialArtSettled = false;
    const hiddenMaps = new HiddenFaces(def, model.caps);
    const minimal = new MinimalRenderer([scene], model.caps.values());
    scene.traverse((object) => {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
    scene.matrixWorldAutoUpdate = false;
    let cameraDestination: {
      position: T.Vector3;
      target: T.Vector3;
      orientation: T.Quaternion;
    } | null = null;
    const hitObjects = [
      ...hiddenMaps.hitMeshes,
      ...model.caps.values(),
      ...model.models.map((m) => m.shell),
    ];
    const homes = def.pieces.map((piece) => new T.Vector3(...piece.home)),
      radials = homes.map((home) => home.clone().normalize()),
      poses = homes.map(() => new T.Quaternion()),
      modelBounds = new T.Box3(),
      meshBounds = new T.Box3(),
      surface = new T.Vector3();
    let boundsDirty = true,
      optimizerDirty = true;
    let previousLayout: typeof session.state | undefined,
      wasMoving = false;
    const damp = (value: number, goal: number, rate: number, dt: number) => {
      const next = T.MathUtils.damp(value, goal, rate, dt);
      return Math.abs(next - goal) < 1e-6 ? goal : next;
    };
    let disposed = false,
      art = -1,
      artRequest = 0,
      explode = session.state.settings.explode,
      gap = session.state.settings.gap,
      size = session.state.settings.size,
      internal = session.state.settings.internal,
      offset = session.state.settings.stickerOffset,
      magnetWeight = Number(session.state.settings.showMagnets),
      followFit = false;
    const loop = createFrameLoop(render),
      invalidate = loop.invalidate;
    function updateArt() {
      if (art === session.state.artVersion) return;
      art = session.state.artVersion;
      const request = ++artRequest;
      const appearance = session.state.appearance,
        res =
          session.state.settings.quality === 'low'
            ? 512
            : def.order >= 4
              ? 1024
              : 768;
      void Promise.all(
        def.faces.map(async (face) => {
          const canvas = document.createElement('canvas');
          await paintFace(canvas, def, face.id, appearance, [], res);
          return { face, canvas };
        }),
      )
        .then((items) => {
          if (disposed || request !== artRequest) return;
          for (const { face, canvas } of items) {
            const texture = new T.CanvasTexture(canvas);
            texture.colorSpace = T.SRGBColorSpace;
            texture.anisotropy = Math.min(
              renderer.capabilities.getMaxAnisotropy(),
              8,
            );
            const previous = textures.get(face.id);
            textures.set(face.id, texture);
            def.tiles
              .filter((tile) => tile.face === face.id)
              .forEach((tile) => {
                const mesh = model.caps.get(tile.id)!,
                  material = mesh.material as T.MeshPhysicalMaterial;
                material.color.set('#ffffff');
                material.map = texture;
                material.needsUpdate = true;
              });
            previous?.dispose();
          }
          initialArtSettled = true;
          invalidate();
        })
        .catch(() => {
          if (!disposed) {
            session.notify('art.failed');
            initialArtSettled = true;
            invalidate();
          }
        });
    }
    function layout(now: number, dt: number) {
      const state = session.state,
        settings = state.settings;
      const oldExplode = explode,
        oldGap = gap,
        oldSize = size,
        oldInternal = internal,
        oldOffset = offset,
        oldMagnets = magnetWeight;
      explode = damp(explode, settings.explode, 10, dt);
      gap = damp(gap, settings.gap, 10, dt);
      size = damp(size, settings.size, 10, dt);
      internal = damp(internal, settings.internal, 10, dt);
      offset = damp(offset, settings.stickerOffset, 10, dt);
      magnetWeight = damp(magnetWeight, settings.showMagnets ? 1 : 0, 12, dt);
      const separation = explode * 0.7,
        inner = Math.max(0, explode - 1) * internal;
      const partsChanged =
        !previousLayout ||
        oldExplode !== explode ||
        oldInternal !== internal ||
        oldOffset !== offset ||
        oldMagnets !== magnetWeight;
      const poseChanged =
        !previousLayout ||
        state.puzzle !== previousLayout.puzzle ||
        state.motionVersion !== previousLayout.motionVersion ||
        session.motion.moving ||
        wasMoving;
      const shapeChanged =
        partsChanged || poseChanged || oldGap !== gap || oldSize !== size;
      if (poseChanged) session.motion.writePoses(poses, now);
      if (shapeChanged)
        model.models.forEach((piece, i) => {
          const home = homes[i],
            pose = poses[i],
            radial = radials[i];
          piece.root.quaternion.copy(pose);
          piece.root.position
            .copy(home)
            .addScaledVector(radial, separation + gap * 1.5)
            .applyQuaternion(pose);
          piece.root.scale.setScalar(size);
          piece.root.updateMatrix();
          if (partsChanged)
            piece.parts.forEach((part) => {
              part.object.position
                .copy(part.base)
                .addScaledVector(
                  part.direction,
                  inner * part.spread + (part.cap ? offset : 0),
                );
              if (part.magnet) {
                part.object.scale.setScalar(magnetWeight);
                part.object.visible = magnetWeight > 0.001;
              }
              part.object.updateMatrix();
            });
        });
      if (partsChanged) {
        model.core.scale.setScalar(1 + inner * 0.18);
        model.core.updateMatrix();
      }
      if (shapeChanged) {
        boundsDirty = optimizerDirty = true;
        renderer.shadowMap.needsUpdate = true;
      }
      model.caps.forEach((mesh, id) => {
        const mat = mesh.material as T.MeshPhysicalMaterial;
        mat.roughness = damp(mat.roughness, settings.roughness, 10, dt);
        mat.clearcoatRoughness = 0.07 + mat.roughness * 0.25;
        if (state.selected !== previousLayout?.selected)
          mat.emissive.set(state.selected.includes(id) ? '#3b4724' : '#000000');
        mat.emissiveIntensity = 0.2;
      });
      contact.material.opacity =
        defaults.render.contactOpacity / (1 + explode * 2);
      previousLayout = state;
      wasMoving = session.motion.moving;
      return (
        Math.abs(explode - settings.explode) +
          Math.abs(gap - settings.gap) +
          Math.abs(size - settings.size) +
          Math.abs(internal - settings.internal) +
          Math.abs(offset - settings.stickerOffset) +
          Math.abs(magnetWeight - (settings.showMagnets ? 1 : 0)) +
          Math.abs(
            (
              model.caps.values().next().value!
                .material as T.MeshPhysicalMaterial
            ).roughness - settings.roughness,
          ) >
        0.0001
      );
    }
    function updateBounds() {
      if (!boundsDirty) return;
      model.root.updateMatrixWorld();
      modelBounds.makeEmpty();
      for (const mesh of [...mechanics, ...caps])
        modelBounds.union(
          meshBounds
            .copy(mesh.geometry.boundingBox!)
            .applyMatrix4(mesh.matrixWorld),
        );
      modelBounds.getSize(surface);
      boundsDirty = false;
    }
    const previousLightRotation = new T.Quaternion(0, 0, 0, 0);
    let previousShadowRadius = -1;
    function render(now: number, dt: number) {
      if (disposed) return;
      session.motion.tick(now);
      updateArt();
      const transitioning = layout(now, dt),
        settings = session.state.settings;
      if (followFit) {
        fit(false);
        if (!transitioning) followFit = false;
      }
      if (cameraDestination) {
        const d = cameraDestination;
        transitionView(
          camera,
          target,
          d.position,
          d.target,
          d.orientation,
          1 - Math.exp(-dt * 7),
        );
        if (
          camera.position.distanceTo(d.position) < 0.002 &&
          target.distanceTo(d.target) < 0.002 &&
          camera.quaternion.angleTo(d.orientation) < 0.001
        ) {
          transitionView(
            camera,
            target,
            d.position,
            d.target,
            d.orientation,
            1,
          );
          cameraDestination = null;
        }
      }
      if (settings.autoRotate && !cameraDestination && !interactions.active)
        rotateView(camera, target, dt * defaults.camera.autoRotateSpeed, 0);
      rig.quaternion.slerp(
        lightRotation(
          settings.lightAzimuth,
          settings.lightElevation,
          settings.lightFollowCamera,
          camera.quaternion,
        ),
        1 - Math.exp(-10 * dt),
      );
      key.intensity = T.MathUtils.damp(
        key.intensity,
        settings.lightIntensity,
        10,
        dt,
      );
      fill.intensity =
        (key.intensity * STUDIO_DEFAULTS.fill.intensity) /
        STUDIO_DEFAULTS.key.intensity;
      rim.intensity =
        (key.intensity * STUDIO_DEFAULTS.rim.intensity) /
        STUDIO_DEFAULTS.key.intensity;
      scene.environmentRotation.setFromQuaternion(rig.quaternion);
      if (!previousLightRotation.equals(rig.quaternion)) {
        previousLightRotation.copy(rig.quaternion);
        rig.updateMatrix();
        renderer.shadowMap.needsUpdate = true;
      }
      camera.lookAt(target);
      camera.updateMatrixWorld();
      updateBounds();
      const box = modelBounds,
        floor = box.min.y - 0.065;
      const shadowRadius = Math.max(3, surface.length() / 2 + 0.5);
      if (shadowRadius !== previousShadowRadius) {
        previousShadowRadius = shadowRadius;
        key.shadow.camera.left = -shadowRadius;
        key.shadow.camera.right = shadowRadius;
        key.shadow.camera.top = shadowRadius;
        key.shadow.camera.bottom = -shadowRadius;
        key.shadow.camera.near = 0.1;
        key.shadow.camera.far = key.position.length() + shadowRadius * 2 + 4;
        key.shadow.camera.updateProjectionMatrix();
        renderer.shadowMap.needsUpdate = true;
      }
      ground.position.y = Math.min(
        floor,
        T.MathUtils.damp(ground.position.y, floor, 10, dt),
      );
      contact.position.set(
        (box.min.x + box.max.x) / 2,
        ground.position.y + 0.002,
        (box.min.z + box.max.z) / 2,
      );
      contact.scale.set(
        (surface.x * 1.65) / defaults.render.contactSize,
        (surface.z * 1.65) / defaults.render.contactSize,
        1,
      );
      ground.updateMatrix();
      contact.updateMatrix();
      scene.updateMatrixWorld();
      if (optimizerDirty) {
        optimizer.updateBounds();
        optimizerDirty = false;
      }
      updateDepthRange(camera, box);
      const maps = hiddenMaps.update(
        camera,
        target,
        session.state.view === 'hidden' && !session.state.presentation,
        dt,
      );
      const old = session.state.faceAnchors || {};
      if (JSON.stringify(old) !== JSON.stringify(maps.anchors))
        session.patch({ faceAnchors: maps.anchors });
      const minimalMoving = minimal.update(settings.minimal, dt);
      renderer.shadowMap.needsUpdate ||= minimal.changed;
      optimizer.prepareCamera(camera);
      renderer.render(scene, camera);
      if (!firstFrameReady && initialArtSettled) {
        firstFrameReady = true;
        setReady(true);
      }
      hiddenMaps.render(renderer, camera);
      const direction = camera.position.clone().sub(target).normalize(),
        hidden = def.faces
          .filter((f) => new T.Vector3(...f.normal).dot(direction) < -0.05)
          .map((f) => f.id);
      if (hidden.join('|') !== session.state.hiddenFaces.join('|'))
        session.patch({ hiddenFaces: hidden });
      if (
        session.motion.moving ||
        cameraDestination ||
        settings.autoRotate ||
        transitioning ||
        minimalMoving ||
        maps.moving ||
        Math.abs(ground.position.y - floor) > 0.0001 ||
        Math.abs(key.intensity - settings.lightIntensity) > 0.001 ||
        rig.quaternion.angleTo(
          lightRotation(
            settings.lightAzimuth,
            settings.lightElevation,
            settings.lightFollowCamera,
            camera.quaternion,
          ),
        ) > 0.001
      )
        invalidate();
    }
    let lastWidth = 0,
      lastHeight = 0,
      lastPixelRatio = 0;
    function resize() {
      const width = el.clientWidth,
        height = el.clientHeight;
      if (!width || !height) return;
      const ratio = pixelRatio(session.state.settings.quality);
      if (
        width === lastWidth &&
        height === lastHeight &&
        ratio === lastPixelRatio
      )
        return;
      const resized = lastWidth > 0;
      lastWidth = width;
      lastHeight = height;
      lastPixelRatio = ratio;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(ratio);
      renderer.setSize(width, height);
      if (resized) fit(false);
      invalidate();
    }
    function moveCamera(
      direction: T.Vector3,
      occupancy = defaults.camera.fitOccupancy,
      up = camera.up,
      objects: T.Object3D[] = [model.root],
      instant = false,
    ) {
      updateBounds();
      const box = new T.Box3();
      objects.forEach((object) =>
        box.union(
          object === model.root
            ? modelBounds
            : new T.Box3().setFromObject(object),
        ),
      );
      const center = box.getCenter(new T.Vector3()),
        distance = fitDistance(
          Object.assign(camera.clone(), { up: up.clone() }),
          box,
          direction,
          center,
          occupancy,
        ),
        position = center
          .clone()
          .addScaledVector(direction.clone().normalize(), distance),
        destination = camera.clone();
      destination.position.copy(position);
      destination.up.copy(up);
      destination.lookAt(center);
      cameraDestination = {
        position,
        target: center,
        orientation: destination.quaternion.clone(),
      };
      if (instant) {
        transitionView(
          camera,
          target,
          position,
          center,
          destination.quaternion,
          1,
        );
        cameraDestination = null;
      }
      invalidate();
    }
    function fit(reset = false, instant = false) {
      followFit =
        Math.abs(explode - session.state.settings.explode) +
          Math.abs(internal - session.state.settings.internal) >
        0.001;
      moveCamera(
        reset ? studio.initial.direction : camera.position.clone().sub(target),
        reset ? defaults.camera.occupancy : defaults.camera.fitOccupancy,
        reset ? studio.initial.up : camera.up,
        [model.root],
        instant,
      );
    }
    session.camera = {
      fit: () => fit(),
      reset: () => fit(true),
      focus: () => {
        const selected = session.state.selected[0],
          cap = selected ? model.caps.get(selected) : undefined;
        if (!cap) {
          session.notify('camera.select');
          return;
        }
        moveCamera(camera.position.clone().sub(target), 0.9, camera.up, [cap]);
      },
      face: (id) => {
        const face = def.faces.find((f) => f.id === id);
        if (face)
          moveCamera(
            new T.Vector3(...face.normal),
            defaults.camera.fitOccupancy,
            new T.Vector3(...face.up),
          );
      },
    };
    const interactions = createPuzzleInteraction({
      el,
      renderer,
      camera,
      target,
      session,
      hitObjects,
      optimizer,
      invalidate,
      cancelCamera: () => {
        cameraDestination = null;
      },
    });
    function contextLost(e: Event) {
      e.preventDefault();
      session.pause();
      session.motion.freeze();
      setError(true);
    }
    const canvas = renderer.domElement;
    canvas.addEventListener('webglcontextlost', contextLost);
    const lang = () => canvas.setAttribute('aria-label', t('camera.hint'));
    lang();
    i18n.on('languageChanged', lang);
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    let previousState = session.state;
    const unsubscribe = session.subscribe(() => {
      const state = session.state,
        before = previousState;
      previousState = state;
      if (state.settings.quality !== before.settings.quality) {
        art = -1;
        resize();
      }
      if (
        state.puzzle !== before.puzzle ||
        state.motionVersion !== before.motionVersion ||
        state.settings !== before.settings ||
        state.selected !== before.selected ||
        state.artVersion !== before.artVersion ||
        state.view !== before.view ||
        state.presentation !== before.presentation
      )
        invalidate();
    });
    updateArt();
    layout(performance.now(), 1);
    fit(true, true);
    invalidate();
    return () => {
      disposed = true;
      loop.dispose();
      unsubscribe();
      observer.disconnect();
      i18n.off('languageChanged', lang);
      session.motion.freeze();
      interactions.dispose();
      canvas.removeEventListener('webglcontextlost', contextLost);
      canvas.remove();
      hiddenMaps.dispose();
      optimizer.dispose();
      model.dispose();
      textures.forEach((texture) => texture.dispose());
      grain.dispose();
      studio.dispose();
      renderer.dispose();
      session.camera = {
        fit: () => {},
        reset: () => {},
        focus: () => {},
        face: () => {},
      };
    };
  }, [session]);
  return (
    <div className="viewport" ref={host}>
      {!ready && !error && <StudioLoading />}
      {error && <div className="fatal-error">{t('common.error')}</div>}
    </div>
  );
}
