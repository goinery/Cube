import { tx } from '@/lib/i18n';
import * as T from 'three';
import { rotateView, zoomView } from '../rendering/camera';
import { bindViewportEvents } from '../rendering/events';
import {
  isHierarchyVisible,
  type RenderOptimizer,
} from '../rendering/render-optimizer';
import {
  alignedPartialForTurn,
  heldAngle,
  layerFace,
  magneticTarget,
} from './interaction';
import { moveSpec, type Vec } from './model';
import {
  allowMoves,
  beginAlignedDrag,
  finishLayerTurn,
  getState,
  notify,
  patch,
  pause,
  selectSticker,
  settings,
} from './store';
export interface Drag {
  face: string;
  axis: number;
  layers: number[];
  angle: number;
  targetAngle: number;
  transition?: {
    start: number;
    duration: number;
  };
  initialAngle: number;
  sx: number;
  sy: number;
  pixelsPerRadian: number;
  velocity: number;
  time: number;
}
export type LayerAnimation = {
  token: string;
  axis: number;
  layers: number[];
  from: number;
  to: number;
  magnetic?: boolean;
  layerTurn?: boolean;
  angle?: number;
  velocity?: number;
  start: number;
  duration: number;
  resolve: () => void;
};

export function createCubeInteraction(options: {
  el: HTMLElement;
  renderer: T.WebGLRenderer;
  camera: T.PerspectiveCamera;
  controls: { target: T.Vector3 };
  hitMeshes: T.Mesh[];
  optimizer: RenderOptimizer | null;
  settlements: LayerAnimation[];
  invalidate: () => void;
  prepareTurn: (token?: string) => void;
  moveCameraToFit: (direction: T.Vector3, objects?: T.Object3D[]) => void;
  cancelCamera: () => void;
  state: {
    drag: Drag | null;
    readonly warming: boolean;
    readonly animation: LayerAnimation | null;
  };
}) {
  const {
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
    cancelCamera,
    state,
  } = options;
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2();
  raycaster.layers.enable(1);
  let down: {
    x: number;
    y: number;
    id: number;
    hit?: T.Intersection<T.Object3D>;
    orbit: boolean;
    startX: number;
    startY: number;
    moved: boolean;
    blankTap: boolean;
  } | null = null;
  const activePointers = new Map<
    number,
    {
      x: number;
      y: number;
    }
  >();
  let pinch: {
    distance: number;
    x: number;
    y: number;
    angle: number;
  } | null = null;
  function pinchState() {
    const [a, b] = [...activePointers.values()];
    return {
      distance: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
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
    const visible = hitMeshes
      .filter((m) => !getState().settings.minimal || !m.userData.component)
      .filter(
        (m) => isHierarchyVisible(m) && (!optimizer || optimizer.isVisible(m)),
      );
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
    targetAngle = from,
  ) {
    const face = layerFace(axis, layer),
      magnetic = getState().settings.magnetStrength > 0,
      to = magnetic
        ? magneticTarget(targetAngle, velocity / 1000)
        : targetAngle;
    patch({ busy: false, dragging: false, currentMove: '' });
    settlements.push({
      token: face,
      axis,
      layers: [layer],
      from,
      to,
      angle: from,
      velocity,
      magnetic,
      layerTurn: true,
      start: performance.now(),
      duration: 120 / getState().settings.speed,
      resolve: () => {},
    });
    invalidate();
  }
  function finishDrag(cancelled = false) {
    if (!state.drag) return;
    const d = state.drag;
    state.drag = null;
    if (
      cancelled ||
      (getState().settings.magnetStrength === 0 && !d.transition)
    )
      finishLayerTurn(d.axis, d.layers[0], d.angle);
    else
      settleLayer(
        d.axis,
        d.layers[0],
        d.angle,
        d.velocity * 1000,
        d.targetAngle,
      );
  }
  function onDown(e: PointerEvent) {
    if (state.warming) return;
    invalidate();
    if (getState().solving) {
      e.stopImmediatePropagation();
      return;
    }
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size > 1) {
      finishDrag(true);
      down = null;
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
        e.button !== 0 ||
        e.shiftKey;
    if (s.busy && !state.animation?.layerTurn && !orbit) {
      e.stopImmediatePropagation();
      return;
    }
    down = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      hit,
      orbit,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      blankTap: s.presentation && !hit && e.button === 0,
    };
    renderer.domElement.setPointerCapture(e.pointerId);
    e.stopImmediatePropagation();
    cancelCamera();
  }
  function onMove(e: PointerEvent) {
    if (getState().solving) {
      e.stopImmediatePropagation();
      return;
    }
    if (activePointers.has(e.pointerId))
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (down || pinch) invalidate();
    if (activePointers.size > 1 && pinch) {
      const next = pinchState();
      zoomView(camera, controls.target, pinch.distance / next.distance);
      const twist = Math.atan2(
        Math.sin(next.angle - pinch.angle),
        Math.cos(next.angle - pinch.angle),
      );
      rotateView(
        camera,
        controls.target,
        (next.x - pinch.x) * 0.005,
        (next.y - pinch.y) * 0.005,
        twist,
      );
      pinch = next;
      cancelCamera();
      e.stopImmediatePropagation();
      return;
    }
    if (!down || down.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - down.startX, e.clientY - down.startY) >= 8)
      down.moved = true;
    if (down.orbit) {
      const dx = e.clientX - down.x,
        dy = e.clientY - down.y;
      rotateView(
        camera,
        controls.target,
        e.shiftKey ? 0 : dx * 0.005,
        e.shiftKey ? 0 : dy * 0.005,
        e.shiftKey ? dx * 0.005 : 0,
      );
      down.x = e.clientX;
      down.y = e.clientY;
      e.stopImmediatePropagation();
      return;
    }
    const dx = e.clientX - down.x,
      dy = e.clientY - down.y;
    let s = getState();
    if (
      s.mode === 'customize' ||
      s.mode === 'inspect' ||
      down.hit?.object.userData.mapping
    )
      return;
    if (!state.drag) {
      if (Math.hypot(dx, dy) < 5 || (s.busy && !state.animation?.layerTurn))
        return;
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
      prepareTurn(best.face);
      s = getState();
      if (!allowMoves([best.face])) {
        down = null;
        return;
      }
      const aligned = alignedPartialForTurn(
        s.partialTurns,
        best.face,
        s.settings.turnTolerance,
      );
      const needsAlignment = aligned !== s.partialTurns;
      if (needsAlignment && !beginAlignedDrag(best.face)) return;
      const spec = moveSpec(best.face);
      const initialAngle = heldAngle(aligned, best.axis, spec.layers[0]);
      state.drag = {
        face: best.face,
        axis: best.axis,
        layers: spec.layers,
        angle: initialAngle,
        targetAngle: initialAngle,
        transition: needsAlignment
          ? { start: performance.now(), duration: 120 / s.settings.speed }
          : undefined,
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
        currentMove: best.face + tx('legacy.m293'),
      });
    }
    const now = performance.now(),
      angle = T.MathUtils.clamp(
        state.drag.initialAngle +
          (dx * state.drag.sx + dy * state.drag.sy) /
            state.drag.pixelsPerRadian,
        -Math.PI * 2,
        Math.PI * 2,
      );
    state.drag.velocity =
      state.drag.velocity * 0.45 +
      ((angle - state.drag.targetAngle) / Math.max(8, now - state.drag.time)) *
        0.55;
    state.drag.time = now;
    state.drag.targetAngle = angle;
    if (!state.drag.transition) state.drag.angle = angle;
    e.stopImmediatePropagation();
  }
  function onUp(e: PointerEvent) {
    invalidate();
    activePointers.delete(e.pointerId);
    if (down && down.id !== e.pointerId) return;
    if (state.drag && down?.id === e.pointerId) {
      if (performance.now() - state.drag.time > 90) state.drag.velocity = 0;
      finishDrag();
    } else if (
      down?.blankTap &&
      !down.moved &&
      Math.hypot(e.clientX - down.startX, e.clientY - down.startY) < 8 &&
      getState().presentation &&
      !getState().solving &&
      !hitAt(e)
    ) {
      settings({ autoRotate: !getState().settings.autoRotate });
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
          tx('legacy.m294', {
            p0:
              p.kind === 'corner'
                ? tx('legacy.m146')
                : p.kind === 'edge'
                  ? tx('legacy.m147')
                  : tx('legacy.m148'),
            p1: id,
            p2: p.pos.join(' / '),
          }),
        );
      }
    } else if (
      down &&
      down.orbit &&
      !state.drag &&
      !down.moved &&
      Math.hypot(e.clientX - down.startX, e.clientY - down.startY) < 8 &&
      getState().selected.length &&
      !getState().solving
    ) {
      patch({ selected: [] });
    }
    down = null;
    pinch = null;
  }
  const cancel = () => {
    finishDrag(true);
    down = null;
    pinch = null;
    activePointers.clear();
    invalidate();
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
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (getState().solving) return;
    cancelCamera();
    const delta =
      e.deltaY *
      (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1);
    zoomView(
      camera,
      controls.target,
      Math.exp(T.MathUtils.clamp(delta * 0.001, -1, 1)),
    );
    invalidate();
  };
  const onContextMenu = (e: Event) => e.preventDefault();

  const dispose = bindViewportEvents(
    renderer.domElement,
    {
      wheel: onWheel,
      contextmenu: onContextMenu,
      dblclick: doubleClick,
      pointerdown: onDown,
      pointermove: onMove,
      pointerup: onUp,
      pointercancel: cancel,
      lostpointercapture: () => {
        if (activePointers.size) cancel();
      },
    },
    true,
  );
  return {
    settleLayer,
    get active() {
      return Boolean(down || pinch);
    },
    dispose,
  };
}
