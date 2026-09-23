'use client';
import { tx, useLanguage } from '@/lib/i18n';
import { memo, useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Upload,
  Download,
  Save,
  FolderOpen,
  RotateCcw,
  Trash2,
  Unlink,
  Type,
} from 'lucide-react';
import { PALETTES } from '@/lib/cube/palettes';
import { FACES, COLORS, FACE, type Face } from '@/lib/cube/model';
import {
  defaultAppearance,
  defaultTransform,
  faceIds,
  groupBounds,
  importImage,
  removeFromGroups,
  paintSticker,
  loadImage,
  drawGroup,
  applyImageGroup,
  type ImageGroup,
} from '@/lib/cube/appearance';
import {
  useCube,
  getState,
  patch,
  setAppearance,
  notify,
  cameraActions,
} from '@/lib/cube/store';
import {
  saveProject,
  readProject,
  loadProject,
  exportProject,
  importProject,
} from '@/lib/cube/persistence';
import { FaceGrid } from './FaceMaps';
import { Range } from './Controls';
import ImageTransformControls from './ImageTransformControls';
import ImagePreviewDialog, { type ImageDraft } from './ImagePreviewDialog';
export default memo(function CustomizePanel() {
  useLanguage();
  const s = useCube(
      'selected',
      'appearance',
      'artVersion',
      'editFace',
      'busy',
      'solving',
      'autoSave',
    ),
    upload = useRef<HTMLInputElement>(null),
    importRef = useRef<HTMLInputElement>(null),
    preview = useRef<HTMLCanvasElement>(null),
    [loading, setLoading] = useState(false),
    [draft, setDraft] = useState<ImageDraft | null>(null),
    [text, setText] = useState('AXIS');
  const first = s.selected[0],
    firstArt = first ? s.appearance.stickers[first] : null;
  const group = firstArt?.group
    ? s.appearance.groups[firstArt.group]
    : undefined;
  useEffect(() => {
    let active = true;
    const c = preview.current;
    if (!group || !c) {
      return;
    }
    const b = group.bounds || groupBounds(group.members);
    c.width = b.cols * 200;
    c.height = b.rows * 200;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#343b34';
    ctx.fillRect(0, 0, c.width, c.height);
    void loadImage(group.image).then((img) => {
      if (!active) return;
      drawGroup(ctx, img, group, c.width, c.height);
      ctx.strokeStyle = '#ffffff80';
      ctx.lineWidth = 1;
      for (let i = 1; i < b.cols; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 200, 0);
        ctx.lineTo(i * 200, c.height);
        ctx.stroke();
      }
      for (let i = 1; i < b.rows; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * 200);
        ctx.lineTo(c.width, i * 200);
        ctx.stroke();
      }
    });
    return () => {
      active = false;
    };
  }, [group, s.artVersion]);
  function updateGroup(update: Partial<ImageGroup>) {
    if (!group) return;
    const a = structuredClone(s.appearance);
    a.groups[group.id] = { ...group, ...update };
    setAppearance(a);
  }
  function chooseFace(face: Face) {
    patch({ editFace: face, selected: faceIds(face) });
    cameraActions.face(face);
  }
  async function addImage(file: File) {
    if (!s.selected.length) {
      notify(tx('legacy.m154'));
      return;
    }
    if (new Set(s.selected.map((id) => id[0])).size > 1) {
      notify(tx('legacy.m155'));
      return;
    }
    setLoading(true);
    try {
      const image = await importImage(file);
      setDraft({
        replacing: false,
        group: {
          id: crypto.randomUUID(),
          members: [...s.selected],
          image,
          bounds: groupBounds(s.selected),
          ...defaultTransform(),
        },
      });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function replaceImage(file: File) {
    if (!group) return;
    setLoading(true);
    try {
      setDraft({
        replacing: true,
        group: { ...group, image: await importImage(file) },
      });
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function applyDraft(group: ImageGroup) {
    const current = getState();
    if (!draft || current.solving) return;
    setAppearance(applyImageGroup(current.appearance, group, !draft.replacing));
    patch({
      selected: [...group.members],
      editFace: group.members[0][0] as Face,
    });
    setDraft(null);
    notify(tx('legacy.m156', { p0: group.members.length }));
  }
  async function dissolve() {
    if (!group) return;
    setLoading(true);
    try {
      const a = structuredClone(s.appearance);
      for (const id of group.members) {
        const c = document.createElement('canvas');
        await paintSticker(c, id, s.appearance, 400);
        const gid = crypto.randomUUID();
        a.groups[gid] = {
          id: gid,
          members: [id],
          image: c.toDataURL('image/png'),
          bounds: groupBounds([id]),
          ...defaultTransform(),
        };
        a.stickers[id] = {
          color: a.stickers[id].color,
          rotation: 0,
          group: gid,
        };
      }
      delete a.groups[group.id];
      setAppearance(a);
      notify(tx('legacy.m157', { p0: group.members.length }));
    } finally {
      setLoading(false);
    }
  }
  function applyColor(color: string) {
    if (!s.selected.length) return;
    const a = structuredClone(s.appearance);
    for (const id of s.selected) a.stickers[id].color = color;
    setAppearance(a);
  }
  function addText() {
    if (!s.selected.length) {
      notify(tx('legacy.m158'));
      return;
    }
    const c = document.createElement('canvas');
    c.width = 900;
    c.height = 900;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = firstArt?.color || '#d7e0c1';
    ctx.fillRect(0, 0, 900, 900);
    ctx.fillStyle = '#263027';
    ctx.font = `600 ${Math.min(170, 700 / Math.max(1, text.length))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 50), 450, 450);
    c.toBlob((blob) => {
      if (blob)
        void addImage(new File([blob], 'text.png', { type: 'image/png' }));
    });
  }
  const handleError = (e: unknown) => notify((e as Error).message);
  return (
    <>
      <div className="face-selector">
        {FACES.map((f) => (
          <button
            key={f}
            className={s.editFace === f ? 'active' : ''}
            aria-pressed={s.editFace === f}
            onClick={() => chooseFace(f)}
          >
            <i style={{ background: COLORS[f] }} />
            {f}
          </button>
        ))}
      </div>
      <div className="edit-grid-heading">
        <span>
          {FACE[s.editFace].name}
          {tx('legacy.m159')}
        </span>
        <button onClick={() => patch({ selected: faceIds(s.editFace) })}>
          {tx('legacy.m160')}
        </button>
      </div>
      <div className="editor-face">
        <FaceGrid face={s.editFace} home large />
      </div>
      <div className="selection-actions">
        <span>
          {tx('legacy.m161')}
          {s.selected.length} / 54
        </span>
        <button onClick={() => patch({ selected: [] })}>
          {tx('legacy.m162')}
        </button>
        <button
          onClick={() =>
            patch({
              selected: faceIds(s.editFace).filter(
                (id) => !s.selected.includes(id),
              ),
            })
          }
        >
          {tx('legacy.m163')}
        </button>
      </div>
      <p className="microcopy">{tx('legacy.m164')}</p>
      <input
        ref={upload}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
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
        <ImagePlus size={23} />
        <strong>
          {loading
            ? tx('legacy.m165')
            : s.selected.length === 9
              ? tx('legacy.m166')
              : tx('legacy.m167')}
        </strong>
        <span>{tx('legacy.m168')}</span>
      </button>
      <div className="color-control">
        <span>{tx('legacy.m169')}</span>
        <label className="color-input">
          <input
            aria-label={tx('legacy.m169')}
            type="color"
            value={firstArt?.color || COLORS[s.editFace]}
            disabled={!s.selected.length}
            onChange={(e) => applyColor(e.target.value)}
          />
          <code>{firstArt?.color || '—'}</code>
        </label>
      </div>
      {group && (
        <section className="image-editor">
          <div className="section-head">
            <h3>
              {tx('legacy.m170')}
              {group.members.length}
              {tx('legacy.m171')}
            </h3>
            <button
              className="text-button"
              onClick={() => patch({ selected: [...group.members] })}
            >
              {tx('legacy.m172')}
            </button>
          </div>
          <div className="image-previews">
            <div>
              <span>{tx('legacy.m173')}</span>
              <div className="source-image">
                <img src={group.image} alt={tx('legacy.m174')} />
                <i
                  style={{
                    left: `${group.cropX * 100}%`,
                    top: `${group.cropY * 100}%`,
                    width: `${group.cropW * 100}%`,
                    height: `${group.cropH * 100}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <span>{tx('legacy.m175')}</span>
              <canvas ref={preview} />
            </div>
          </div>
          <ImageTransformControls value={group} onChange={updateGroup} />
          <div className="image-actions">
            <button onClick={() => setDraft({ replacing: true, group })}>
              <ImagePlus size={14} />
              {tx('legacy.m176')}
            </button>
            <label className="file-button">
              <Upload size={14} />
              {tx('legacy.m177')}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={loading}
                hidden
                onChange={(e) => {
                  if (e.target.files?.[0]) void replaceImage(e.target.files[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <button disabled={loading} onClick={() => void dissolve()}>
              <Unlink size={14} />
              {tx('legacy.m178')}
            </button>
          </div>
        </section>
      )}
      {firstArt?.image && !group && (
        <button
          className="wide-button"
          onClick={() => {
            const a = structuredClone(s.appearance),
              gid = crypto.randomUUID();
            a.groups[gid] = {
              id: gid,
              members: [first],
              image: firstArt.image!,
              bounds: groupBounds([first]),
              ...defaultTransform(),
            };
            a.stickers[first].group = gid;
            delete a.stickers[first].image;
            setAppearance(a);
          }}
        >
          {tx('legacy.m179')}
          <ImagePlus size={15} />
        </button>
      )}
      {first && (
        <>
          <Range
            label={tx('legacy.m180')}
            value={firstArt?.rotation || 0}
            min={-180}
            max={180}
            step={90}
            digits={0}
            unit="°"
            onChange={(rotation) => {
              const a = structuredClone(s.appearance);
              for (const id of s.selected) a.stickers[id].rotation = rotation;
              setAppearance(a);
            }}
          />
          <div className="image-actions">
            <button
              onClick={() =>
                setAppearance(removeFromGroups(s.appearance, s.selected))
              }
            >
              <Trash2 size={14} />
              {tx('legacy.m181')}
            </button>
            <button
              onClick={() => {
                const a = removeFromGroups(s.appearance, s.selected);
                for (const id of s.selected)
                  a.stickers[id] = {
                    color: COLORS[id[0] as Face],
                    rotation: 0,
                  };
                setAppearance(a);
              }}
            >
              <RotateCcw size={14} />
              {tx('legacy.m182')}
            </button>
          </div>
        </>
      )}
      <section className="panel-section">
        <h3>{tx('legacy.m183')}</h3>
        <div className="text-design">
          <input
            aria-label={tx('legacy.m184')}
            value={text}
            maxLength={50}
            onChange={(e) => setText(e.target.value)}
          />
          <button
            title={tx('legacy.m185')}
            aria-label={tx('legacy.m185')}
            onClick={addText}
          >
            <Type size={18} />
          </button>
        </div>
        <div className="palette-presets">
          {PALETTES.map(({ name: label, colors }) => (
            <button
              key={label}
              onClick={() => {
                const a = structuredClone(s.appearance);
                FACES.forEach((f) =>
                  faceIds(f).forEach((id) => {
                    a.stickers[id].color = colors[f];
                  }),
                );
                setAppearance(a);
              }}
            >
              <span>
                {Object.values(colors).map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              {label}
            </button>
          ))}
        </div>
      </section>
      <section className="panel-section">
        <div className="section-head">
          <h3>{tx('legacy.m186')}</h3>
          <span className={`tag${s.autoSave ? '' : ' off'}`}>
            {tx('legacy.m187')}
            {s.autoSave ? tx('legacy.m188') : tx('legacy.m189')}
          </span>
        </div>
        <div className="project-actions">
          <button
            disabled={s.busy || s.solving}
            onClick={() =>
              void saveProject().then(
                () => notify(tx('legacy.m190')),
                handleError,
              )
            }
          >
            <Save size={16} />
            {tx('legacy.m191')}
          </button>
          <button
            disabled={s.busy || s.solving}
            onClick={() =>
              void readProject()
                .then((p) => {
                  if (p) {
                    loadProject(p);
                    notify(tx('legacy.m192'));
                  } else notify(tx('legacy.m193'));
                })
                .catch(handleError)
            }
          >
            <FolderOpen size={16} />
            {tx('legacy.m194')}
          </button>
          <button onClick={exportProject}>
            <Download size={16} />
            {tx('legacy.m195')}
          </button>
          <button
            disabled={s.busy || s.solving}
            onClick={() => importRef.current?.click()}
          >
            <Upload size={16} />
            {tx('legacy.m196')}
          </button>
        </div>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f)
              void importProject(f).then(
                () => notify(tx('legacy.m197')),
                handleError,
              );
            e.target.value = '';
          }}
        />
        <p className="microcopy">{tx('legacy.m198')}</p>
        <button
          className="wide-button"
          onClick={() => {
            setAppearance(defaultAppearance());
            notify(tx('legacy.m199'));
          }}
        >
          {tx('legacy.m200')}
          <RotateCcw size={15} />
        </button>
      </section>
      {draft && (
        <ImagePreviewDialog
          key={draft.group.id}
          draft={draft}
          appearance={s.appearance}
          disabled={s.solving}
          onCancel={() => setDraft(null)}
          onApply={applyDraft}
        />
      )}
    </>
  );
});
