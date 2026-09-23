'use client';
import { tx, useLanguage } from '@/lib/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  applyImageGroup,
  faceIds,
  groupBounds,
  paintSticker,
  type Appearance,
  type ImageGroup,
} from '@/lib/cube/appearance';
import { FACE, type Face } from '@/lib/cube/model';
import ImageTransformControls from './ImageTransformControls';
export interface ImageDraft {
  group: ImageGroup;
  replacing: boolean;
}
export default function ImagePreviewDialog({
  draft,
  appearance,
  disabled,
  onCancel,
  onApply,
}: {
  draft: ImageDraft;
  appearance: Appearance;
  disabled: boolean;
  onCancel: () => void;
  onApply: (group: ImageGroup) => void;
}) {
  useLanguage();
  const [group, setGroup] = useState(draft.group);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const preview = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{
    pointer: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } | null>(null);
  const nextAppearance = useMemo(
    () => applyImageGroup(appearance, group, !draft.replacing),
    [appearance, group, draft.replacing],
  );
  const face = group.members[0][0] as Face;
  useEffect(() => {
    let active = true;
    setReady(false);
    setError('');
    const ids = faceIds(face);
    void Promise.all(
      ids.map(async (id) => {
        const tile = document.createElement('canvas');
        await paintSticker(tile, id, nextAppearance, 180);
        return tile;
      }),
    )
      .then((tiles) => {
        const canvas = preview.current;
        if (!active || !canvas) return;
        canvas.width = canvas.height = 540;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#15191a';
        ctx.fillRect(0, 0, 540, 540);
        tiles.forEach((tile, i) => {
          const x = (i % 3) * 180,
            y = Math.floor(i / 3) * 180;
          ctx.drawImage(tile, x + 3, y + 3, 174, 174);
          if (group.members.includes(ids[i])) {
            ctx.strokeStyle = '#e4f3c6';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.strokeRect(x + 3, y + 3, 174, 174);
          }
        });
        setReady(true);
      })
      .catch(() => {
        if (active) setError(tx('legacy.m207'));
      });
    return () => {
      active = false;
    };
  }, [face, group.members, nextAppearance]);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent
        className="image-preview-dialog"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DialogTitle>
          {draft.replacing ? tx('legacy.m208') : tx('legacy.m209')}
        </DialogTitle>
        <DialogDescription>{tx('legacy.m210')}</DialogDescription>
        <div className="image-draft-layout">
          <div className="image-draft-preview">
            <div className="section-head">
              <h3>
                {FACE[face].name}
                {tx('legacy.m211')}
              </h3>
              <span className="tag">
                {tx('legacy.m161')}
                {group.members.length}
                {tx('legacy.m171')}
              </span>
            </div>
            <canvas
              ref={preview}
              aria-label={tx('legacy.m212', { p0: FACE[face].name })}
              style={{ touchAction: 'none' }}
              onPointerDown={(event) => {
                if (disabled || event.button !== 0 || drag.current) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const bounds = group.bounds || groupBounds(group.members);
                drag.current = {
                  pointer: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  offsetX: group.x,
                  offsetY: group.y,
                  width: (rect.width * bounds.cols) / 3,
                  height: (rect.height * bounds.rows) / 3,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                event.preventDefault();
              }}
              onPointerMove={(event) => {
                const origin = drag.current;
                if (!origin || origin.pointer !== event.pointerId || disabled)
                  return;
                setGroup((current) => ({
                  ...current,
                  x: Math.max(
                    -1,
                    Math.min(
                      1,
                      origin.offsetX +
                        (event.clientX - origin.x) / origin.width,
                    ),
                  ),
                  y: Math.max(
                    -1,
                    Math.min(
                      1,
                      origin.offsetY +
                        (event.clientY - origin.y) / origin.height,
                    ),
                  ),
                }));
              }}
              onPointerUp={(event) => {
                if (drag.current?.pointer === event.pointerId)
                  drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
            />
            <p className="microcopy">{tx('legacy.m213')}</p>
            <details className="image-draft-original">
              <summary>{tx('legacy.m214')}</summary>
              <img src={group.image} alt={tx('legacy.m215')} />
            </details>
          </div>
          <div className="image-draft-controls" inert={disabled}>
            <ImageTransformControls
              value={group}
              onChange={(update) =>
                setGroup((current) => ({ ...current, ...update }))
              }
            />
          </div>
        </div>
        {error && (
          <p role="alert" className="image-preview-error">
            {error}
          </p>
        )}
        <div className="image-draft-actions">
          <button className="secondary-button" onClick={onCancel}>
            {tx('legacy.m024')}
          </button>
          <button
            className="primary-button"
            disabled={disabled || !ready || !!error}
            onClick={() => onApply(group)}
          >
            {tx('legacy.m216')}
            {group.members.length}
            {tx('legacy.m171')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
