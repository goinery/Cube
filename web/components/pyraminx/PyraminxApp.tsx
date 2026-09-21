import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Box,
  Check,
  CircleStop,
  Copy,
  Download,
  Expand,
  Eye,
  Focus,
  Layers3,
  MousePointer2,
  Move3D,
  Palette,
  Pause,
  Play,
  Pyramid,
  Redo2,
  RotateCcw,
  Save,
  Scan,
  Shuffle,
  SkipBack,
  SkipForward,
  Undo2,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import PuzzleSwitcher, { type PuzzleType } from '../cube/PuzzleSwitcher';
import { Choice, Range, Toggle } from '../cube/Controls';
import { useCube, type Mode, type View } from '@/lib/cube/store';
import { formatShortcut, keyboardShortcut } from '@/lib/cube/keybindings';
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

const modes = [
  ['play', '玩魔方', Box],
  ['explode', '拆解', Layers3],
  ['customize', '定制', Palette],
  ['solver', '求解', WandSparkles],
  ['camera', '视角', Move3D],
  ['inspect', '检查', Scan],
] as const;
const phone =
  '(max-width: 760px), (max-height: 530px) and (orientation: landscape)';
const landscape = '(max-height: 530px) and (orientation: landscape)';
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
  if (file.size > 12_000_000)
    throw new Error('文件过大，请选择 12 MB 以内的方案。');
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
  const [draft, setDraft] = useState(photo),
    [photoImage, setPhotoImage] = useState<HTMLImageElement | null>(null),
    preview = useRef<HTMLCanvasElement>(null),
    dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ x: number; y: number; base: Photo } | null>(null);
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
        if (active) notify('图片无法解码，请重新选择。');
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
        <h3>{FACE_NAMES[face]} · 整面图片预览</h3>
        <button aria-label="取消图片编辑" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div
        className="pyr-photo-preview"
        style={{ aspectRatio: `1 / ${FACE_HEIGHT_RATIO}` }}
        aria-label="正三角形整面图片预览"
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
          <canvas ref={preview} aria-label="金字塔整面照片裁切预览" />
        </div>
        <svg
          viewBox="0 0 300 300"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M150 0 L0 300 L300 300 Z M100 100 L200 100 M50 200 L250 200 M100 100 L200 300 M200 100 L100 300 M50 200 L100 300 M250 200 L200 300 M50 200 L100 100 M250 200 L200 100" />
        </svg>
      </div>
      <p className="microcopy">
        拖动图片定位，正三角形范围内的内容会铺满九片外壳。
      </p>
      <Range
        label="图片缩放"
        value={draft.scale}
        min={0.25}
        max={4}
        onChange={(scale) => setDraft({ ...draft, scale })}
      />
      <Range
        label="图片旋转"
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
          重置裁切
        </button>
        <button className="secondary-button" onClick={onClose}>
          取消
        </button>
        <button className="primary-button" onClick={() => onApply(draft)}>
          应用图片
        </button>
      </div>
    </dialog>
  );
}
function TilePicker() {
  const s = usePyraminx();
  return (
    <div
      className="pyr-tile-picker"
      style={{ aspectRatio: `1 / ${FACE_HEIGHT_RATIO}` }}
      aria-label="选择三角贴片"
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
            aria-label={`${PIECES[tile.piece].kind} ${tile.id}`}
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
  const s = usePyraminx(),
    cubeNotice = useCube('notice');
  const [layer, setLayer] = useState<Layer>('body'),
    [reverse, setReverse] = useState(false),
    [animated, setAnimated] = useState(true);
  const [algorithm, setAlgorithm] = useState("R U R' U R U R' U"),
    [presetName, setPresetName] = useState('');
  const [color, setColor] = useState(FACE_COLORS[3]),
    [photo, setPhoto] = useState<{ face: number; photo: Photo } | null>(null);
  const [mobile, setMobile] = useState(() => matchMedia(phone).matches),
    [rail, setRail] = useState(() => matchMedia(landscape).matches);
  const [panelOpen, setPanelOpen] = useState(() => !matchMedia(phone).matches),
    [sheetSize, setSheetSize] = useState<number | null>(null);
  const scroll = useRef<HTMLDivElement>(null),
    panel = useRef<HTMLElement>(null),
    handle = useRef<HTMLButtonElement>(null),
    nav = useRef<HTMLElement>(null);
  const sections = useRef<Partial<Record<Mode, HTMLElement | null>>>({});
  const sheetDrag = useRef<{
      origin: number;
      size: number;
      min: number;
      max: number;
      moved: boolean;
      next: number;
    } | null>(null),
    lastSheet = useRef<number | null>(null),
    suppressClick = useRef(false),
    pendingMode = useRef<Mode | null>(null);
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
    const p = matchMedia(phone),
      r = matchMedia(landscape),
      sync = () => {
        setMobile(p.matches);
        setRail(r.matches);
        setSheetSize(null);
      };
    p.addEventListener('change', sync);
    r.addEventListener('change', sync);
    return () => {
      p.removeEventListener('change', sync);
      r.removeEventListener('change', sync);
    };
  }, []);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        (e.target instanceof HTMLElement &&
          e.target.closest(
            'input,textarea,select,[contenteditable=true],[role=slider],[role=combobox],dialog,summary',
          ))
      )
        return;
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
  function jump(mode: Mode) {
    if (s.solving && mode !== 'solver') return;
    patch({ mode });
    pendingMode.current = mode;
    setPanelOpen(true);
    requestAnimationFrame(() => {
      const node = sections.current[mode];
      if (node && scroll.current)
        scroll.current.scrollTop = node.offsetTop - scroll.current.offsetTop;
      pendingMode.current = null;
    });
  }
  function trackScroll() {
    if (pendingMode.current || s.solving || !scroll.current) return;
    const top =
      scroll.current.getBoundingClientRect().top +
      Math.min(100, scroll.current.clientHeight * 0.25);
    let mode: Mode = 'play';
    for (const [id] of modes)
      if (
        (sections.current[id]?.getBoundingClientRect().top ?? Infinity) <= top
      )
        mode = id;
    if (getState().mode !== mode) patch({ mode });
  }
  function startSheet(e: React.PointerEvent<HTMLButtonElement>) {
    if (!mobile || !panel.current) return;
    const min = rail
      ? 42
      : (handle.current?.offsetHeight ?? 32) +
        (nav.current?.offsetHeight ?? 48);
    const parent = panel.current.parentElement!,
      max = Math.max(
        min + 80,
        rail ? parent.clientWidth - 320 : parent.clientHeight - 300,
      );
    const size = rail ? panel.current.offsetWidth : panel.current.offsetHeight;
    sheetDrag.current = {
      origin: rail ? e.clientX : e.clientY,
      size,
      min,
      max,
      moved: false,
      next: size,
    };
    suppressClick.current = false;
    setSheetSize(size);
    setPanelOpen(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveSheet(e: React.PointerEvent<HTMLButtonElement>) {
    const d = sheetDrag.current;
    if (!d) return;
    const delta = (rail ? e.clientX : e.clientY) - d.origin;
    d.moved ||= Math.abs(delta) > 5;
    d.next = Math.max(d.min, Math.min(d.max, d.size - delta));
    setSheetSize(d.next);
  }
  function endSheet(cancelled = false) {
    const d = sheetDrag.current;
    if (!d) return;
    sheetDrag.current = null;
    suppressClick.current = true;
    const open = cancelled
      ? d.size > d.min + 1
      : d.moved
        ? d.next > d.min + 24
        : d.size <= d.min + 1;
    setPanelOpen(open);
    if (open) {
      const size = cancelled ? d.size : d.moved ? d.next : lastSheet.current;
      setSheetSize(size);
      lastSheet.current = size;
    } else setSheetSize(null);
  }
  async function uploadPhoto(file: File) {
    try {
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20_000_000)
        throw new Error('请选择 20 MB 以内的 PNG、JPEG 或 WebP 图片。');
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
      loadPlayer(moves, '随机打乱');
      void play();
    } else await applyInstant(moves);
  }
  function addPreset() {
    try {
      const moves = parseAlgorithm(algorithm);
      if (!moves.length || !presetName.trim())
        throw new Error('请输入算法名称和公式。');
      if (s.presets.length >= 100) throw new Error('最多保存 100 个算法。');
      if (s.presets.some((p) => p.algorithm === moves.join(' ')))
        throw new Error('这条公式已在算法列表中。');
      patch({
        presets: [
          ...s.presets,
          { name: presetName.trim().slice(0, 80), algorithm: moves.join(' ') },
        ],
      });
      setPresetName('');
      notify('算法已添加。');
    } catch (error) {
      notify((error as Error).message);
    }
  }
  const locked = s.busy || s.solving,
    solved = !s.partials.length && isSolved(s.puzzle),
    selectedTile = TILES.find((t) => t.id === s.selected[0]);
  const sheetStyle =
    sheetSize === null
      ? undefined
      : ({
          [rail ? '--sheet-w' : '--sheet-h']: `${sheetSize}px`,
        } as CSSProperties);
  const attachSection = useCallback((node: HTMLElement | null) => {
    if (node) sections.current[node.dataset.section as Mode] = node;
  }, []);
  const section = (id: Mode) => ({
    className: `panel-block${s.mode === id ? ' active' : ''}`,
    'data-section': id,
    ref: attachSection,
  });
  return (
    <main
      className={`cube-app pyr-app ${s.presentation ? 'presentation' : ''} ${panelOpen ? '' : 'panel-collapsed'}`}
    >
      <header className="app-header">
        <div className="brand">
          <PuzzleSwitcher
            value="pyraminx"
            onChange={(type) => {
              pause();
              onSwitch(type);
            }}
            disabled={locked}
          />
          <strong>
            AXIS<span>/</span>04
          </strong>
          <span className="brand-divider" />
          <span className="brand-subtitle">魔方工作室</span>
        </div>
        <div className="header-center">
          MAGNETIC PYRAMINX <span>·</span> DIGITAL EDITION
        </div>
        <div className="header-actions">
          <div className="autosave-switch">
            <Toggle
              label="自动保存"
              value={s.autoSave}
              onChange={setAutoSave}
            />
          </div>
          <button
            className="icon-button"
            aria-label="保存当前状态"
            title="保存当前状态"
            disabled={locked}
            onClick={() => saveLocal()}
          >
            <Save size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="全屏"
            title="全屏"
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void document.documentElement
                  .requestFullscreen()
                  .catch(() => notify('可使用浏览器菜单进入全屏。'));
            }}
          >
            <Expand size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={s.presentation ? '退出展示模式' : '展示模式'}
            title="展示模式"
            disabled={s.solving}
            onClick={() => setPresentation(!s.presentation)}
          >
            <Eye size={18} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <section className="stage" inert={s.solving}>
          <Viewport />
          <div className="stage-state">
            <i className={solved ? 'solved' : ''} />
            <span>
              {s.currentMove
                ? `转动 ${s.currentMove}`
                : s.partials.length
                  ? '转层未对齐'
                  : solved
                    ? '已复原'
                    : '自由探索'}
            </span>
            <span className="state-divider" />
            <span>{s.cursor} 步</span>
          </div>
          <div className="view-controls">
            <Choice
              label="视图"
              value={s.view}
              options={[
                ['normal', '纯 3D'],
                ['hidden', '隐藏面映射'],
                ['six', '四面总览'],
                ['net', '平面展开'],
              ]}
              onChange={(view) => patch({ view: view as View })}
            />
          </div>
          {s.solving && (
            <output className="solve-lock">正在计算 · 可在求解面板终止</output>
          )}
          {s.presentation && (
            <div className="presentation-hint">
              {s.settings.autoRotate
                ? '自动旋转中 · 点击空白暂停'
                : '自动旋转已暂停 · 点击空白继续'}
            </div>
          )}
          <div className="stage-bottom">
            <div className="interaction-hint">
              <MousePointer2 size={15} />
              <span>
                {s.mode === 'customize'
                  ? '点击贴片多选 · 在右侧编辑外观'
                  : s.mode === 'explode' || s.mode === 'camera'
                    ? '拖动旋转视角 · Shift 滚转 · 双指或滚轮缩放'
                    : '顶角单转 · 棱块转底层 · 中心转上两层'}
              </span>
            </div>
            <div className="camera-buttons">
              <button
                aria-label="重置视角"
                title="重置视角"
                onClick={() => cameraActions.reset()}
              >
                <RotateCcw size={16} />
              </button>
              <button aria-label="适配视图" onClick={() => cameraActions.fit()}>
                <Focus size={18} />
                <span>适配视图</span>
              </button>
            </div>
          </div>
          <div className="object-spec">
            <span>14 PIECES</span>
            <span>4 AXES</span>
            <span>36 TILES</span>
          </div>
          {!s.ready && (
            <div className="loading-overlay">
              <Pyramid size={36} />
              <strong>AXIS / 04</strong>
              <span>正在装配金字塔模型…</span>
              <div className="loading-bar" />
            </div>
          )}
        </section>
        <aside className="control-panel" ref={panel} style={sheetStyle}>
          <button
            className="mobile-handle"
            ref={handle}
            aria-expanded={panelOpen}
            aria-label="展开或收起控制面板，可拖动调整高度"
            onPointerDown={startSheet}
            onPointerMove={moveSheet}
            onPointerUp={() => endSheet()}
            onPointerCancel={() => endSheet(true)}
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              setPanelOpen(!panelOpen);
            }}
          >
            <span className="handle-bar" />
          </button>
          <nav className="panel-nav" ref={nav} aria-label="金字塔控制面板">
            {modes.map(([mode, title, Icon]) => (
              <button
                key={mode}
                className={s.mode === mode ? 'active' : ''}
                aria-current={s.mode === mode ? 'page' : undefined}
                disabled={s.solving && mode !== 'solver'}
                onClick={() => jump(mode)}
              >
                <Icon size={19} />
                {title}
              </button>
            ))}
          </nav>
          <div className="panel-scroll" ref={scroll} onScroll={trackScroll}>
            <section {...section('play')}>
              <div className="pyr-intro">
                <span className="tag">PYRAMINX / 120°</span>
                <h2>四轴，三种转动。</h2>
                <p>从指尖的一次轻转开始。</p>
              </div>
              <section className="panel-section magnetic-controls">
                <div className="section-head">
                  <h3>磁力与手感</h3>
                  <span className="tag">
                    {s.settings.magnetStrength === 0 ? '无磁力' : '磁力归位'}
                  </span>
                </div>
                <Range
                  label="磁力强度"
                  value={s.settings.magnetStrength}
                  min={0}
                  max={2}
                  step={0.05}
                  disabled={s.solving}
                  onChange={(magnetStrength) => settings({ magnetStrength })}
                />
                <Range
                  label="归位阻尼"
                  value={s.settings.magnetDamping}
                  min={0.05}
                  max={2}
                  step={0.05}
                  disabled={s.solving}
                  onChange={(magnetDamping) => settings({ magnetDamping })}
                />
                <Range
                  label="转层容错角度"
                  value={s.settings.turnTolerance}
                  min={0}
                  max={120}
                  step={1}
                  digits={0}
                  unit="°"
                  disabled={s.solving}
                  onChange={(turnTolerance) => settings({ turnTolerance })}
                />
                <p className="microcopy">
                  松手吸附到 120° 倍数。磁力为 0
                  时停留在当前位置；只有转动发生冲突时，才对齐容错范围内的相关层。
                  独立顶角和同轴层保留各自角度。默认容错 120°。
                </p>
              </section>
              <div className="quick-actions">
                <button
                  className="primary-button"
                  disabled={locked}
                  onClick={newScramble}
                >
                  <Shuffle size={17} />
                  随机打乱
                </button>
                <button
                  className="secondary-button"
                  disabled={locked}
                  onClick={resetPuzzle}
                >
                  <RotateCcw size={16} />
                  复原
                </button>
              </div>
              <div className="history-actions">
                <button
                  disabled={locked || !s.cursor}
                  onClick={() => void undo()}
                >
                  <Undo2 size={16} />
                  撤销
                </button>
                <button
                  disabled={locked || s.cursor === s.history.length}
                  onClick={() => void redo()}
                >
                  <Redo2 size={16} />
                  重做
                </button>
                <span>
                  {s.cursor} / {s.history.length}
                </span>
              </div>
              <Toggle
                label="播放打乱动画"
                value={animated}
                onChange={setAnimated}
              />
              {s.scramble && (
                <div className="scramble-record">
                  <div className="control-label">
                    <span>当前打乱</span>
                    <button
                      aria-label="复制打乱"
                      onClick={() =>
                        void navigator.clipboard.writeText(s.scramble).then(
                          () => notify('打乱已复制。'),
                          () => notify('复制失败，请手动选择文字。'),
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
                  <h3>轴与层级</h3>
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
                  label="旋转层级"
                  value={layer}
                  options={[
                    ['tip', 'Tip · 仅顶角'],
                    ['body', 'Center · 上两层含顶角'],
                    ['base', 'Edge · 底层'],
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
                <p className="microcopy">
                  U 顶轴 · L 左轴 · R 右轴 · B 后轴。小写转顶角，大写转上两层，w
                  转该轴底层；′ 表示反向。
                </p>
                <details className="pyr-keybindings">
                  <summary>自定义操作键位</summary>
                  <p className="microcopy">
                    点击输入框后按下组合键，Delete 清除，Esc 取消。
                  </p>
                  {Object.entries(s.keybindings).map(([action, value]) => (
                    <label key={action}>
                      <span>
                        {(
                          {
                            undo: '撤销',
                            redo: '重做',
                            playPause: '播放 / 暂停',
                            exitPresentation: '退出展示',
                          } as Record<string, string>
                        )[action] || action}
                      </span>
                      <input
                        aria-label={`${action} 键位`}
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
                            notify('该键位已被占用。');
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
                    恢复默认键位
                  </button>
                </details>
              </section>
              <section className="panel-section">
                <div className="section-head">
                  <h3>算法实验室</h3>
                  <span className="tag">PYRAMINX</span>
                </div>
                <div className="algorithm-presets">
                  {s.presets.map((p, i) => (
                    <button
                      key={`${p.name}-${i}`}
                      className={algorithm === p.algorithm ? 'active' : ''}
                      onClick={() => setAlgorithm(p.algorithm)}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
                <textarea
                  className="pyr-algorithm"
                  aria-label="金字塔算法"
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value)}
                  spellCheck={false}
                />
                <button
                  className="wide-button"
                  disabled={locked}
                  onClick={() => runAlgorithm(algorithm)}
                >
                  播放算法
                  <Play size={16} />
                </button>
                <div className="pyr-button-row">
                  <input
                    className="pyr-text-input"
                    aria-label="算法名称"
                    placeholder="算法名称"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                  />
                  <button
                    className="secondary-button"
                    disabled={locked}
                    onClick={addPreset}
                  >
                    添加
                  </button>
                </div>
                <div className="pyr-button-row">
                  <button
                    onClick={() =>
                      download(s.presets, 'AXIS-pyraminx-algorithms.json')
                    }
                  >
                    <Download size={14} />
                    导出算法
                  </button>
                  <button
                    disabled={locked}
                    onClick={() => algorithmInput.current?.click()}
                  >
                    <Upload size={14} />
                    导入算法
                  </button>
                  <button
                    disabled={locked}
                    onClick={() => patch({ presets: defaultPresets() })}
                  >
                    恢复默认
                  </button>
                </div>
              </section>
            </section>
            <section {...section('explode')}>
              <div className="engineering-card">
                <Layers3 size={27} />
                <div>
                  <strong>看见四轴结构</strong>
                  <p>贴合式蜂窝壳体、磁力轴心与四轴连接。</p>
                </div>
                <span>04</span>
              </div>
              <Range
                label="拆解程度"
                value={s.settings.explode}
                min={0}
                max={3}
                disabled={s.solving}
                onChange={(explode) => {
                  settings({ explode });
                }}
              />
              <div className="explode-presets">
                {['完整', '分块', '结构', '完全拆解'].map((label, explode) => (
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
                label="内部组件分离"
                value={s.settings.internal}
                min={0}
                max={1.5}
                disabled={s.solving}
                onChange={(internal) => settings({ internal })}
              />
              <Range
                label="块间间隙"
                value={s.settings.gap}
                min={0}
                max={0.3}
                step={0.001}
                digits={3}
                disabled={s.solving}
                onChange={(gap) => settings({ gap })}
              />
              <Range
                label="块体尺寸"
                value={s.settings.size}
                min={0.65}
                max={1.08}
                disabled={s.solving}
                onChange={(size) => settings({ size })}
              />
              <Range
                label="贴片偏移"
                value={s.settings.stickerOffset}
                min={0}
                max={0.2}
                disabled={s.solving}
                onChange={(stickerOffset) => settings({ stickerOffset })}
              />
              <Toggle
                label="显示磁性组件"
                value={s.settings.showMagnets}
                disabled={s.solving}
                onChange={(showMagnets) => settings({ showMagnets })}
              />
              <button
                className="wide-button"
                disabled={s.solving}
                onClick={() => {
                  settings({
                    explode: 0,
                    internal: 1,
                    gap: 0,
                    size: 1,
                    stickerOffset: 0,
                  });
                  cameraActions.reset();
                }}
              >
                恢复完整装配
                <RotateCcw size={16} />
              </button>
              <div className="part-legend">
                <h3>结构索引</h3>
                {[
                  ['顶角块 Tip', 4],
                  ['中心块 Center', 4],
                  ['棱块 Edge', 6],
                  ['彩色三角外壳', 36],
                  ['四轴连接杆', 4],
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
                <h3>外壳定制</h3>
                <span className="tag">{s.selected.length} 片已选</span>
              </div>
              <Choice
                label="原始面"
                value={String(s.editFace)}
                options={FACE_NAMES.map((n, i) => [String(i), n])}
                onChange={(value) =>
                  patch({ editFace: Number(value), selected: [] })
                }
              />
              <TilePicker />
              <div className="pyr-button-row">
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
                  选择整面
                </button>
                <button
                  disabled={s.solving}
                  onClick={() => patch({ selected: [] })}
                >
                  取消选择
                </button>
              </div>
              <div className="pyr-color-edit">
                <label htmlFor="pyr-color">贴片颜色</label>
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
                  应用颜色
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
                          TILES.map((t) => [
                            t.id,
                            colors[t.face],
                          ]),
                        ),
                      })
                    }
                  >
                    <span>{colors.map((c) => <i key={c} style={{ background: c }} />)}</span>
                    {name}
                  </button>
                ))}
              </div>
              <section className="panel-section">
                <h3>整面照片</h3>
                <p className="microcopy">
                  每面一张照片，裁切后分配到九片外壳，随合法转层保持位置和方向。
                </p>
                <button
                  className="wide-button"
                  disabled={s.solving}
                  onClick={() => photoInput.current?.click()}
                >
                  上传 / 替换图片
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
                      打开预览调整
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
                      移除当前面图片
                      <X size={16} />
                    </button>
                  </>
                )}
              </section>
              <section className="panel-section">
                <h3>本地方案</h3>
                <button
                  className="wide-button"
                  disabled={locked}
                  onClick={() =>
                    download(captureProject(), 'AXIS-pyraminx.json')
                  }
                >
                  导出完整方案
                  <Download size={16} />
                </button>
                <button
                  className="wide-button"
                  disabled={locked}
                  onClick={() => importInput.current?.click()}
                >
                  导入完整方案
                  <Upload size={16} />
                </button>
                <button
                  className="wide-button"
                  disabled={locked}
                  onClick={() => patch({ colors: defaultColors(), photos: {} })}
                >
                  恢复原厂外观
                  <RotateCcw size={16} />
                </button>
                <p className="microcopy">
                  三阶与金字塔分别保存。切换保留本次进度；点击顶部保存后，下次打开仍可继续。
                </p>
              </section>
            </section>
            <section {...section('solver')}>
              <div className="section-head">
                <h3>金字塔求解</h3>
                <span className="tag">状态搜索</span>
              </div>
              <p className="helper-text">
                按当前块位置与方向计算上两层转动的最短复原序列，再对齐独立顶角并恢复初始方位。支持带底层转动的状态与整面照片。
              </p>
              <button
                className="wide-button"
                disabled={s.busy}
                onClick={() => {
                  if (s.solving) cancelSolve();
                  else void startSolve();
                }}
              >
                {s.solving ? '终止求解' : '开始求解'}
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
                label="播放速度"
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
                label="转动曲线"
                value={s.settings.easing}
                options={[
                  ['magnetic', '磁力'],
                  ['smooth', '平滑'],
                  ['linear', '线性'],
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
                      aria-label="上一步"
                      disabled={locked || !s.player.index}
                      onClick={() => void previous()}
                    >
                      <SkipBack size={19} />
                    </button>
                    <button
                      aria-label={s.player.playing ? '暂停播放' : '播放序列'}
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
                      aria-label="下一步"
                      disabled={
                        locked || s.player.index === s.player.moves.length
                      }
                      onClick={() => void next()}
                    >
                      <SkipForward size={19} />
                    </button>
                    <button
                      aria-label="终止播放"
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
                    aria-label="播放进度"
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
                        主体复原
                      </button>
                      <button
                        disabled={locked}
                        onClick={() => void seek(s.player!.bodyLength!)}
                      >
                        顶角对齐
                      </button>
                      <button
                        disabled={locked}
                        onClick={() => void seek(s.player!.moves.length)}
                      >
                        完成
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
                <h3>视角与材质</h3>
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
                label="自动旋转"
                value={s.settings.autoRotate}
                disabled={s.solving}
                onChange={(autoRotate) => settings({ autoRotate })}
              />
              <Range
                label="塑料粗糙度"
                value={s.settings.roughness}
                min={0.05}
                max={1}
                disabled={s.solving}
                onChange={(roughness) => settings({ roughness })}
              />
              <Choice
                label="显示品质"
                value={s.settings.quality}
                options={[
                  ['auto', '自适应'],
                  ['high', '高品质'],
                  ['low', '性能优先'],
                ]}
                onChange={(quality) =>
                  settings({ quality: quality as typeof s.settings.quality })
                }
              />
              <section className="panel-section">
                <h3>棚拍光源</h3>
                <Toggle
                  label="灯光跟随视角"
                  value={s.settings.lightFollowCamera}
                  disabled={s.solving}
                  onChange={(lightFollowCamera) =>
                    settings({ lightFollowCamera })
                  }
                />
                <Range
                  label="光源方向"
                  value={s.settings.lightAzimuth}
                  min={-180}
                  max={180}
                  digits={0}
                  unit="°"
                  disabled={s.solving}
                  onChange={(lightAzimuth) => settings({ lightAzimuth })}
                />
                <Range
                  label="光源仰角"
                  value={s.settings.lightElevation}
                  min={-10}
                  max={90}
                  digits={0}
                  unit="°"
                  disabled={s.solving}
                  onChange={(lightElevation) => settings({ lightElevation })}
                />
                <Range
                  label="光源强度"
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
                进入展示模式
                <Eye size={16} />
              </button>
            </section>
            <section {...section('inspect')}>
              <div className="section-head">
                <h3>结构与操作历史</h3>
                <span className="tag">{solved ? '已复原' : '探索中'}</span>
              </div>
              <p className="microcopy">点击任一部件查看类型，双击进入特写。</p>
              {selectedTile && (
                <div className="pyr-piece-info">
                  <strong>{PIECES[selectedTile.piece].id}</strong>
                  <p>
                    {PIECES[selectedTile.piece].kind === 'tip'
                      ? 'Tip · 顶角块：仅旋转该顶角'
                      : PIECES[selectedTile.piece].kind === 'center'
                        ? 'Center · 中心块：转动上两层，包含顶角'
                        : 'Edge · 棱块：转动触碰面上对角顶点对应的底层'}
                  </p>
                  <p>原始贴片：{FACE_NAMES[selectedTile.face]}</p>
                  <button
                    className="wide-button"
                    onClick={() => cameraActions.focus()}
                  >
                    特写
                    <Focus size={16} />
                  </button>
                </div>
              )}
              <button
                className="wide-button"
                disabled={
                  s.solving || (!s.cursor && s.player?.title !== '历史回放')
                }
                onClick={() => {
                  if (s.player?.title === '历史回放') {
                    pause();
                    patch({ player: null });
                  } else replayHistory();
                }}
              >
                {s.player?.title === '历史回放'
                  ? `终止回放 · ${s.player.index} / ${s.player.moves.length}`
                  : '回放操作历史'}
                {s.player?.title === '历史回放' ? (
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
              <p className="microcopy">
                {s.cursor} 步已应用 · {s.history.length - s.cursor} 步可重做
              </p>
            </section>
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <span>
          <i className="live-dot" /> PYRAMINX · 四轴磁力结构
        </span>
        <span>14 个独立块 · 36 片三角外壳</span>
        <span>本地处理 / AXIS 04</span>
      </footer>
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
                  notify('金字塔方案已导入。');
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
                if (presets.length > 100)
                  throw new Error('合并后算法超过 100 个。');
                patch({ presets });
                notify('算法已合并导入。');
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
