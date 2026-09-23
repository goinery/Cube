'use client';
import { tx, useLanguage } from '@/lib/i18n';
import { memo, useEffect, useRef, useMemo } from 'react';
import {
  FACE,
  FACES,
  facelets,
  solved,
  type Face,
  type Facelet,
} from '@/lib/cube/model';
import {
  paintSticker,
  sameStickerArt,
  type Appearance,
} from '@/lib/cube/appearance';
import { useCube, selectSticker, cameraActions } from '@/lib/cube/store';
import { tileRadii } from '@/lib/cube/geometry';
export function StickerTile({
  item,
  onSelect,
  selected = false,
}: {
  item: Facelet;
  onSelect: () => void;
  selected?: boolean;
}) {
  useLanguage();
  const s = useCube('appearance'),
    canvas = useRef<HTMLCanvasElement>(null),
    painted = useRef<{
      id: string;
      appearance: Appearance;
    } | null>(null);
  const radii = tileRadii(item.sticker.row, item.sticker.col);
  const quarter = ((Math.round(item.angle / 90) % 4) + 4) % 4;
  const borderRadius = radii
    .map((_, i) => `${radii[(i - quarter + 4) % 4] * 100}%`)
    .join(' ');
  useEffect(() => {
    if (
      painted.current?.id === item.sticker.id &&
      sameStickerArt(painted.current.appearance, s.appearance, item.sticker.id)
    ) {
      painted.current.appearance = s.appearance;
      return;
    }
    let active = true;
    const c = document.createElement('canvas');
    void paintSticker(c, item.sticker.id, s.appearance, 160).then(() => {
      if (active && canvas.current) {
        canvas.current.width = 160;
        canvas.current.height = 160;
        canvas.current.getContext('2d')!.drawImage(c, 0, 0);
        painted.current = { id: item.sticker.id, appearance: s.appearance };
      }
    });
    return () => {
      active = false;
    };
  }, [item.sticker.id, s.appearance]);
  return (
    <button
      className={`sticker-tile ${selected ? 'selected' : ''}`}
      style={{ borderRadius }}
      aria-label={tx('legacy.m201', {
        p0: item.face,
        p1: item.row + 1,
        p2: item.col + 1,
        p3: item.sticker.id,
      })}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <canvas ref={canvas} style={{ transform: `rotate(${item.angle}deg)` }} />
      <span className="tile-index">{item.sticker.id}</span>
    </button>
  );
}
const homeFaces = facelets(solved());
export const FaceGrid = memo(function FaceGrid({
  face,
  home = false,
  large = false,
}: {
  face: Face;
  home?: boolean;
  large?: boolean;
}) {
  useLanguage();
  const s = useCube('cube', 'selected', 'mode'),
    map = useMemo(() => (home ? homeFaces : facelets(s.cube)), [s.cube, home]);
  return (
    <div className={`face-grid ${large ? 'large' : ''}`}>
      {map[face].map((item) => (
        <StickerTile
          key={item.row * 3 + item.col}
          item={item}
          selected={s.selected.includes(item.sticker.id)}
          onSelect={() =>
            selectSticker(item.sticker.id, s.mode === 'customize')
          }
        />
      ))}
    </div>
  );
});
export default memo(function FaceMaps() {
  useLanguage();
  const s = useCube('view', 'presentation', 'visibleFaces', 'faceAnchors');
  if (s.view === 'normal' || s.presentation) return null;
  const faces =
    s.view === 'hidden'
      ? FACES.filter((f) => !s.visibleFaces.includes(f))
      : FACES;
  if (s.view === 'hidden')
    return (
      <div className="projection-labels" aria-label={tx('legacy.m202')}>
        {faces.map((face) => {
          const a = s.faceAnchors[face];
          return a ? (
            <button
              key={face}
              className="projection-label"
              style={{ left: `${a.x}%`, top: `${a.y}%` }}
              onClick={() => cameraActions.face(face)}
            >
              <b>{face}</b>
              <span>
                {FACE[face].name}
                {tx('legacy.m203')}
              </span>
              <span>↗</span>
            </button>
          ) : null;
        })}
      </div>
    );
  return (
    <div className={`face-maps ${s.view}`} aria-label={tx('legacy.m204')}>
      <div className="map-heading">
        <span>{s.view === 'six' ? 'SIX FACE OVERVIEW' : 'CUBE NET'}</span>
        <i />
        <span>{tx('legacy.m205')}</span>
      </div>
      <div className="maps-grid">
        {faces.map((face) => (
          <div
            key={face}
            className={`mini-face face-${face} ${s.visibleFaces.includes(face) ? 'visible-face' : 'hidden-face'}`}
          >
            <button
              className="face-label"
              onClick={() => cameraActions.face(face)}
              title={tx('legacy.m206', { p0: FACE[face].name })}
            >
              <b>{face}</b>
              <span>
                {FACE[face].name}
                {tx('legacy.m203')}
              </span>
              <span className="face-direction">
                {face === 'U'
                  ? '↑'
                  : face === 'D'
                    ? '↓'
                    : face === 'L'
                      ? '←'
                      : face === 'R'
                        ? '→'
                        : face === 'B'
                          ? '↗'
                          : '↙'}
              </span>
            </button>
            <FaceGrid face={face} />
          </div>
        ))}
      </div>
    </div>
  );
});
