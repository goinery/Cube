import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ImagePlus,
  RotateCcw,
  Trash2,
  Type,
  Upload,
  Download,
  Save,
  FolderOpen,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Range, Choice } from '../cube/Controls';
import { useTranslation } from '@/lib/i18n';
import { useSession, type Session } from '@/lib/puzzle/session';
import {
  applyPhoto,
  bounds,
  defaultAppearance,
  separatePhoto,
  defaultTransform,
  importImage,
  paintFace,
  photoBounds,
  type Photo,
} from '@/lib/puzzle/appearance';
import { capture, download, load, read, save } from '@/lib/puzzle/persistence';
import { FaceCanvas } from './FaceCanvas';

function ImagePreview({
  session,
  draft,
  onClose,
}: {
  session: Session;
  draft: Photo;
  onClose: () => void;
}) {
  const { t } = useTranslation(),
    [photo, setPhoto] = useState(draft),
    [ready, setReady] = useState(false),
    canvas = useRef<HTMLCanvasElement>(null),
    drag = useRef<{
      x: number;
      y: number;
      offsetX: number;
      offsetY: number;
      width: number;
      height: number;
    } | null>(null);
  const appearance = useMemo(
    () => applyPhoto(session.state.appearance, photo),
    [session, photo],
  );
  useEffect(() => {
    let active = true;
    setReady(false);
    const next = document.createElement('canvas');
    void paintFace(
      next,
      session.def,
      photo.face,
      appearance,
      photo.members,
      800,
    )
      .then(() => {
        if (!active || !canvas.current) return;
        canvas.current.width = next.width;
        canvas.current.height = next.height;
        canvas.current.getContext('2d')!.drawImage(next, 0, 0);
        setReady(true);
      })
      .catch(() => session.notify('art.failed'));
    return () => {
      active = false;
    };
  }, [session, appearance, photo]);
  const change = (key: keyof Photo, value: number) =>
    setPhoto((p) => ({ ...p, [key]: value }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="image-preview-dialog"
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DialogTitle>{t('art.preview')}</DialogTitle>
        <DialogDescription>{t('art.previewHelp')}</DialogDescription>
        <div className="image-draft-layout">
          <div className="image-draft-preview">
            <canvas
              ref={canvas}
              aria-label={t('art.preview')}
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                const rect = e.currentTarget.getBoundingClientRect(),
                  face = bounds(
                    session.def.faces.find((f) => f.id === photo.face)!.outline,
                  ),
                  group = photoBounds(session.def, photo);
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  offsetX: photo.x,
                  offsetY: photo.y,
                  width: (rect.width * group.w) / face.w,
                  height: (rect.height * group.h) / face.h,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d)
                  setPhoto((p) => ({
                    ...p,
                    x: Math.max(
                      -2,
                      Math.min(2, d.offsetX + (e.clientX - d.x) / d.width),
                    ),
                    y: Math.max(
                      -2,
                      Math.min(2, d.offsetY + (e.clientY - d.y) / d.height),
                    ),
                  }));
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onLostPointerCapture={() => (drag.current = null)}
            />
            <details className="image-draft-original">
              <summary>{t('art.original')}</summary>
              <img src={photo.image} alt={t('art.original')} />
            </details>
          </div>
          <div className="image-draft-controls">
            <Choice
              label={t('art.fit')}
              value={photo.fit}
              options={(['fill', 'fit', 'crop'] as const).map((x) => [
                x,
                t(x === 'fit' ? 'art.contain' : `art.${x}`),
              ])}
              onChange={(fit) =>
                setPhoto((p) => ({ ...p, fit: fit as Photo['fit'] }))
              }
            />
            <Range
              label={t('art.scale')}
              value={photo.scale}
              min={0.1}
              max={8}
              onChange={(v) => change('scale', v)}
            />
            <Range
              label={t('art.rotation')}
              value={photo.rotation}
              min={-180}
              max={180}
              step={1}
              digits={0}
              unit="°"
              onChange={(v) => change('rotation', v)}
            />
            <Range
              label={t('art.x')}
              value={photo.x}
              min={-2}
              max={2}
              onChange={(v) => change('x', v)}
            />
            <Range
              label={t('art.y')}
              value={photo.y}
              min={-2}
              max={2}
              onChange={(v) => change('y', v)}
            />
            {photo.fit === 'crop' && (
              <>
                <Range
                  label={t('art.cropX')}
                  value={photo.cropX}
                  min={0}
                  max={1 - photo.cropW}
                  onChange={(v) => change('cropX', v)}
                />
                <Range
                  label={t('art.cropY')}
                  value={photo.cropY}
                  min={0}
                  max={1 - photo.cropH}
                  onChange={(v) => change('cropY', v)}
                />
                <Range
                  label={t('art.cropW')}
                  value={photo.cropW}
                  min={0.05}
                  max={1 - photo.cropX}
                  onChange={(v) => change('cropW', v)}
                />
                <Range
                  label={t('art.cropH')}
                  value={photo.cropH}
                  min={0.05}
                  max={1 - photo.cropY}
                  onChange={(v) => change('cropH', v)}
                />
              </>
            )}
            <button
              className="secondary-button"
              onClick={() => setPhoto((p) => ({ ...p, ...defaultTransform() }))}
            >
              <RotateCcw size={15} />
              {t('common.reset')}
            </button>
          </div>
        </div>
        <div className="image-draft-actions">
          <button className="secondary-button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="primary-button"
            disabled={!ready}
            onClick={() => {
              session.setAppearance(
                applyPhoto(session.state.appearance, photo),
              );
              onClose();
            }}
          >
            {t('art.applyCount', { count: photo.members.length })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CustomizePanel({ session }: { session: Session }) {
  const s = useSession(session),
    { t } = useTranslation(),
    upload = useRef<HTMLInputElement>(null),
    project = useRef<HTMLInputElement>(null),
    [draft, setDraft] = useState<Photo | null>(null),
    [text, setText] = useState(''),
    [loading, setLoading] = useState(false);
  const ids = session.def.tiles
      .filter((tile) => tile.face === s.editFace)
      .map((tile) => tile.id),
    first = s.appearance.tiles[s.selected[0]],
    photo = first?.photo ? s.appearance.photos[first.photo] : undefined;
  async function addImage(file: File) {
    if (!s.selected.length) {
      session.notify('art.select');
      return;
    }
    const faces = new Set(
      s.selected.map(
        (id) => session.def.tiles.find((tile) => tile.id === id)!.face,
      ),
    );
    if (faces.size !== 1) {
      session.notify('art.sameFace');
      return;
    }
    setLoading(true);
    try {
      const image = await importImage(file);
      setDraft({
        id: crypto.randomUUID(),
        face: [...faces][0],
        image,
        members: [...s.selected],
        frame: bounds(
          session.def.tiles
            .filter((tile) => s.selected.includes(tile.id))
            .flatMap((tile) => tile.outline),
        ),
        ...defaultTransform(),
      });
    } catch (e) {
      session.error(e);
    } finally {
      setLoading(false);
    }
  }
  function patchSelected(patch: Partial<typeof first>) {
    const appearance = structuredClone(s.appearance);
    for (const id of s.selected) Object.assign(appearance.tiles[id], patch);
    session.setAppearance(appearance);
  }
  function remove(reset = false) {
    const appearance = structuredClone(s.appearance);
    for (const id of s.selected) {
      const tile = session.def.tiles.find((tile) => tile.id === id)!;
      delete appearance.tiles[id].photo;
      if (reset) {
        appearance.tiles[id].color = session.def.faces.find(
          (f) => f.id === tile.face,
        )!.color;
        appearance.tiles[id].rotation = 0;
      }
    }
    for (const [id, p] of Object.entries(appearance.photos)) {
      p.members = p.members.filter((id) => !s.selected.includes(id));
      if (!p.members.length) delete appearance.photos[id];
    }
    session.setAppearance(appearance);
  }
  function addText() {
    if (!text.trim() || !s.selected.length) return;
    const c = document.createElement('canvas');
    c.width = c.height = 900;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = first?.color || '#d7e0c1';
    ctx.fillRect(0, 0, 900, 900);
    ctx.fillStyle = '#252b27';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.min(170, 700 / Math.max(1, text.length))}px sans-serif`;
    ctx.fillText(text, 450, 450);
    c.toBlob((blob) => {
      if (blob)
        void addImage(new File([blob], 'text.png', { type: 'image/png' }));
    });
  }
  return (
    <>
      <div className="face-selector">
        {session.def.faces.map((f) => (
          <button
            key={f.id}
            aria-pressed={s.editFace === f.id}
            className={s.editFace === f.id ? 'active' : ''}
            onClick={() => session.patch({ editFace: f.id })}
          >
            <i style={{ background: f.color }} />
            {f.id}
          </button>
        ))}
      </div>
      <div className="edit-grid-heading">
        <span>
          {t('puzzle.face', { face: s.editFace })} · {t('art.face')}
        </span>
        <button onClick={() => session.patch({ selected: ids })}>
          {t('art.selectFace')}
        </button>
      </div>
      <div className="puzzle-face-editor">
        <FaceCanvas session={session} face={s.editFace} selectable />
      </div>
      <div className="selection-actions">
        <span>
          {t('art.selected', {
            count: s.selected.length,
            total: session.def.tiles.length,
          })}
        </span>
        <button onClick={() => session.patch({ selected: [] })}>
          {t('common.clear')}
        </button>
        <button
          onClick={() =>
            session.patch({
              selected: ids.filter((id) => !s.selected.includes(id)),
            })
          }
        >
          {t('art.invert')}
        </button>
      </div>
      <></>
      <input
        type="file"
        hidden
        ref={upload}
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void addImage(file);
          e.target.value = '';
        }}
      />
      <button
        className="upload-zone"
        disabled={loading || !s.selected.length}
        onClick={() => upload.current?.click()}
      >
        <ImagePlus size={24} />
        <strong>
          {t(
            s.selected.length === ids.length ? 'art.uploadFace' : 'art.upload',
          )}
        </strong>
        <span>PNG / JPEG / WebP · 25 MB</span>
      </button>
      {s.selected.length > 0 && (
        <>
          <label className="puzzle-color-control">
            <span>{t('art.color')}</span>
            <input
              type="color"
              aria-label={t('art.color')}
              value={first?.color || '#ffffff'}
              onChange={(e) => patchSelected({ color: e.target.value })}
            />
          </label>
          {photo && (
            <>
              <button
                className="wide-button"
                onClick={() => setDraft(structuredClone(photo))}
              >
                {t('art.edit')}
              </button>
              {photo.members.length > 1 && (
                <button
                  className="wide-button"
                  onClick={() =>
                    session.setAppearance(
                      separatePhoto(session.def, s.appearance, photo.id),
                    )
                  }
                >
                  {t('art.separate')}
                </button>
              )}
            </>
          )}
          <Range
            label={t('art.orientation')}
            value={first?.rotation || 0}
            min={-180}
            max={180}
            step={1}
            digits={0}
            unit="°"
            onChange={(rotation) => patchSelected({ rotation })}
          />
          <div className="image-actions">
            <button onClick={() => remove()}>
              <Trash2 size={14} />
              {t('art.remove')}
            </button>
            <button onClick={() => remove(true)}>
              <RotateCcw size={14} />
              {t('art.reset')}
            </button>
          </div>
        </>
      )}
      <section className="panel-section">
        <h3>{t('art.palettes')}</h3>
        <div className="text-design">
          <input
            aria-label={t('art.text')}
            maxLength={50}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button aria-label={t('art.addText')} onClick={addText}>
            <Type size={18} />
          </button>
        </div>
        <div className="palette-presets">
          {['factory', 'neon', 'contrast'].map((name) => (
            <button
              key={name}
              onClick={() => {
                const appearance = structuredClone(s.appearance);
                session.def.faces.forEach((face, index) => {
                  const color =
                    name === 'factory'
                      ? face.color
                      : name === 'neon'
                        ? `hsl(${(index * 360) / session.def.faces.length}, 95%, 60%)`
                        : `hsl(${(index * 137.508) % 360}, ${index % 2 ? 65 : 90}%, ${index % 2 ? 40 : 65}%)`;
                  const canvas = document.createElement('canvas'),
                    ctx = canvas.getContext('2d')!;
                  ctx.fillStyle = color;
                  const hex = ctx.fillStyle;
                  session.def.tiles
                    .filter((tile) => tile.face === face.id)
                    .forEach((tile) => (appearance.tiles[tile.id].color = hex));
                });
                session.setAppearance(appearance);
              }}
            >
              {t(`art.${name}`)}
            </button>
          ))}
        </div>
      </section>
      <button
        className="wide-button"
        onClick={() => session.setAppearance(defaultAppearance(session.def))}
      >
        {t('art.resetAll')}
        <RotateCcw size={15} />
      </button>
      <section className="panel-section">
        <h3>{t('project.title')}</h3>
        <div className="project-actions">
          <button
            onClick={() =>
              void save(session).catch(() => session.notify('common.storage'))
            }
          >
            <Save size={16} />
            {t('project.save')}
          </button>
          <button
            onClick={() =>
              void read(session)
                .then((p) => {
                  if (p) {
                    load(session, p);
                    session.notify('project.loaded');
                  } else session.notify('project.missing');
                })
                .catch((e) => session.error(e))
            }
          >
            <FolderOpen size={16} />
            {t('project.load')}
          </button>
          <button
            onClick={() =>
              download(capture(session), `axis-${session.def.id}.json`)
            }
          >
            <Download size={16} />
            {t('project.export')}
          </button>
          <button onClick={() => project.current?.click()}>
            <Upload size={16} />
            {t('project.import')}
          </button>
        </div>
        <input
          hidden
          type="file"
          ref={project}
          accept="application/json,.json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            if (file.size > 80_000_000) {
              session.notify('project.limit');
              return;
            }
            void file
              .text()
              .then((raw) => {
                load(session, JSON.parse(raw));
                session.notify('project.imported');
              })
              .catch((e) => session.error(e));
          }}
        />
      </section>
      {draft && (
        <ImagePreview
          session={session}
          draft={draft}
          onClose={() => setDraft(null)}
        />
      )}
    </>
  );
}
