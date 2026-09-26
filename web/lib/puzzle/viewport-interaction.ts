import * as T from 'three';
import { rotateView, zoomView } from '../rendering/camera';
import { bindViewportEvents } from '../rendering/events';
import type { RenderOptimizer } from '../rendering/render-optimizer';
import { moveSpec } from './model';
import type { Track } from './motion';
import type { Session } from './session';
export function createPuzzleInteraction(options: {
  el: HTMLElement;
  renderer: T.WebGLRenderer;
  camera: T.PerspectiveCamera;
  target: T.Vector3;
  session: Session;
  hitObjects: T.Mesh[];
  optimizer: RenderOptimizer;
  invalidate: () => void;
  cancelCamera: () => void;
}) {
  const {
    el,
    renderer,
    camera,
    target,
    session,
    hitObjects,
    optimizer,
    invalidate,
    cancelCamera,
  } = options;
  const def = session.def;
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2();
  raycaster.layers.enable(1);
  let drag: {
    track: Track;
    start: number;
    x: number;
    y: number;
    sx: number;
    sy: number;
    lastAngle: number;
    time: number;
  } | null = null;
  let down: {
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    hit: T.Intersection | null;
    orbit: boolean;
    moved: boolean;
  } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: {
    x: number;
    y: number;
    distance: number;
    angle: number;
  } | null = null;
  function hit(x: number, y: number) {
    const rect = el.getBoundingClientRect();
    pointer.set(
      ((x - rect.left) / rect.width) * 2 - 1,
      (-(y - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const visible = hitObjects.filter((object) => {
      if (session.state.settings.minimal && !object.userData.tile) return false;
      for (let p: T.Object3D | null = object; p; p = p.parent)
        if (!p.visible) return false;
      return optimizer.isVisible(object);
    });
    return (
      raycaster.intersectObjects(
        visible.filter((o) => o.userData.mapping),
        false,
      )[0] ??
      raycaster.intersectObjects(
        visible.filter((o) => !o.userData.mapping),
        false,
      )[0] ??
      null
    );
  }
  function pinchState() {
    const ps = [...pointers.values()];
    if (ps.length < 2) return null;
    return {
      x: (ps[0].x + ps[1].x) / 2,
      y: (ps[0].y + ps[1].y) / 2,
      distance: Math.hypot(ps[1].x - ps[0].x, ps[1].y - ps[0].y),
      angle: Math.atan2(ps[1].y - ps[0].y, ps[1].x - ps[0].x),
    };
  }
  function finish(cancel = false) {
    if (drag) {
      session.motion.release(drag.track, cancel);
      drag = null;
    }
    down = null;
    invalidate();
  }
  function onDown(e: PointerEvent) {
    if (session.state.solving) return;
    cancelCamera();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    renderer.domElement.setPointerCapture(e.pointerId);
    if (pointers.size > 1) {
      finish(true);
      pinch = pinchState();
      return;
    }
    const h = hit(e.clientX, e.clientY);
    down = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      hit: h,
      orbit:
        !h ||
        e.button !== 0 ||
        e.shiftKey ||
        ['camera', 'explode'].includes(session.state.mode),
      moved: false,
    };
    invalidate();
    e.preventDefault();
  }
  function onMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch) {
      const next = pinchState();
      if (next) {
        zoomView(camera, target, pinch.distance / Math.max(next.distance, 1));
        rotateView(
          camera,
          target,
          (next.x - pinch.x) * 0.005,
          (next.y - pinch.y) * 0.005,
          Math.atan2(
            Math.sin(next.angle - pinch.angle),
            Math.cos(next.angle - pinch.angle),
          ),
        );
        pinch = next;
        invalidate();
      }
      return;
    }
    if (!down || down.id !== e.pointerId) return;
    const dx = e.clientX - down.startX,
      dy = e.clientY - down.startY;
    if (Math.hypot(dx, dy) > 5) down.moved = true;
    if (down.orbit) {
      rotateView(
        camera,
        target,
        e.shiftKey ? 0 : (e.clientX - down.x) * 0.005,
        e.shiftKey ? 0 : (e.clientY - down.y) * 0.005,
        e.shiftKey ? (e.clientX - down.x) * 0.005 : 0,
      );
      down.x = e.clientX;
      down.y = e.clientY;
      invalidate();
      return;
    }
    if (
      session.state.mode !== 'play' ||
      !down.hit ||
      down.hit.object.userData.mapping
    )
      return;
    if (!drag && Math.hypot(dx, dy) > 5) {
      const piece = down.hit.object.userData.piece as number,
        position = down.hit.point,
        tile = def.tiles.find(
          (tile) => tile.id === down!.hit!.object.userData.tile,
        ),
        normal = tile
          ? new T.Vector3(
              ...def.faces.find((f) => f.id === tile.face)!.normal,
            ).transformDirection(down.hit.object.matrixWorld)
          : down.hit.face?.normal
              .clone()
              .transformDirection(down.hit.object.matrixWorld);
      let best: {
        score: number;
        token: string;
        sx: number;
        sy: number;
      } | null = null;
      for (const token of def.primitiveMoves) {
        const move = moveSpec(def, token);
        if (
          !move.affects(piece, session.state.puzzle.rotations[piece]) ||
          (normal && Math.abs(normal.dot(new T.Vector3(...move.axis))) > 0.97)
        )
          continue;
        const tangent = new T.Vector3(...move.axis).cross(position),
          a = position.clone().project(camera),
          b = position.clone().addScaledVector(tangent, 0.01).project(camera),
          sx = ((b.x - a.x) * el.clientWidth) / 2 / 0.01,
          sy = (-(b.y - a.y) * el.clientHeight) / 2 / 0.01,
          pixels = Math.hypot(sx, sy);
        if (pixels < 12) continue;
        const score = Math.abs(dx * sx + dy * sy) / pixels;
        if (!best || score > best.score) best = { score, token, sx, sy };
      }
      if (best) {
        session.pause();
        session.patch({ player: null });
        const track = session.motion.beginDrag(best.token);
        if (!track) {
          session.notify('motion.outOfTolerance', {
            degrees: session.state.settings.turnTolerance,
          });
          down = null;
          return;
        }
        drag = {
          track,
          start: track.angle,
          x: down.startX,
          y: down.startY,
          sx: best.sx,
          sy: best.sy,
          lastAngle: track.angle,
          time: performance.now(),
        };
      }
    }
    if (drag) {
      const now = performance.now(),
        angle =
          drag.start +
          ((e.clientX - drag.x) * drag.sx + (e.clientY - drag.y) * drag.sy) /
            (drag.sx * drag.sx + drag.sy * drag.sy),
        velocity =
          (angle - drag.lastAngle) / Math.max(0.005, (now - drag.time) / 1000);
      session.motion.drag(drag.track, angle, velocity);
      drag.lastAngle = angle;
      drag.time = now;
      invalidate();
    }
  }
  function onUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      down = null;
      invalidate();
      return;
    }
    if (down && !down.moved && !drag) {
      const tile = down.hit?.object.userData.tile;
      if (tile && ['customize', 'inspect'].includes(session.state.mode))
        session.select(tile);
      else if (!down.hit) {
        if (session.state.presentation)
          session.settings({
            autoRotate: !session.state.settings.autoRotate,
          });
        else session.patch({ selected: [] });
      }
    }
    finish(e.type === 'pointercancel');
  }
  function wheel(e: WheelEvent) {
    e.preventDefault();
    cancelCamera();
    zoomView(camera, target, Math.exp(e.deltaY * 0.001));
    invalidate();
  }
  function double(e: MouseEvent) {
    const h = hit(e.clientX, e.clientY),
      tile = h?.object.userData.tile;
    if (tile) {
      session.select(tile, false);
      session.camera.focus();
    }
  }
  function context(e: Event) {
    e.preventDefault();
  }
  function lostCapture(e: PointerEvent) {
    if (pointers.has(e.pointerId)) {
      pointers.delete(e.pointerId);
      finish(true);
    }
  }

  const dispose = bindViewportEvents(renderer.domElement, {
    pointerdown: onDown,
    pointermove: onMove,
    pointerup: onUp,
    pointercancel: onUp,
    lostpointercapture: lostCapture,
    wheel,
    dblclick: double,
    contextmenu: context,
  });
  return {
    get active() {
      return Boolean(drag || down || pinch);
    },
    dispose,
  };
}
