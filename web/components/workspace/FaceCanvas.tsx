import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { bounds, hitTile, paintFace, path } from '@/lib/puzzle/appearance';
import { facePoint } from '@/lib/puzzle/geometry';
import { unfoldedNet } from '@/lib/puzzle/layout';
import { useSession, useFaceAnchors, type Session } from '@/lib/puzzle/session';
import { useTranslation } from '@/lib/i18n';

export function FaceCanvas({
  session,
  face,
  live = false,
  selectable = false,
}: {
  session: Session;
  face: string;
  live?: boolean;
  selectable?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    regions = useRef<{ id: string; path: Path2D }[]>([]),
    s = useSession(session),
    { t } = useTranslation();
  useEffect(() => {
    const target = canvas.current!,
      def = session.def,
      targetFace = def.faces.find((f) => f.id === face)!;
    let disposed = false,
      frame = 0;
    if (!live) {
      const next = document.createElement('canvas');
      void paintFace(next, def, face, s.appearance, s.selected, 640)
        .then(() => {
          if (disposed) return;
          target.width = next.width;
          target.height = next.height;
          target.getContext('2d')!.drawImage(next, 0, 0);
        })
        .catch(() => {});
      return () => {
        disposed = true;
      };
    }
    const sources = new Map<string, HTMLCanvasElement>();
    void Promise.all(
      def.faces.map(async (f) => {
        const source = document.createElement('canvas');
        await paintFace(source, def, f.id, s.appearance, [], 512);
        sources.set(f.id, source);
      }),
    )
      .then(() => {
        if (!disposed) draw();
      })
      .catch(() => {});
    function draw() {
      frame = 0;
      if (disposed) return;
      const settings = session.state.settings,
        outer = bounds(targetFace.outline),
        factor = 1 + settings.explode * 0.48,
        rect = {
          x: outer.x * factor,
          y: outer.y * factor,
          w: outer.w * factor,
          h: outer.h * factor,
        };
      if (target.width !== 400) {
        target.width = 400;
        target.height = Math.round((400 * outer.h) / outer.w);
      }
      const ctx = target.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, target.width, target.height);
      const scale = target.width / rect.w;
      ctx.setTransform(
        scale,
        0,
        0,
        -scale,
        -rect.x * scale,
        (rect.y + rect.h) * scale,
      );
      path(ctx, targetFace.outline);
      ctx.fillStyle = '#101315';
      ctx.fill();
      const right = new Vector3(...targetFace.right),
        up = new Vector3(...targetFace.up),
        normal = new Vector3(...targetFace.normal);
      const pieces = def.tiles
        .map((tile) => {
          const sourceFace = def.faces.find((f) => f.id === tile.face)!,
            pose = session.motion.pose(tile.piece),
            home = new Vector3(...def.pieces[tile.piece].home),
            radial = home.clone().normalize(),
            n = new Vector3(...sourceFace.normal).applyQuaternion(pose);
          const translation = home
            .clone()
            .multiplyScalar(1 - settings.size)
            .addScaledVector(
              radial,
              settings.explode * 0.7 + settings.gap * 1.5,
            )
            .addScaledVector(
              new Vector3(...sourceFace.normal),
              Math.max(0, settings.explode - 1) * settings.internal * 0.31 +
                settings.stickerOffset,
            )
            .applyQuaternion(pose);
          const center = new Vector3(...sourceFace.center)
              .multiplyScalar(settings.size)
              .applyQuaternion(pose)
              .add(translation),
            depth = center.dot(normal);
          return { tile, sourceFace, pose, n, center, depth };
        })
        .filter(
          (p) =>
            p.n.dot(normal) >
              (def.id === 'megaminx' ? 1 / Math.sqrt(5) + 0.001 : 0.16) &&
            p.depth > 0.45,
        )
        .sort((a, b) => a.depth - b.depth);
      regions.current = [];
      for (const { tile, sourceFace, pose, center } of pieces) {
        const x = new Vector3(...sourceFace.right)
            .applyQuaternion(pose)
            .multiplyScalar(settings.size),
          y = new Vector3(...sourceFace.up)
            .applyQuaternion(pose)
            .multiplyScalar(settings.size),
          source = sources.get(sourceFace.id)!;
        ctx.save();
        ctx.transform(
          x.dot(right),
          x.dot(up),
          y.dot(right),
          y.dot(up),
          center.dot(right),
          center.dot(up),
        );
        const outline = new Path2D();
        tile.outline.forEach(([x, y], i) =>
          i ? outline.lineTo(x, y) : outline.moveTo(x, y),
        );
        outline.closePath();
        const screen = new Path2D();
        screen.addPath(outline, ctx.getTransform());
        regions.current.push({ id: tile.id, path: screen });
        path(ctx, tile.outline);
        ctx.clip();
        const box = bounds(sourceFace.outline);
        ctx.save();
        ctx.scale(1, -1);
        ctx.drawImage(source, box.x, -box.y - box.h, box.w, box.h);
        ctx.restore();
        if (session.state.selected.includes(tile.id)) {
          ctx.strokeStyle = '#e7fac3';
          ctx.lineWidth = 0.025;
          ctx.stroke(outline);
        }
        ctx.restore();
      }
      if (session.motion.moving) frame = requestAnimationFrame(draw);
    }
    const unsubscribe = session.subscribe(() => {
      if (!frame && sources.size === def.faces.length)
        frame = requestAnimationFrame(draw);
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      unsubscribe();
    };
  }, [session, face, live, s.appearance, s.selected]);
  return (
    <canvas
      ref={canvas}
      className="puzzle-face-canvas"
      aria-label={t('puzzle.face', { face })}
      onClick={
        selectable || live
          ? (event) => {
              if (live) {
                const rect = event.currentTarget.getBoundingClientRect(),
                  x =
                    ((event.clientX - rect.left) / rect.width) *
                    event.currentTarget.width,
                  y =
                    ((event.clientY - rect.top) / rect.height) *
                    event.currentTarget.height,
                  ctx = event.currentTarget.getContext('2d')!;
                ctx.save();
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                const region = [...regions.current]
                  .reverse()
                  .find((r) => ctx.isPointInPath(r.path, x, y));
                ctx.restore();
                if (region) session.select(region.id);
                return;
              }
              const faceDef = session.def.faces.find((f) => f.id === face)!,
                box = bounds(faceDef.outline),
                rect = event.currentTarget.getBoundingClientRect(),
                x = box.x + ((event.clientX - rect.left) / rect.width) * box.w,
                y =
                  box.y +
                  box.h -
                  ((event.clientY - rect.top) / rect.height) * box.h;
              const tile = hitTile(session.def, face, x, y);
              if (tile) session.select(tile.id);
            }
          : undefined
      }
    />
  );
}
export function FaceMaps({ session }: { session: Session }) {
  const s = useSession(session),
    anchors = useFaceAnchors(session),
    { t } = useTranslation();
  if (s.view === 'normal' || s.presentation) return null;
  if (s.view === 'hidden')
    return (
      <div className="puzzle-hidden-labels">
        {Object.entries(anchors || {}).map(([face, anchor]) => (
          <button
            key={face}
            style={{
              left: anchor.x + '%',
              top: anchor.y + '%',
              opacity: anchor.opacity,
            }}
            onClick={() => session.camera.face(face)}
            aria-label={t('puzzle.face', { face })}
          >
            {face}
          </button>
        ))}
      </div>
    );
  if (s.view === 'net') {
    const layout = unfoldedNet(session.def),
      box = bounds(layout.flatMap((f) => f.points)),
      width = box.w + 0.15,
      height = box.h + 0.15;
    return (
      <svg
        className="puzzle-map-net"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-label={t('camera.net')}
      >
        {layout.map((item) => {
          const face = session.def.faces.find((f) => f.id === item.face)!,
            b = bounds(face.outline);
          return (
            <g
              key={item.face}
              transform={`translate(${item.x - box.x + 0.075} ${box.y + box.h - item.y + 0.075}) rotate(${(-item.angle * 180) / Math.PI})`}
            >
              <foreignObject x={b.x} y={-b.y - b.h} width={b.w} height={b.h}>
                <div className="puzzle-net-face">
                  <FaceCanvas session={session} face={item.face} live />
                  <button onClick={() => session.camera.face(item.face)}>
                    {item.face}
                  </button>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    );
  }
  const faces = session.def.faces;
  return (
    <div className={`puzzle-face-maps ${s.view}`} aria-label={t('camera.all')}>
      {faces.map((face) => (
        <div key={face.id}>
          <button onClick={() => session.camera.face(face.id)}>
            <i style={{ background: face.color }} />
            {face.id}
          </button>
          <FaceCanvas session={session} face={face.id} live />
        </div>
      ))}
    </div>
  );
}
