import { tx } from '@/lib/i18n';
import * as T from 'three';
import {
  rotateView,
  zoomView,
  type CameraDestination,
} from '../rendering/camera';
import { bindViewportEvents } from '../rendering/events';
import {
  isHierarchyVisible,
  type RenderOptimizer,
} from '../rendering/render-optimizer';
import { normals, vertices, type createModel } from './geometry';
import { heldAngle, turnsConflict } from './interaction';
import { ROTATIONS, dragCandidates, type Move } from './model';
import { type DragMotion } from './motion';
import { type createHiddenProjections } from './projection';
import {
  beginDrag,
  finishDrag,
  getState,
  notify,
  patch,
  releaseDrag,
  selectTile,
  settings,
} from './store';
export interface Drag extends DragMotion {
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

export function createPyraminxInteraction(options: {
  canvas: HTMLCanvasElement;
  camera: T.PerspectiveCamera;
  target: T.Vector3;
  model: ReturnType<typeof createModel>;
  projections: ReturnType<typeof createHiddenProjections>;
  optimizer: RenderOptimizer;
  invalidate: () => void;
  viewDirection: () => T.Vector3;
  moveCameraToFit: (direction: T.Vector3, object?: T.Object3D) => void;
  state: {
    drag: Drag | null;
    readonly warming: boolean;
    cameraDestination: CameraDestination | null;
    readonly width: number;
    readonly height: number;
  };
}) {
  const {
    canvas,
    camera,
    target,
    model,
    projections,
    optimizer,
    invalidate,
    viewDirection,
    moveCameraToFit,
    state,
  } = options;
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2();
  raycaster.layers.enable(1);
  const touches = new Map<number, T.Vector2>();
  function hit(e: PointerEvent | MouseEvent) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set(
      ((e.clientX - bounds.left) / state.width) * 2 - 1,
      (-(e.clientY - bounds.top) / state.height) * 2 + 1,
    );
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(pointer, camera);
    const physical = raycaster
      .intersectObjects(model.hits, false)
      .find(
        (h) =>
          (!getState().settings.minimal || h.object.userData.cap) &&
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
    return new T.Vector2((v.x * state.width) / 2, (-v.y * state.height) / 2);
  }
  function down(e: PointerEvent) {
    if (state.warming) return;
    if (getState().solving) return;
    if (getState().busy && !state.drag && !getState().settling) return;
    state.cameraDestination = null;
    canvas.setPointerCapture(e.pointerId);
    touches.set(e.pointerId, new T.Vector2(e.clientX, e.clientY));
    if (touches.size > 1) {
      if (state.drag?.move) finishDrag(state.drag.move, state.drag.angle);
      state.drag = null;
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
        (best, normal, i) => (normal.dot(n) > normals[best].dot(n) ? i : best),
        0,
      );
    } else if (face !== undefined && data)
      face = ROTATIONS[s.puzzle.rotations[data.piece]][face];
    state.drag = {
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
    const d = state.drag;
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
      const tangent = screen(rotated).sub(screen(d.point)).multiplyScalar(100);
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
    const d = state.drag;
    if (!d || d.pointer !== e.pointerId) return;
    state.drag = null;
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
        lookAt = state.cameraDestination?.target.clone() ?? target.clone();
      if (state.cameraDestination) {
        destination.position.copy(state.cameraDestination.position);
        destination.quaternion.copy(state.cameraDestination.orientation);
      }
      zoomView(
        destination,
        lookAt,
        Math.exp(T.MathUtils.clamp(e.deltaY, -500, 500) * 0.001),
      );
      state.cameraDestination = {
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

  return bindViewportEvents(canvas, {
    pointerdown: down,
    pointermove: move,
    pointerup: end,
    pointercancel: end,
    lostpointercapture: end,
    wheel,
    dblclick: doubleClick,
    contextmenu: context,
  });
}
