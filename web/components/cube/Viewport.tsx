'use client';
import StudioLoading from '../workspace/StudioLoading';
import { fitDistance, heldAngle, stepMagnet } from '@/lib/cube/interaction';
import { FACE, moveSpec, type Vec } from '@/lib/cube/model';
import {
  cameraActions,
  finishLayerTurn,
  getState,
  notify,
  patch,
  setAlignmentAnimator,
  setAnimator,
  setSettlingReader,
  subscribe,
} from '@/lib/cube/store';
import {
  createCubeInteraction,
  type Drag,
  type LayerAnimation,
} from '@/lib/cube/viewport-interaction';
import { basisQuaternion, createCubeLayout } from '@/lib/cube/viewport-layout';
import { createCubeModel } from '@/lib/cube/viewport-model';
import { createCubeSurface } from '@/lib/cube/viewport-surface';
import { i18n, tx, useLanguage } from '@/lib/i18n';
import { PUZZLE_DEFAULTS, STUDIO_DEFAULTS } from '@/lib/puzzle-config';
import {
  lightDirection,
  lightRotation,
  PRODUCT_DIRECTION,
  PRODUCT_OCCUPANCY,
  rotateView,
  transitionView,
  updateDepthRange,
} from '@/lib/rendering/camera';
import { createFrameLoop } from '@/lib/rendering/frame-loop';
import { MinimalRenderer } from '@/lib/rendering/minimal';
import {
  attachOptimizer,
  createPuzzleOptimizer,
  createRenderer,
  createStudio,
  pixelRatio,
  renderOverlay,
} from '@/lib/rendering/viewport';
import { warmRenderer } from '@/lib/rendering/warmup';
import { memo, useEffect, useRef, useState } from 'react';
import * as T from 'three';
const v3 = (v: Vec) => new T.Vector3(...v);
export default memo(function Viewport() {
  useLanguage();
  const host = useRef<HTMLDivElement>(null),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const el = host.current!;
    let disposed = false,
      warming = true;
    let firstFrameReady = false;
    let renderer: T.WebGLRenderer;
    try {
      renderer = createRenderer('cube');
    } catch {
      queueMicrotask(() => setError(tx('legacy.m289')));
      return;
    }
    const loop = createFrameLoop(render),
      invalidate = loop.invalidate;
    const defaults = PUZZLE_DEFAULTS.cube;
    const mobile = matchMedia(
      `(max-width: ${STUDIO_DEFAULTS.mobileWidth}px)`,
    ).matches;
    const localizeCanvas = () =>
      renderer.domElement.setAttribute('aria-label', tx('legacy.m290'));
    localizeCanvas();
    i18n.on('languageChanged', localizeCanvas);
    el.appendChild(renderer.domElement);
    const studio = createStudio(renderer, 'cube');
    const {
      scene,
      camera,
      key,
      fill,
      rim,
      ground,
      contact: contactShadow,
    } = studio;
    const controls = {
      target: studio.target,
      update: () => {
        camera.lookAt(controls.target);
        camera.updateMatrixWorld(true);
      },
    };
    const model = createCubeModel(
      getState().cube,
      renderer.capabilities.getMaxAnisotropy(),
    );
    scene.add(model.root);
    const { models, stickers, hitMeshes, core } = model;
    const targetOrientation = new T.Quaternion();
    const identityRotation = new T.Quaternion();
    let alignment: {
      rotations: Map<string, T.Quaternion>;
      progress: number;
      start: number;
      duration: number;
      resolve: () => void;
    } | null = null;
    setAlignmentAnimator(
      (partial) =>
        new Promise<void>((resolve) => {
          const rotations = new Map<string, T.Quaternion>();
          const axis = new T.Vector3().setComponent(partial.axis, 1);
          for (const piece of getState().cube) {
            const basis = basisQuaternion(piece);
            const rotation = basis
              .clone()
              .invert()
              .multiply(
                new T.Quaternion().setFromAxisAngle(
                  axis,
                  heldAngle(partial, partial.axis, piece.pos[partial.axis]),
                ),
              )
              .multiply(basis);
            const previous = alignment?.rotations.get(piece.id);
            if (previous)
              rotation.multiply(
                previous.clone().slerp(identityRotation, alignment!.progress),
              );
            rotations.set(piece.id, rotation);
          }
          alignment?.resolve();
          alignment = {
            rotations,
            progress: 0,
            start: performance.now(),
            duration:
              (160 + Math.max(...partial.angles.map(Math.abs)) * 90) /
              getState().settings.speed,
            resolve,
          };
          invalidate();
        }),
    );
    let currentExplode = getState().settings.explode,
      targetCamera: T.Vector3 | null = null,
      targetLookAt: T.Vector3 | null = null,
      animation: LayerAnimation | null = null;
    const settlements: LayerAnimation[] = [];
    setSettlingReader(() =>
      settlements.map((a) => ({
        axis: a.axis,
        layer: a.layers[0],
        angle: a.angle!,
        velocity: a.velocity!,
        target: a.to,
      })),
    );
    function prepareTurn(token?: string) {
      const spec = token ? moveSpec(token) : null;
      for (const a of [...settlements]) {
        if (
          spec &&
          (spec.layers.length === 3 ||
            (spec.axis === a.axis && !spec.layers.includes(a.layers[0])))
        )
          continue;
        settlements.splice(settlements.indexOf(a), 1);
        finishLayerTurn(a.axis, a.layers[0], a.angle!, true);
      }
    }
    let drag: Drag | null = null;
    const surface = createCubeSurface(
      model,
      renderer,
      invalidate,
      () => disposed,
    );
    const { mappingScene, selectedOutlines, updateArt } = surface;
    const optimizationOff =
      import.meta.env.DEV &&
      new URLSearchParams(location.search).get('renderOptimization') === 'off';
    const mechanicalMeshes: T.Mesh[] = [];
    for (const model of models.values())
      model.root.traverse((object) => {
        if (object instanceof T.Mesh && object.userData.component)
          mechanicalMeshes.push(object);
      });
    core.traverse((object) => {
      if (object instanceof T.Mesh) mechanicalMeshes.push(object);
    });
    const optimizer = optimizationOff
      ? null
      : createPuzzleOptimizer('cube', mechanicalMeshes, [...stickers.values()]);
    attachOptimizer(renderer, scene, key, optimizer);
    // Fixed mechanical details keep their local matrices until layout changes.
    scene.traverse((object) => {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
    });
    scene.matrixWorldAutoUpdate = false;
    let previousState = getState();
    const unsub = subscribe(() => {
      const s = getState();
      if (s.cube !== previousState.cube && settlements.length) {
        for (const a of settlements) {
          const before = previousState.cube.find(
            (p) => p.pos[a.axis] === a.layers[0],
          )!;
          const after = s.cube.find((p) => p.id === before.id)!;
          const delta = basisQuaternion(after).multiply(
            basisQuaternion(before).invert(),
          );
          const v = new T.Vector3()
            .setComponent(a.axis, 1)
            .applyQuaternion(delta);
          const axis = v.toArray().findIndex((x) => Math.abs(x) > 0.99);
          if (axis >= 0) {
            const sign = Math.sign(v.getComponent(axis));
            a.axis = axis;
            a.layers = [a.layers[0] * sign];
            a.angle! *= sign;
            a.to *= sign;
            a.velocity! *= sign;
          }
        }
      }
      if (s.artVersion !== surface.artVersion) void updateArt();
      if (s.selected !== previousState.selected)
        optimizer?.invalidateVisibility();
      if (s.selected !== previousState.selected)
        for (const [id, o] of selectedOutlines)
          o.visible = s.selected.includes(id);
      if (
        s.cube !== previousState.cube ||
        s.partialTurns !== previousState.partialTurns ||
        s.settings !== previousState.settings ||
        s.selected !== previousState.selected ||
        s.view !== previousState.view ||
        s.presentation !== previousState.presentation ||
        s.solving !== previousState.solving ||
        s.busy !== previousState.busy
      )
        invalidate();
      previousState = s;
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
          invalidate();
        }),
      prepareTurn,
    );
    let boundsDirty = true,
      optimizerBoundsDirty = true;
    const updateLayout = createCubeLayout(model);
    function layoutPieces(explode: number) {
      const changed = updateLayout(
        explode,
        Boolean(animation || settlements.length || drag || alignment),
      );
      if (changed) {
        boundsDirty = optimizerBoundsDirty = true;
        renderer.shadowMap.needsUpdate = true;
      }
      return changed;
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
    function moveCameraToFit(
      direction: T.Vector3,
      objects?: T.Object3D[],
      occupancy = defaults.camera.fitOccupancy,
      up = camera.up,
    ) {
      if (getState().solving) return;
      layoutPieces(getState().settings.explode);
      const box = boundsOf(objects || [...models.values()].map((m) => m.root)),
        target = box.getCenter(new T.Vector3()),
        distance = fitDistance(
          Object.assign(camera.clone(), { up: up.clone() }),
          box,
          direction,
          target,
          objects?.length === 1 ? 0.9 : occupancy,
        );
      targetLookAt = target;
      targetCamera = target
        .clone()
        .addScaledVector(direction.clone().normalize(), distance);
      const destination = camera.clone();
      destination.position.copy(targetCamera);
      destination.up.copy(up);
      destination.lookAt(target);
      targetOrientation.copy(destination.quaternion);
      invalidate();
    }
    cameraActions.fit = () => {
      moveCameraToFit(camera.position.clone().sub(controls.target));
    };
    cameraActions.reset = () => {
      if (getState().solving) return;
      moveCameraToFit(
        PRODUCT_DIRECTION,
        undefined,
        PRODUCT_OCCUPANCY,
        studio.initial.up,
      );
    };
    cameraActions.face = (face) => {
      if (getState().solving) return;
      moveCameraToFit(
        v3(FACE[face].n),
        undefined,
        defaults.camera.fitOccupancy,
        v3(FACE[face].u),
      );
    };
    cameraActions.focus = () => {
      const id = getState().selected[0],
        mesh = id ? stickers.get(id) : undefined;
      if (!mesh) {
        notify(tx('legacy.m291'));
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
      invalidate();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    cameraActions.reset();
    if (targetCamera) {
      camera.position.copy(targetCamera);
      camera.up.set(0, 1, 0).applyQuaternion(targetOrientation);
      controls.target.copy(targetLookAt!);
      targetCamera = null;
      targetLookAt = null;
      controls.update();
    }
    const interactions = createCubeInteraction({
      el,
      renderer,
      camera,
      controls,
      hitMeshes,
      optimizer,
      settlements,
      invalidate,
      prepareTurn,
      moveCameraToFit,
      cancelCamera: () => {
        targetCamera = targetLookAt = null;
      },
      state: {
        get drag() {
          return drag;
        },
        set drag(value) {
          drag = value;
        },
        get warming() {
          return warming;
        },
        get animation() {
          return animation;
        },
      },
    });
    let lastQuality = '',
      previousShadowExtent = -1;
    const surfaceBounds = new T.Box3(),
      capBounds = new T.Box3();
    const surfaceSize = new T.Vector3();
    const defaultLightDirection = lightDirection(
      STUDIO_DEFAULTS.key.azimuth,
      STUDIO_DEFAULTS.key.elevation,
    );
    const studioRotation = new T.Quaternion();
    const previousStudioRotation = new T.Quaternion(0, 0, 0, 0);
    const lampDistance = STUDIO_DEFAULTS.key.distance;
    const turnAxis = new T.Vector3(),
      turnRotation = new T.Quaternion(),
      localAlignment = new T.Quaternion(),
      inverseOrientation = new T.Quaternion();
    let coreInner = NaN,
      coreMagnets: boolean | undefined;
    const minimal = new MinimalRenderer([scene], stickers.values());
    function render(now: number, dt: number) {
      if (disposed || warming) return;
      for (const a of [...settlements]) {
        const settings = getState().settings;
        const t = T.MathUtils.smoothstep(now, a.start, a.start + a.duration);
        const next = a.magnetic
          ? stepMagnet(
              a.angle!,
              a.velocity!,
              a.to,
              dt,
              settings.magnetStrength,
              settings.magnetDamping,
            )
          : { angle: T.MathUtils.lerp(a.from, a.to, t), velocity: 0 };
        a.angle = next.angle;
        a.velocity = next.velocity;
        if (
          (a.magnetic && settings.magnetStrength === 0) ||
          (Math.abs(a.angle - a.to) < 0.0001 && Math.abs(a.velocity) < 0.003)
        ) {
          settlements.splice(settlements.indexOf(a), 1);
          finishLayerTurn(
            a.axis,
            a.layers[0],
            settings.magnetStrength === 0 ? a.angle : a.to,
            true,
          );
        }
      }
      const s = getState();
      if (
        !animation &&
        !settlements.length &&
        !alignment &&
        !drag &&
        !interactions.active &&
        !s.busy &&
        !s.solving &&
        s.settings.magnetStrength > 0 &&
        s.partialTurns
      ) {
        const index = s.partialTurns.angles.findIndex((angle) => angle !== 0);
        if (index >= 0)
          interactions.settleLayer(
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
      if (Math.abs(currentExplode - s.settings.explode) < 0.000001)
        currentExplode = s.settings.explode;
      const inner = Math.max(0, currentExplode - 1) * s.settings.internal;
      const shapeChanged = layoutPieces(currentExplode);
      core.visible = true;
      if (inner !== coreInner || s.settings.showMagnets !== coreMagnets)
        core.children.forEach((object) => {
          const base = object.userData.base as T.Vector3;
          object.position.copy(base).multiplyScalar(1 + inner * 0.28);
          if (object.userData.magnet) object.visible = s.settings.showMagnets;
          object.updateMatrix();
        });
      coreInner = inner;
      coreMagnets = s.settings.showMagnets;
      for (const a of settlements) {
        const angle = a.angle! - heldAngle(s.partialTurns, a.axis, a.layers[0]);
        turnRotation.setFromAxisAngle(
          turnAxis.set(0, 0, 0).setComponent(a.axis, 1),
          angle,
        );
        for (const p of s.cube)
          if (a.layers.includes(p.pos[a.axis])) {
            const root = models.get(p.id)!.root;
            root.position.applyQuaternion(turnRotation);
            root.quaternion.premultiply(turnRotation);
            root.updateMatrix();
          }
      }
      if (alignment) {
        const a = alignment;
        const t = Math.min(1, (now - a.start) / a.duration);
        a.progress = t * t * (3 - 2 * t);
        for (const piece of s.cube) {
          const rotation = a.rotations.get(piece.id);
          if (!rotation) continue;
          const root = models.get(piece.id)!.root;
          // Local offsets follow a piece even when another layer commits mid-snap.
          localAlignment.copy(rotation).slerp(identityRotation, a.progress);
          inverseOrientation.copy(root.quaternion).invert();
          turnRotation
            .copy(root.quaternion)
            .multiply(localAlignment)
            .multiply(inverseOrientation);
          root.position.applyQuaternion(turnRotation);
          root.quaternion.multiply(localAlignment);
          root.updateMatrix();
        }
        if (t === 1) {
          alignment = null;
          a.resolve();
        }
      }
      if (drag?.transition) {
        const { start, duration } = drag.transition;
        const t = T.MathUtils.smoothstep(now, start, start + duration);
        drag.angle = T.MathUtils.lerp(drag.initialAngle, drag.targetAngle, t);
        if (t === 1) drag.transition = undefined;
      }
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
            a.angle = angle = a.from + (a.to - a.from) * t;
            if (raw === 1) {
              animation = null;
              a.resolve();
            }
          }
        }
        if (drag || a?.layerTurn)
          angle -= heldAngle(s.partialTurns, axis, layers[0]);
        const q = turnRotation.setFromAxisAngle(
          turnAxis.set(0, 0, 0).setComponent(axis, 1),
          angle,
        );
        for (const p of s.cube)
          if (layers.includes(p.pos[axis])) {
            const root = models.get(p.id)!.root;
            root.position.applyQuaternion(q);
            root.quaternion.premultiply(q);
            root.updateMatrix();
          }
      }
      if (s.solving) {
        targetCamera = null;
        targetLookAt = null;
      }
      if (targetCamera && targetLookAt) {
        transitionView(
          camera,
          controls.target,
          targetCamera,
          targetLookAt,
          targetOrientation,
          1 - Math.exp(-dt * 7),
        );
        if (
          camera.position.distanceTo(targetCamera) < 0.002 &&
          camera.quaternion.angleTo(targetOrientation) < 0.001
        ) {
          transitionView(
            camera,
            controls.target,
            targetCamera,
            targetLookAt,
            targetOrientation,
            1,
          );
          targetCamera = targetLookAt = null;
        }
      }
      if (
        s.settings.autoRotate &&
        !animation &&
        !settlements.length &&
        !alignment &&
        !drag &&
        !interactions.active &&
        !s.solving
      )
        rotateView(
          camera,
          controls.target,
          dt * defaults.camera.autoRotateSpeed,
          0,
        );
      controls.update();
      scene.updateMatrixWorld();
      if (boundsDirty) {
        surfaceBounds.makeEmpty();
        for (const mesh of stickers.values())
          surfaceBounds.union(
            capBounds
              .copy(mesh.geometry.boundingBox!)
              .applyMatrix4(mesh.matrixWorld),
          );
        boundsDirty = false;
      }
      const floorHeight = surfaceBounds.min.y - 0.065;
      updateDepthRange(camera, surfaceBounds);
      ground.position.y = Math.min(
        floorHeight,
        T.MathUtils.damp(ground.position.y, floorHeight, 10, dt),
      );
      if (Math.abs(ground.position.y - floorHeight) < 0.000001)
        ground.position.y = floorHeight;
      ground.updateMatrix();
      surfaceBounds.getSize(surfaceSize);
      contactShadow.position.set(
        (surfaceBounds.min.x + surfaceBounds.max.x) / 2,
        ground.position.y + 0.002,
        (surfaceBounds.min.z + surfaceBounds.max.z) / 2,
      );
      contactShadow.scale.set(surfaceSize.x * 1.65, surfaceSize.z * 1.65, 1);
      contactShadow.material.opacity =
        defaults.render.contactOpacity / (1 + currentExplode * 2);
      contactShadow.updateMatrix();
      const shadowExtent = Math.max(2, surfaceSize.length() * 0.62);
      studioRotation.copy(
        lightRotation(
          s.settings.lightAzimuth,
          s.settings.lightElevation,
          s.settings.lightFollowCamera,
          camera.quaternion,
        ),
      );
      key.position
        .copy(defaultLightDirection)
        .applyQuaternion(studioRotation)
        .multiplyScalar(lampDistance);
      key.target.position.set(0, 0, 0);
      key.intensity = s.settings.lightIntensity;
      rim.position
        .set(...STUDIO_DEFAULTS.rim.position)
        .applyQuaternion(studioRotation);
      fill.position
        .set(...STUDIO_DEFAULTS.fill.position)
        .applyQuaternion(studioRotation);
      key.updateMatrix();
      rim.updateMatrix();
      fill.updateMatrix();
      rim.intensity =
        (s.settings.lightIntensity * STUDIO_DEFAULTS.rim.intensity) /
        STUDIO_DEFAULTS.key.intensity;
      fill.intensity =
        (s.settings.lightIntensity * STUDIO_DEFAULTS.fill.intensity) /
        STUDIO_DEFAULTS.key.intensity;
      scene.environmentRotation.setFromQuaternion(studioRotation);
      const shadowCamera = key.shadow.camera;
      if (shadowExtent !== previousShadowExtent) {
        shadowCamera.left = shadowCamera.bottom = -shadowExtent;
        shadowCamera.right = shadowCamera.top = shadowExtent;
        shadowCamera.near = Math.max(0.1, lampDistance - shadowExtent * 2);
        shadowCamera.far = lampDistance + shadowExtent * 2;
        shadowCamera.updateProjectionMatrix();
        previousShadowExtent = shadowExtent;
        renderer.shadowMap.needsUpdate = true;
      }
      if (shapeChanged || !studioRotation.equals(previousStudioRotation))
        renderer.shadowMap.needsUpdate = true;
      previousStudioRotation.copy(studioRotation);
      key.shadow.radius =
        s.settings.quality === 'low'
          ? STUDIO_DEFAULTS.shadow.lowRadius
          : STUDIO_DEFAULTS.shadow.radius;
      surface.updateProjections(s, camera, controls.target, currentExplode);
      if (lastQuality !== s.settings.quality) {
        lastQuality = s.settings.quality;
        const shadowSize =
          s.settings.quality === 'low'
            ? defaults.render.lowShadowResolution
            : s.settings.quality === 'high'
              ? defaults.render.shadowResolution
              : mobile
                ? defaults.render.mobileShadowResolution
                : defaults.render.shadowResolution;
        if (key.shadow.mapSize.x !== shadowSize) {
          key.shadow.mapSize.set(shadowSize, shadowSize);
          key.shadow.map?.dispose();
          key.shadow.map = null;
          renderer.shadowMap.needsUpdate = true;
        }
        renderer.setPixelRatio(pixelRatio(s.settings.quality, mobile));
      }
      scene.updateMatrixWorld();
      if (optimizer) {
        if (optimizerBoundsDirty) {
          optimizer.updateBounds();
          optimizerBoundsDirty = false;
        }
        optimizer.prepareCamera(camera);
      }
      const minimalMoving = minimal.update(s.settings.minimal, dt);
      renderer.shadowMap.needsUpdate ||= minimal.changed;
      renderer.render(scene, camera);
      if (!firstFrameReady) {
        firstFrameReady = true;
        setReady(true);
      }
      if (s.view === 'hidden' && !s.presentation) {
        renderOverlay(renderer, mappingScene, camera);
      }
      if (
        animation ||
        settlements.length ||
        alignment ||
        drag?.transition ||
        targetCamera ||
        minimalMoving ||
        currentExplode !== s.settings.explode ||
        ground.position.y !== floorHeight ||
        (s.settings.autoRotate && !drag && !interactions.active && !s.solving)
      )
        invalidate();
    }
    patch({ ready: false });
    const warmup = updateArt()
      .then(() => {
        if (!disposed)
          return warmRenderer(
            renderer,
            scene,
            camera,
            optimizer,
            mappingScene,
            () => disposed,
          );
      })
      .then(() => {
        warming = false;
        if (disposed) return;
        optimizerBoundsDirty = true;
        patch({ ready: true });
        invalidate();
      })
      .catch(() => {
        warming = false;
        if (!disposed) setError(tx('legacy.m295'));
      });
    const loss = (e: Event) => {
      e.preventDefault();
      setError(tx('legacy.m296'));
    };
    renderer.domElement.addEventListener('webglcontextlost', loss);
    return () => {
      i18n.off('languageChanged', localizeCanvas);
      prepareTurn();
      disposed = true;
      alignment?.resolve();
      setAlignmentAnimator(async () => {});
      loop.dispose();
      if (animation?.layerTurn)
        finishLayerTurn(animation.axis, animation.layers[0], animation.angle!);
      else animation?.resolve();
      setAnimator(async () => {});
      setSettlingReader(() => []);
      unsub();
      patch({ ready: false });
      observer.disconnect();
      interactions.dispose();
      if (drag) patch({ busy: false, dragging: false, currentMove: '' });
      renderer.domElement.removeEventListener('webglcontextlost', loss);
      const disposeResources = () => {
        model.dispose();
        surface.dispose();
        optimizer?.dispose();
        studio.dispose();
        renderer.dispose();
      };
      if (warming) void warmup.then(disposeResources);
      else disposeResources();
      el.replaceChildren();
    };
  }, []);
  return (
    <div ref={host} className="viewport">
      {!ready && !error && <StudioLoading />}
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
