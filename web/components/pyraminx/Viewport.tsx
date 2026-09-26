import StudioLoading from '../workspace/StudioLoading';
import { magneticEase, stepMagnet } from '@/lib/cube/interaction';
import { i18n, tx, useLanguage } from '@/lib/i18n';
import { PUZZLE_DEFAULTS } from '@/lib/puzzle-config';
import { INITIAL_DIRECTION, INITIAL_UP } from '@/lib/pyraminx/camera';
import { createModel, normals, vertices } from '@/lib/pyraminx/geometry';
import {
  sameLayer,
  turnsConflict,
  visibleTurns,
} from '@/lib/pyraminx/interaction';
import { ROTATIONS, affects } from '@/lib/pyraminx/model';
import {
  SHAPE_SETTINGS,
  applyAlignment,
  applyPartialTurn,
  captureAlignment,
  rebaseTipAlignment,
  updateDragTransition,
  updateShapeTransition,
  type AlignmentPose,
} from '@/lib/pyraminx/motion';
import { FACE_BASES, createHiddenProjections } from '@/lib/pyraminx/projection';
import {
  cameraActions,
  finishDrag,
  getState,
  interruptSettling,
  notify,
  patch,
  setAlignmentAnimator,
  setAnimator,
  setSettlingReader,
  subscribe,
  type Animation,
  type State,
} from '@/lib/pyraminx/store';
import {
  createPyraminxInteraction,
  type Drag,
} from '@/lib/pyraminx/viewport-interaction';
import { createPyraminxSurface } from '@/lib/pyraminx/viewport-surface';
import {
  lightRotation,
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
export default memo(function PyraminxViewport() {
  useLanguage();
  const host = useRef<HTMLDivElement>(null),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const el = host.current!;
    let firstFrameReady = false;
    let renderer: T.WebGLRenderer;
    try {
      renderer = createRenderer('pyraminx');
    } catch {
      queueMicrotask(() => setError(tx('legacy.m403')));
      return;
    }
    let disposed = false,
      warming = true,
      drag: Drag | null = null;
    let animation:
      | (Animation & {
          start: number;
          angle: number;
          velocity: number;
          resolve: (angle: number) => void;
        })
      | null = null;
    const settlements: (Animation & {
      start: number;
      angle: number;
      velocity: number;
      resolve: (angle: number) => void;
    })[] = [];
    setSettlingReader(() =>
      settlements.map((a) => ({
        axis: a.move.axis,
        layer: a.move.layer,
        angle: a.angle,
        velocity: a.velocity,
        target: a.to,
      })),
    );
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
    const maps = document.createElement('canvas');
    maps.className = 'pyr-maps';
    const localizeCanvas = () => {
      canvas.setAttribute('aria-label', tx('legacy.m404'));
      maps.setAttribute('aria-label', tx('legacy.m405'));
    };
    localizeCanvas();
    i18n.on('languageChanged', localizeCanvas);
    el.append(canvas, maps);
    const defaults = PUZZLE_DEFAULTS.pyraminx;
    const studio = createStudio(renderer, 'pyraminx');
    const { scene, camera, target, rig: lights, key, contact: shadow } = studio;
    // Model matrices are updated by updateModel; camera-only frames need only
    // the light rig and contact plane, not another traversal of every piece.
    scene.matrixWorldAutoUpdate = false;
    const model = createModel(renderer.capabilities.getMaxAnisotropy());
    scene.add(model.root);
    const mechanics: T.Mesh[] = [];
    model.root.traverse((object) => {
      if (object instanceof T.Mesh && !object.userData.cap)
        mechanics.push(object);
    });
    const optimizer = createPuzzleOptimizer('pyraminx', mechanics, [
      ...model.tiles.values(),
    ]);
    attachOptimizer(renderer, scene, key, optimizer);
    const projections = createHiddenProjections(model.tiles, (face) =>
      cameraActions.face(face),
    );
    el.append(projections.labels);
    const rotation = new T.Quaternion();
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
    const loop = createFrameLoop(render),
      invalidate = loop.invalidate;
    const surface = createPyraminxSurface(
      model,
      maps,
      invalidate,
      () => disposed,
    );
    const { updateAppearance, drawMaps } = surface;
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
            p.z +
              Math.abs(p.x) /
                (tangent * camera.aspect * defaults.camera.fitOccupancy),
            p.z + Math.abs(p.y) / (tangent * defaults.camera.fitOccupancy),
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
        !settlements.length &&
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
      const pendingTurns = settlements.map((a) => ({
        ...a.move,
        angle: a.angle,
      }));
      for (const visible of visibleTurns(
        [
          ...s.partials.filter(
            (p) => !pendingTurns.some((a) => sameLayer(p, a)),
          ),
          ...pendingTurns,
        ],
        turn,
      )) {
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
    const minimal = new MinimalRenderer([scene], model.tiles.values());
    function render(time: number, dt: number) {
      if (disposed || warming) return;
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
      for (const a of [...settlements, ...(animation ? [animation] : [])]) {
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
        if (done) {
          if (a === animation) completed = a;
          else {
            settlements.splice(settlements.indexOf(a), 1);
            finishDrag(a.move, a.angle, true);
            a.resolve(a.angle);
          }
        }
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
        rotateView(camera, target, dt * defaults.camera.autoRotateSpeed, 0);
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
          (surfaceSize.x * 1.5) / defaults.render.contactSize,
          (surfaceSize.z * 1.5) / defaults.render.contactSize,
          1,
        );
        surfaceBoundsDirty = false;
      }
      shadow.material.opacity =
        defaults.render.contactOpacity / (1 + displayedSettings.explode);
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
      const minimalMoving = minimal.update(s.settings.minimal, dt);
      if (canvas.style.visibility !== 'hidden') {
        lights.updateMatrixWorld();
        shadow.updateMatrixWorld();
        optimizer.prepareCamera(camera);
        renderer.render(scene, camera);
        if (viewWeights.hidden > 0) {
          // Preserve the main model's depth so it occludes the auxiliary faces.
          renderOverlay(renderer, projections.scene, camera);
        }
      }
      maps.getContext('2d')!.clearRect(0, 0, width, height);
      maps.style.display =
        viewWeights.six + viewWeights.net > 0 ? 'block' : 'none';
      drawMaps(s, false, viewWeights.six, width, height);
      drawMaps(s, true, viewWeights.net, width, height);
      if (!firstFrameReady) {
        firstFrameReady = true;
        setReady(true);
      }
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
        settlements.length ||
        alignment ||
        drag?.transition ||
        cameraDestination ||
        shapeMoving ||
        viewMoving ||
        projectionsMoving ||
        minimalMoving ||
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
          const pending = {
            ...a,
            start: 0,
            angle: a.from,
            velocity: a.velocity ?? 0,
            resolve,
          };
          if (a.layerTurn) settlements.push(pending);
          else animation = pending;
          invalidate();
        }),
      (move) => {
        for (const a of [...settlements]) {
          if (
            move &&
            !sameLayer(a.move, move) &&
            !turnsConflict({ ...a.move, angle: a.angle }, move)
          )
            continue;
          settlements.splice(settlements.indexOf(a), 1);
          finishDrag(a.move, a.angle, true);
          a.resolve(a.angle);
        }
        updateModel();
      },
    );
    function sync() {
      const s = getState();
      if (previousState && previousState.puzzle !== s.puzzle) {
        for (const a of settlements)
          if (a.move.layer === 'tip') {
            const i = [0, 1, 2, 3].find(
              (i) =>
                ROTATIONS[previousState!.puzzle.rotations[i]][i] ===
                a.move.axis,
            )!;
            a.move = { ...a.move, axis: ROTATIONS[s.puzzle.rotations[i]][i] };
          }
      }
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
        renderer.setPixelRatio(pixelRatio(s.settings.quality));
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
    const disposeInteraction = createPyraminxInteraction({
      canvas,
      camera,
      target,
      model,
      projections,
      optimizer,
      invalidate,
      viewDirection,
      moveCameraToFit,
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
        get cameraDestination() {
          return cameraDestination;
        },
        set cameraDestination(value) {
          cameraDestination = value;
        },
        get width() {
          return width;
        },
        get height() {
          return height;
        },
      },
    });
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
    canvas.addEventListener('webglcontextlost', contextLost);
    model.update(getState());
    camera.position
      .copy(studio.initial.direction)
      .multiplyScalar(defaults.camera.distance);
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
      i18n.off('languageChanged', localizeCanvas);
      interruptSettling();
      disposed = true;
      loop.dispose();
      unsubscribe();
      observer.disconnect();
      disposeInteraction();
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
      canvas.removeEventListener('webglcontextlost', contextLost);
      const disposeResources = () => {
        optimizer.dispose();
        model.dispose();
        projections.dispose();
        surface.dispose();
        studio.dispose();
        renderer.dispose();
      };
      if (warming) void warmup.then(disposeResources);
      else disposeResources();
      el.replaceChildren();
    };
  }, []);
  return (
    <div className="viewport pyr-viewport" ref={host}>
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
