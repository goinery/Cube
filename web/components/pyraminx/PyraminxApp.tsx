import { assemblyDefaults } from '@/lib/puzzle-config';
import { tx, useLanguage } from '@/lib/i18n';
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  CircleStop,
  Copy,
  Download,
  Eye,
  Focus,
  MousePointer2,
  Pause,
  Play,
  Pyramid,
  Redo2,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  Undo2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import type { PuzzleType } from '../cube/PuzzleSwitcher';
import WorkspaceHeader, { WorkspaceFooter } from '../workspace/WorkspaceHeader';
import WorkspacePanel, { useWorkspacePanel } from '../workspace/WorkspacePanel';

import { Choice, Range, Toggle } from '../cube/Controls';
import { useCube, type Mode, type View } from '@/lib/cube/store';
import {
  formatShortcut,
  keyboardShortcut,
  shouldIgnoreShortcut,
} from '@/lib/cube/keybindings';
import { FACE_HEIGHT_RATIO, paintPhoto } from '@/lib/pyraminx/appearance';
import {
  AXES,
  FACE_COLORS,
  PYRAMINX_PALETTES,
  FACE_NAMES,
  PIECES,
  TILES,
  isSolved,
  moveToken,
  parseAlgorithm,
  scramble,
  type Layer,
} from '@/lib/pyraminx/model';
import {
  align,
  applyInstant,
  cameraActions,
  cancelSolve,
  captureProject,
  defaultColors,
  defaultKeys,
  defaultPresets,
  presetLabel,
  getState,
  importProject,
  loadPlayer,
  next,
  notify,
  patch,
  pause,
  perform,
  play,
  previous,
  redo,
  replayHistory,
  resetPuzzle,
  restoreLocal,
  runAlgorithm,
  saveLocal,
  seek,
  setAutoSave,
  setPresentation,
  settings,
  startSolve,
  undo,
  usePyraminx,
  validatePresets,
  watchAutosave,
  type Photo,
} from '@/lib/pyraminx/store';
import Viewport from './Viewport';
function download(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readJSON(file: File) {
  if (file.size > 12000000) throw new Error(tx('legacy.m299'));
  return JSON.parse(await file.text());
}
function PhotoDialog({
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
    preview = useRef<HTMLCanvasElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    base: Photo;
  } | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
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
    <dialog className="pyr-photo-dialog" ref={dialog} onCancel={onClose}>
      <div className="section-head">
        <h3>
          {FACE_NAMES[face]}
          {tx('legacy.m301')}
        </h3>
        <button aria-label={tx('legacy.m302')} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
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
            x: Math.max(-1, Math.min(1, d.base.x + (e.clientX - d.x) / width)),
            y: Math.max(-1, Math.min(1, d.base.y + (e.clientY - d.y) / height)),
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
      <Range
        label={tx('legacy.m306')}
        value={draft.scale}
        min={0.25}
        max={4}
        onChange={(scale) => setDraft({ ...draft, scale })}
      />
      <Range
        label={tx('legacy.m224')}
        value={draft.rotation}
        min={-180}
        max={180}
        digits={0}
        unit="°"
        step={1}
        onChange={(rotation) => setDraft({ ...draft, rotation })}
      />
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
    </dialog>
  );
}
function TilePicker() {
  useLanguage();
  const s = usePyraminx();
  return (
    <div
      className="pyr-tile-picker"
      style={{ aspectRatio: `1 / ${FACE_HEIGHT_RATIO}` }}
      aria-label={tx('legacy.m309')}
    >
      {TILES.filter((t) => t.face === s.editFace).map((tile) => {
        const points = tile.uv
          .map(([x, y]) => `${x * 260},${(1 - y) * 225}`)
          .join(' ');
        return (
          <button
            key={tile.id}
            className="pyr-tile-button"
            disabled={s.solving}
            aria-label={`${tx('puzzle.' + PIECES[tile.piece].kind)} ${tile.id}`}
            aria-pressed={s.selected.includes(tile.id)}
            style={{
              clipPath: `polygon(${tile.uv.map(([x, y]) => `${x * 100}% ${(1 - y) * 100}%`).join(',')})`,
            }}
            onClick={() => {
              patch({
                selected: s.selected.includes(tile.id)
                  ? s.selected.filter((id) => id !== tile.id)
                  : [...s.selected, tile.id],
              });
            }}
          >
            <svg
              viewBox="0 0 260 225"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polygon
                points={points}
                fill={s.colors[tile.id]}
                stroke={s.selected.includes(tile.id) ? '#ffffff' : '#1b1e20'}
                strokeWidth={s.selected.includes(tile.id) ? 5 : 3}
                strokeLinejoin="round"
              />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
export default function PyraminxApp({
  onSwitch,
}: {
  onSwitch: (puzzle: PuzzleType) => void;
}) {
  useLanguage();
  const s = usePyraminx(),
    cubeNotice = useCube('notice');
  const [layer, setLayer] = useState<Layer>('body'),
    [reverse, setReverse] = useState(false),
    [animated, setAnimated] = useState(true);
  const [algorithm, setAlgorithm] = useState("R U R' U R U R' U"),
    [presetName, setPresetName] = useState('');
  const [color, setColor] = useState(FACE_COLORS[3]),
    [photo, setPhoto] = useState<{
      face: number;
      photo: Photo;
    } | null>(null);
  const panel = useWorkspacePanel(s.mode, s.solving, (mode) => patch({ mode }));
  const importInput = useRef<HTMLInputElement>(null),
    algorithmInput = useRef<HTMLInputElement>(null),
    photoInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    restoreLocal();
    const cleanup = watchAutosave();
    return () => {
      pause();
      cleanup();
    };
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (shouldIgnoreShortcut(e)) return;
      const state = getState();
      if (state.solving) return;
      const shortcut = keyboardShortcut(e),
        action = Object.entries(state.keybindings).find(
          ([, key]) => key && key === shortcut,
        )?.[0];
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      if (action === 'undo') void undo();
      else if (action === 'redo') void redo();
      else if (action === 'playPause') {
        if (state.player?.playing) pause();
        else void play();
      } else if (action === 'exitPresentation') setPresentation(false);
      else void perform(action);
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  async function uploadPhoto(file: File) {
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20000000)
        throw new Error(tx('legacy.m310'));
      const face = getState().editFace,
        url = URL.createObjectURL(file),
        img = new Image();
      try {
        img.src = url;
        await img.decode();
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas
          .getContext('2d')!
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        setPhoto({
          face,
          photo: {
            src: canvas.toDataURL('image/jpeg', 0.88),
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
          },
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      notify((error as Error).message);
    }
  }
  async function newScramble() {
    if (s.busy || s.solving) return;
    if (!(await align())) return;
    const moves = scramble();
    patch({ scramble: moves.join(' ') });
    if (animated) {
      loadPlayer(moves, tx('legacy.m084'));
      void play();
    } else await applyInstant(moves);
  }
  function addPreset() {
    try {
      const moves = parseAlgorithm(algorithm);
      if (!moves.length || !presetName.trim())
        throw new Error(tx('legacy.m311'));
      if (s.presets.length >= 100) throw new Error(tx('legacy.m312'));
      if (s.presets.some((p) => p.algorithm === moves.join(' ')))
        throw new Error(tx('legacy.m313'));
      patch({
        presets: [
          ...s.presets,
          { name: presetName.trim().slice(0, 80), algorithm: moves.join(' ') },
        ],
      });
      setPresetName('');
      notify(tx('legacy.m314'));
    } catch (error) {
      notify((error as Error).message);
    }
  }
  const locked = s.busy || s.solving,
    solved = !s.partials.length && isSolved(s.puzzle),
    selectedTile = TILES.find((t) => t.id === s.selected[0]);
  const section = (id: Mode) => ({
    className: 'panel-block',
    'data-section': id,
  });
  return (
    <main
      className={`cube-app pyr-app ${s.presentation ? 'presentation' : ''} ${panel.open ? '' : 'panel-collapsed'}`}
    >
      <WorkspaceHeader
        puzzle="pyraminx"
        onSwitch={(type) => {
          pause();
          onSwitch(type);
        }}
        autoSave={s.autoSave}
        onAutoSave={setAutoSave}
        onSave={() => saveLocal()}
        onError={() => notify(tx('common.error'))}
        locked={locked}
        solving={s.solving}
        presentation={s.presentation}
        onPresentation={setPresentation}
      />
      <div className="workspace">
        <section className="stage" inert={s.solving}>
          <Viewport />
          <div className="stage-state">
            <i className={solved ? 'solved' : ''} />
            <span>
              {s.currentMove
                ? tx('legacy.m053', { p0: s.currentMove })
                : s.partials.length
                  ? tx('legacy.m054')
                  : solved
                    ? tx('legacy.m055')
                    : tx('legacy.m056')}
            </span>
            <span className="state-divider" />
            <span>
              {s.cursor}
              {tx('legacy.m057')}
            </span>
          </div>
          <div className="view-controls">
            <Choice
              disabled={s.solving}
              label={tx('legacy.m058')}
              value={s.view}
              options={[
                ['normal', tx('legacy.m059')],
                ['hidden', tx('legacy.m060')],
                ['six', tx('legacy.m316')],
                ['net', tx('legacy.m062')],
              ]}
              onChange={(view) => patch({ view: view as View })}
            />
            <Toggle
              label={tx('camera.minimal')}
              value={s.settings.minimal}
              onChange={(minimal) => settings({ minimal })}
            />
          </div>
          {s.solving && (
            <output className="solve-lock">{tx('legacy.m317')}</output>
          )}
          {s.presentation && (
            <div className="presentation-hint">
              {s.settings.autoRotate ? tx('legacy.m318') : tx('legacy.m319')}
            </div>
          )}
          <div className="stage-bottom">
            <div className="interaction-hint">
              <MousePointer2 size={15} />
              <span>
                {s.mode === 'customize'
                  ? tx('legacy.m063')
                  : s.mode === 'explode' || s.mode === 'camera'
                    ? tx('legacy.m320')
                    : tx('legacy.m321')}
              </span>
            </div>
            <div className="camera-buttons">
              <button
                aria-label={tx('legacy.m068')}
                title={tx('legacy.m068')}
                onClick={() => cameraActions.reset()}
              >
                <RotateCcw size={16} />
              </button>
              <button
                aria-label={tx('legacy.m069')}
                onClick={() => cameraActions.fit()}
              >
                <Focus size={18} />
                <span>{tx('legacy.m069')}</span>
              </button>
            </div>
          </div>
          <div className="object-spec">
            <span>{tx('app.pieces', { count: 14 })}</span>
            <span>{tx('app.axes', { count: 4 })}</span>
            <span>{tx('app.tiles', { count: 36 })}</span>
          </div>
          {!s.ready && (
            <div className="loading-overlay">
              <Pyramid size={36} />
              <strong>AXIS / 04</strong>
              <span>{tx('legacy.m322')}</span>
              <div className="loading-bar" />
            </div>
          )}
        </section>
        <WorkspacePanel controller={panel}>
          <section {...section('play')}>
            <section className="panel-section magnetic-controls">
              <div className="section-head">
                <h3>{tx('legacy.m074')}</h3>
                <span className="tag">
                  {s.settings.magnetStrength === 0
                    ? tx('legacy.m075')
                    : tx('legacy.m076')}
                </span>
              </div>
              <Range
                label={tx('legacy.m077')}
                value={s.settings.magnetStrength}
                min={0}
                max={2}
                step={0.05}
                disabled={s.solving}
                onChange={(magnetStrength) => settings({ magnetStrength })}
              />
              <Range
                label={tx('legacy.m078')}
                value={s.settings.magnetDamping}
                min={0.05}
                max={2}
                step={0.05}
                disabled={s.solving}
                onChange={(magnetDamping) => settings({ magnetDamping })}
              />
              <Range
                label={tx('legacy.m079')}
                value={s.settings.turnTolerance}
                min={0}
                max={60}
                step={1}
                digits={0}
                unit="°"
                disabled={s.solving}
                onChange={(turnTolerance) => settings({ turnTolerance })}
              />
            </section>
            <div className="quick-actions">
              <button
                className="primary-button"
                disabled={locked}
                onClick={newScramble}
              >
                <Shuffle size={17} />
                {tx('legacy.m084')}
              </button>
              <button
                className="secondary-button"
                disabled={locked}
                onClick={resetPuzzle}
              >
                <RotateCcw size={16} />
                {tx('legacy.m085')}
              </button>
            </div>
            <div className="history-actions">
              <button
                disabled={locked || !s.cursor}
                onClick={() => void undo()}
              >
                <Undo2 size={16} />
                {tx('legacy.m086')}
              </button>
              <button
                disabled={locked || s.cursor === s.history.length}
                onClick={() => void redo()}
              >
                <Redo2 size={16} />
                {tx('legacy.m087')}
              </button>
              <span>
                {s.cursor} / {s.history.length}
              </span>
            </div>
            <Toggle
              label={tx('legacy.m088')}
              value={animated}
              onChange={setAnimated}
            />
            {s.scramble && (
              <div className="scramble-record">
                <div className="control-label">
                  <span>{tx('legacy.m089')}</span>
                  <button
                    aria-label={tx('legacy.m090')}
                    onClick={() =>
                      void navigator.clipboard.writeText(s.scramble).then(
                        () => notify(tx('legacy.m091')),
                        () => notify(tx('legacy.m092')),
                      )
                    }
                  >
                    <Copy size={14} />
                  </button>
                </div>
                <p>{s.scramble}</p>
              </div>
            )}
            <section className="panel-section">
              <div className="section-head">
                <h3>{tx('legacy.m328')}</h3>
                <div className="modifier-buttons">
                  <button
                    className={!reverse ? 'active' : ''}
                    onClick={() => setReverse(false)}
                  >
                    120°
                  </button>
                  <button
                    className={reverse ? 'active' : ''}
                    onClick={() => setReverse(true)}
                  >
                    −120°
                  </button>
                </div>
              </div>
              <Choice
                disabled={s.solving}
                label={tx('legacy.m329')}
                value={layer}
                options={[
                  ['tip', tx('legacy.m330')],
                  ['body', tx('legacy.m331')],
                  ['base', tx('legacy.m332')],
                ]}
                onChange={(value) => setLayer(value as Layer)}
              />
              <div className="face-moves pyr-face-moves">
                {AXES.map((axis, i) => (
                  <button
                    key={axis}
                    disabled={s.solving || (s.busy && !s.settling)}
                    onClick={() =>
                      void perform(moveToken(i, layer, reverse ? -1 : 1))
                    }
                  >
                    <i style={{ background: FACE_COLORS[i] }} />
                    <strong>{moveToken(i, layer, reverse ? -1 : 1)}</strong>
                  </button>
                ))}
              </div>
              <details className="pyr-keybindings">
                <summary>{tx('legacy.m236')}</summary>
                {Object.entries(s.keybindings).map(([action, value]) => (
                  <label key={action}>
                    <span>
                      {(
                        {
                          undo: tx('legacy.m086'),
                          redo: tx('legacy.m087'),
                          playPause: tx('legacy.m335'),
                          exitPresentation: tx('legacy.m336'),
                        } as Record<string, string>
                      )[action] || action}
                    </span>
                    <input
                      aria-label={tx('legacy.m337', { p0: action })}
                      readOnly
                      value={formatShortcut(value)}
                      disabled={s.solving}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        if (e.key === 'Escape') {
                          e.currentTarget.blur();
                          return;
                        }
                        const key =
                          e.key === 'Delete' || e.key === 'Backspace'
                            ? ''
                            : keyboardShortcut(e.nativeEvent);
                        if (key === null) return;
                        if (
                          key &&
                          Object.entries(s.keybindings).some(
                            ([a, k]) => a !== action && k === key,
                          )
                        ) {
                          notify(tx('legacy.m338'));
                          return;
                        }
                        patch({
                          keybindings: { ...s.keybindings, [action]: key },
                        });
                        e.currentTarget.blur();
                      }}
                    />
                  </label>
                ))}
                <button
                  className="wide-button"
                  onClick={() => patch({ keybindings: defaultKeys() })}
                >
                  {tx('legacy.m239')}
                </button>
              </details>
            </section>
            <section className="panel-section">
              <div className="section-head">
                <h3>{tx('legacy.m009')}</h3>
                <span className="tag">{tx('puzzle.pyraminx')}</span>
              </div>
              <div className="algorithm-presets">
                {s.presets.map((p, i) => (
                  <button
                    key={`${presetLabel(p)}-${i}`}
                    className={algorithm === p.algorithm ? 'active' : ''}
                    onClick={() => setAlgorithm(p.algorithm)}
                  >
                    {presetLabel(p)}
                  </button>
                ))}
              </div>
              <textarea
                className="pyr-algorithm"
                aria-label={tx('legacy.m339')}
                value={algorithm}
                onChange={(e) => setAlgorithm(e.target.value)}
                spellCheck={false}
              />
              <button
                className="wide-button"
                disabled={locked}
                onClick={() => runAlgorithm(algorithm)}
              >
                {tx('legacy.m018')}
                <Play size={16} />
              </button>
              <div className="pyr-button-row">
                <input
                  className="pyr-text-input"
                  aria-label={tx('legacy.m021')}
                  placeholder={tx('legacy.m021')}
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
                <button
                  className="secondary-button"
                  disabled={locked}
                  onClick={addPreset}
                >
                  {tx('legacy.m016')}
                </button>
              </div>
              <div className="pyr-button-row">
                <button
                  onClick={() =>
                    download(s.presets, 'AXIS-pyraminx-algorithms.json')
                  }
                >
                  <Download size={14} />
                  {tx('legacy.m340')}
                </button>
                <button
                  disabled={locked}
                  onClick={() => algorithmInput.current?.click()}
                >
                  <Upload size={14} />
                  {tx('legacy.m341')}
                </button>
                <button
                  disabled={locked}
                  onClick={() => patch({ presets: defaultPresets() })}
                >
                  {tx('legacy.m342')}
                </button>
              </div>
            </section>
          </section>
          <section {...section('explode')}>
            <Range
              label={tx('legacy.m097')}
              value={s.settings.explode}
              min={0}
              max={3}
              disabled={s.solving}
              onChange={(explode) => {
                settings({ explode });
              }}
            />
            <div className="explode-presets">
              {[
                tx('legacy.m098'),
                tx('legacy.m099'),
                tx('legacy.m100'),
                tx('legacy.m101'),
              ].map((label, explode) => (
                <button
                  key={label}
                  disabled={s.solving}
                  className={
                    Math.abs(s.settings.explode - explode) < 0.03
                      ? 'active'
                      : ''
                  }
                  onClick={() => {
                    settings({ explode });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <Range
              label={tx('legacy.m102')}
              value={s.settings.internal}
              min={0}
              max={1.5}
              disabled={s.solving}
              onChange={(internal) => settings({ internal })}
            />
            <Range
              label={tx('legacy.m103')}
              value={s.settings.gap}
              min={0}
              max={0.3}
              step={0.001}
              digits={3}
              disabled={s.solving}
              onChange={(gap) => settings({ gap })}
            />
            <Range
              label={tx('legacy.m104')}
              value={s.settings.size}
              min={0.65}
              max={1.08}
              disabled={s.solving}
              onChange={(size) => settings({ size })}
            />
            <Range
              label={tx('legacy.m105')}
              value={s.settings.stickerOffset}
              min={0}
              max={0.2}
              disabled={s.solving}
              onChange={(stickerOffset) => settings({ stickerOffset })}
            />
            <Toggle
              label={tx('legacy.m106')}
              value={s.settings.showMagnets}
              disabled={s.solving}
              onChange={(showMagnets) => settings({ showMagnets })}
            />
            <button
              className="wide-button"
              disabled={s.solving}
              onClick={() => {
                settings(assemblyDefaults('pyraminx'));
                cameraActions.reset();
              }}
            >
              {tx('legacy.m107')}
              <RotateCcw size={16} />
            </button>
            <div className="part-legend">
              <h3>{tx('legacy.m108')}</h3>
              {[
                [tx('legacy.m345'), 4],
                [tx('legacy.m346'), 4],
                [tx('legacy.m347'), 6],
                [tx('legacy.m348'), 36],
                [tx('legacy.m349'), 4],
              ].map(([label, count]) => (
                <p key={label}>
                  <i style={{ background: '#c7d5ad' }} />
                  {label}
                  <span>{count}</span>
                </p>
              ))}
            </div>
          </section>
          <section {...section('customize')}>
            <div className="section-head">
              <h3>{tx('legacy.m350')}</h3>
              <span className="tag">
                {s.selected.length}
                {tx('legacy.m351')}
              </span>
            </div>
            <div className="face-selector">
              {FACE_NAMES.map((name, i) => (
                <button
                  key={i}
                  className={s.editFace === i ? 'active' : ''}
                  aria-pressed={s.editFace === i}
                  onClick={() => {
                    patch({
                      editFace: i,
                      selected: TILES.filter((t) => t.face === i).map(
                        (t) => t.id,
                      ),
                    });
                    cameraActions.face(i);
                  }}
                >
                  <i style={{ background: FACE_COLORS[i] }} />
                  {name}
                </button>
              ))}
            </div>
            <div className="editor-face">
              <TilePicker />
            </div>
            <div className="selection-actions">
              <button
                disabled={s.solving}
                onClick={() =>
                  patch({
                    selected: TILES.filter((t) => t.face === s.editFace).map(
                      (t) => t.id,
                    ),
                  })
                }
              >
                {tx('legacy.m160')}
              </button>
              <button
                disabled={s.solving}
                onClick={() => patch({ selected: [] })}
              >
                {tx('legacy.m353')}
              </button>
            </div>
            <div className="color-control">
              <label htmlFor="pyr-color">{tx('legacy.m354')}</label>
              <input
                id="pyr-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <button
                className="secondary-button"
                disabled={s.solving || !s.selected.length}
                onClick={() => {
                  const colors = { ...s.colors };
                  s.selected.forEach((id) => {
                    colors[id] = color;
                  });
                  patch({ colors });
                }}
              >
                {tx('legacy.m355')}
              </button>
            </div>
            <div className="palette-presets">
              {PYRAMINX_PALETTES.map(({ name, colors }) => (
                <button
                  key={String(name)}
                  disabled={s.solving}
                  onClick={() =>
                    patch({
                      colors: Object.fromEntries(
                        TILES.map((t) => [t.id, colors[t.face]]),
                      ),
                    })
                  }
                >
                  <span>
                    {colors.map((c) => (
                      <i key={c} style={{ background: c }} />
                    ))}
                  </span>
                  {name}
                </button>
              ))}
            </div>
            <section className="panel-section">
              <h3>{tx('legacy.m356')}</h3>
              <button
                className="wide-button"
                disabled={s.solving}
                onClick={() => photoInput.current?.click()}
              >
                {tx('legacy.m358')}
                <Upload size={16} />
              </button>
              {s.photos[s.editFace] && (
                <>
                  <button
                    className="wide-button"
                    disabled={s.solving}
                    onClick={() =>
                      setPhoto({
                        face: s.editFace,
                        photo: s.photos[s.editFace],
                      })
                    }
                  >
                    {tx('legacy.m176')}
                    <Focus size={16} />
                  </button>
                  <button
                    className="wide-button"
                    disabled={s.solving}
                    onClick={() => {
                      const photos = { ...s.photos };
                      delete photos[s.editFace];
                      patch({ photos });
                    }}
                  >
                    {tx('legacy.m359')}
                    <X size={16} />
                  </button>
                </>
              )}
            </section>
            <section className="panel-section">
              <h3>{tx('legacy.m360')}</h3>
              <button
                className="wide-button"
                disabled={locked}
                onClick={() => download(captureProject(), 'AXIS-pyraminx.json')}
              >
                {tx('legacy.m361')}
                <Download size={16} />
              </button>
              <button
                className="wide-button"
                disabled={locked}
                onClick={() => importInput.current?.click()}
              >
                {tx('legacy.m362')}
                <Upload size={16} />
              </button>
              <button
                className="wide-button"
                disabled={locked}
                onClick={() => patch({ colors: defaultColors(), photos: {} })}
              >
                {tx('legacy.m363')}
                <RotateCcw size={16} />
              </button>
            </section>
          </section>
          <section {...section('solver')}>
            <div className="section-head">
              <h3>{tx('legacy.m365')}</h3>
              <span className="tag">{tx('legacy.m366')}</span>
            </div>
            <button
              className="wide-button"
              disabled={s.busy}
              onClick={() => {
                if (s.solving) cancelSolve();
                else void startSolve();
              }}
            >
              {s.solving ? tx('legacy.m368') : tx('legacy.m369')}
              {s.solving ? (
                <CircleStop size={16} />
              ) : (
                <WandSparkles size={16} />
              )}
            </button>
            {s.solving && (
              <output className="microcopy">{s.solveStatus}</output>
            )}
            <Range
              label={tx('legacy.m255')}
              value={s.settings.speed}
              min={0.2}
              max={3}
              step={0.1}
              digits={1}
              unit="×"
              disabled={s.solving}
              onChange={(speed) => settings({ speed })}
            />
            <Choice
              disabled={s.solving}
              label={tx('legacy.m370')}
              value={s.settings.easing}
              options={[
                ['magnetic', tx('legacy.m371')],
                ['smooth', tx('legacy.m137')],
                ['linear', tx('legacy.m138')],
              ]}
              onChange={(value) =>
                settings({ easing: value as typeof s.settings.easing })
              }
            />
            {s.player && (
              <div className="pyr-player">
                <div className="section-head">
                  <h3>{s.player.title}</h3>
                  <span className="tag">
                    {s.player.index} / {s.player.moves.length}
                  </span>
                </div>
                <div className="player-buttons">
                  <button
                    aria-label={tx('legacy.m249')}
                    disabled={locked || !s.player.index}
                    onClick={() => void previous()}
                  >
                    <SkipBack size={19} />
                  </button>
                  <button
                    aria-label={
                      s.player.playing ? tx('legacy.m372') : tx('legacy.m373')
                    }
                    disabled={s.solving || (s.busy && !s.player.playing)}
                    onClick={() => {
                      if (s.player?.playing) pause();
                      else void play();
                    }}
                  >
                    {s.player.playing ? (
                      <Pause size={23} />
                    ) : (
                      <Play size={23} />
                    )}
                  </button>
                  <button
                    aria-label={tx('legacy.m251')}
                    disabled={
                      locked || s.player.index === s.player.moves.length
                    }
                    onClick={() => void next()}
                  >
                    <SkipForward size={19} />
                  </button>
                  <button
                    aria-label={tx('legacy.m374')}
                    disabled={s.solving}
                    onClick={() => {
                      pause();
                      patch({ player: null });
                    }}
                  >
                    <CircleStop size={18} />
                  </button>
                </div>
                <input
                  className="pyr-player-range"
                  aria-label={tx('legacy.m375')}
                  type="range"
                  min={0}
                  max={s.player.moves.length}
                  step={1}
                  value={s.player.index}
                  disabled={locked}
                  onChange={(e) => void seek(Number(e.target.value))}
                />
                {s.player.bodyLength !== undefined && (
                  <div className="pyr-button-row">
                    <button disabled={locked} onClick={() => void seek(0)}>
                      {tx('legacy.m376')}
                    </button>
                    <button
                      disabled={locked}
                      onClick={() => void seek(s.player!.bodyLength!)}
                    >
                      {tx('legacy.m377')}
                    </button>
                    <button
                      disabled={locked}
                      onClick={() => void seek(s.player!.moves.length)}
                    >
                      {tx('legacy.m378')}
                    </button>
                  </div>
                )}
                <div className="pyr-move-list">
                  {s.player.moves.map((move, i) => (
                    <button
                      key={i}
                      className={
                        i < s.player!.index
                          ? 'done'
                          : i === s.player!.index
                            ? 'current'
                            : ''
                      }
                      disabled={locked}
                      onClick={() => void seek(i + 1)}
                    >
                      {move}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
          <section {...section('camera')}>
            <div className="section-head">
              <h3>{tx('legacy.m379')}</h3>
            </div>
            <div className="camera-grid">
              {FACE_NAMES.map((name, face) => (
                <button key={name} onClick={() => cameraActions.face(face)}>
                  <i style={{ background: FACE_COLORS[face] }} />
                  {name}
                </button>
              ))}
            </div>
            <Toggle
              label={tx('legacy.m380')}
              value={s.settings.autoRotate}
              disabled={s.solving}
              onChange={(autoRotate) => settings({ autoRotate })}
            />
            <Range
              label={tx('legacy.m381')}
              value={s.settings.roughness}
              min={0.05}
              max={1}
              disabled={s.solving}
              onChange={(roughness) => settings({ roughness })}
            />
            <Choice
              disabled={s.solving}
              label={tx('legacy.m131')}
              value={s.settings.quality}
              options={[
                ['auto', tx('legacy.m382')],
                ['high', tx('legacy.m133')],
                ['low', tx('legacy.m383')],
              ]}
              onChange={(quality) =>
                settings({ quality: quality as typeof s.settings.quality })
              }
            />
            <section className="panel-section">
              <h3>{tx('legacy.m125')}</h3>
              <Toggle
                label={tx('legacy.m384')}
                value={s.settings.lightFollowCamera}
                disabled={s.solving}
                onChange={(lightFollowCamera) =>
                  settings({ lightFollowCamera })
                }
              />
              <Range
                label={tx('legacy.m128')}
                value={s.settings.lightAzimuth}
                min={-180}
                max={180}
                digits={0}
                unit="°"
                disabled={s.solving}
                onChange={(lightAzimuth) => settings({ lightAzimuth })}
              />
              <Range
                label={tx('legacy.m129')}
                value={s.settings.lightElevation}
                min={-10}
                max={90}
                digits={0}
                unit="°"
                disabled={s.solving}
                onChange={(lightElevation) => settings({ lightElevation })}
              />
              <Range
                label={tx('legacy.m130')}
                value={s.settings.lightIntensity}
                min={0}
                max={6}
                disabled={s.solving}
                onChange={(lightIntensity) => settings({ lightIntensity })}
              />
            </section>
            <button
              className="wide-button"
              disabled={s.solving}
              onClick={() => setPresentation(true)}
            >
              {tx('legacy.m139')}
              <Eye size={16} />
            </button>
          </section>
          <section {...section('inspect')}>
            <div className="section-head">
              <h3>{tx('legacy.m385')}</h3>
              <span className="tag">
                {solved ? tx('legacy.m055') : tx('legacy.m386')}
              </span>
            </div>
            {selectedTile && (
              <div className="pyr-piece-info">
                <strong>{PIECES[selectedTile.piece].id}</strong>
                <p>
                  {PIECES[selectedTile.piece].kind === 'tip'
                    ? tx('legacy.m388')
                    : PIECES[selectedTile.piece].kind === 'center'
                      ? tx('legacy.m389')
                      : tx('legacy.m390')}
                </p>
                <p>
                  {tx('legacy.m391')}
                  {FACE_NAMES[selectedTile.face]}
                </p>
                <button
                  className="wide-button"
                  onClick={() => cameraActions.focus()}
                >
                  {tx('legacy.m392')}
                  <Focus size={16} />
                </button>
              </div>
            )}
            <button
              className="wide-button"
              disabled={
                s.solving ||
                (!s.cursor && s.player?.title !== tx('legacy.m393'))
              }
              onClick={() => {
                if (s.player?.title === tx('legacy.m393')) {
                  pause();
                  patch({ player: null });
                } else replayHistory();
              }}
            >
              {s.player?.title === tx('legacy.m393')
                ? tx('legacy.m394', {
                    p0: s.player.index,
                    p1: s.player.moves.length,
                  })
                : tx('legacy.m151')}
              {s.player?.title === tx('legacy.m393') ? (
                <CircleStop size={16} />
              ) : (
                <Play size={16} />
              )}
            </button>
            <div className="pyr-move-list">
              {s.history.map((move, i) => (
                <span key={i} className={i < s.cursor ? 'done' : ''}>
                  {move}
                </span>
              ))}
            </div>
          </section>
        </WorkspacePanel>
      </div>
      <WorkspaceFooter mode={s.mode} explode={s.settings.explode} />
      {(s.notice || cubeNotice.notice) && (
        <output className="toast">
          <Check size={16} />
          {s.notice || cubeNotice.notice}
        </output>
      )}
      <input
        ref={importInput}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file)
            void readJSON(file)
              .then(
                (value) => {
                  importProject(value);
                  notify(tx('legacy.m400'));
                },
                (error) => notify((error as Error).message),
              )
              .catch((error) => notify((error as Error).message));
        }}
      />
      <input
        ref={algorithmInput}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file)
            void readJSON(file)
              .then((value) => {
                const presets = [...getState().presets];
                for (const preset of validatePresets(value)) {
                  if (presets.some((p) => p.algorithm === preset.algorithm))
                    continue;
                  let name = preset.name,
                    index = 2;
                  while (presets.some((p) => p.name === name))
                    name = `${preset.name} ${index++}`;
                  presets.push({ ...preset, name });
                }
                if (presets.length > 100) throw new Error(tx('legacy.m401'));
                patch({ presets });
                notify(tx('legacy.m402'));
              })
              .catch((error) => notify((error as Error).message));
        }}
      />
      <input
        ref={photoInput}
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void uploadPhoto(file);
        }}
      />
      {photo && (
        <PhotoDialog
          face={photo.face}
          photo={photo.photo}
          onClose={() => setPhoto(null)}
          onApply={(value) => {
            patch({ photos: { ...getState().photos, [photo.face]: value } });
            setPhoto(null);
          }}
        />
      )}
    </main>
  );
}
