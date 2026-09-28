import { useEffect,useRef,useState } from 'react';
import { tx,useLanguage } from '@/lib/i18n';
import { Dialog,DialogContent,DialogTitle,DialogDescription } from '@/components/ui/dialog';
import { FACE_HEIGHT_RATIO,paintPhoto } from '@/lib/pyraminx/appearance';
import { FACE_NAMES } from '@/lib/pyraminx/model';
import { notify,type Photo } from '@/lib/pyraminx/store';
import ImageControls from '../workspace/ImageControls';
export default function PhotoDialog({
  photo,
  face,
  onClose,
  onApply,
}: {
  photo: Photo;
  face: number;
  onClose: () => void;
  onApply: (photo: Photo) => void;
}) {
  useLanguage();
  const [draft, setDraft] = useState(photo),
    [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null),
    preview = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    base: Photo;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const image = new Image();
    image.src = draft.src;
    void image
      .decode()
      .then(() => {
        if (active) setPhotoImage(image);
      })
      .catch(() => {
        if (active) notify(tx('legacy.m300'));
      });
    return () => {
      active = false;
    };
  }, [draft.src]);
  useEffect(() => {
    if (preview.current && photoImage?.src === draft.src)
      paintPhoto(preview.current, photoImage, draft);
  }, [draft, photoImage]);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="image-preview-dialog pyr-photo-dialog" onKeyDown={(e) => e.stopPropagation()}>
        <DialogTitle>{FACE_NAMES[face]} {tx('art.preview')}</DialogTitle>
        <DialogDescription>{tx('art.previewHelp')}</DialogDescription>
        <div className="image-draft-layout"><div className="image-draft-preview">
      <div
        className="pyr-photo-preview"
        style={{ aspectRatio: `1 / ${FACE_HEIGHT_RATIO}` }}
        aria-label={tx('legacy.m303')}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, base: draft };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const { clientWidth: width, clientHeight: height } = e.currentTarget;
          setDraft({
            ...d.base,
            x: Math.max(-2, Math.min(2, d.base.x + (e.clientX - d.x) / width)),
            y: Math.max(-2, Math.min(2, d.base.y + (e.clientY - d.y) / height)),
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div className="pyr-photo-clip">
          <canvas ref={preview} aria-label={tx('legacy.m304')} />
        </div>
        <svg
          viewBox="0 0 300 300"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M150 0 L0 300 L300 300 Z M100 100 L200 100 M50 200 L250 200 M100 100 L200 300 M200 100 L100 300 M50 200 L100 300 M250 200 L200 300 M50 200 L100 100 M250 200 L200 100" />
        </svg>
      </div>
      </div><div className="image-draft-controls"><ImageControls value={draft} onChange={(update) => setDraft((p) => ({...p, ...update}))} /></div></div>
      <div className="pyr-button-row">
        <button
          className="secondary-button"
          onClick={() =>
            setDraft({ ...draft, scale: 1, x: 0, y: 0, rotation: 0 })
          }
        >
          {tx('legacy.m307')}
        </button>
        <button className="secondary-button" onClick={onClose}>
          {tx('legacy.m024')}
        </button>
        <button className="primary-button" onClick={() => onApply(draft)}>
          {tx('legacy.m308')}
        </button>
      </div>
    </DialogContent></Dialog>
  );
}
