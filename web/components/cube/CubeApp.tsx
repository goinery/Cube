'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  Box,
  Layers3,
  Palette,
  WandSparkles,
  Move3D,
  Scan,
  Undo2,
  Redo2,
  RotateCcw,
  Shuffle,
  Expand,
  Eye,
  ArrowUpRight,
  MousePointer2,
  Copy,
  Focus,
  CircleStop,
  Save,
  Check,
} from 'lucide-react';
import Viewport from './Viewport';
import PuzzleSwitcher, { type PuzzleType } from './PuzzleSwitcher';
import FaceMaps from './FaceMaps';
import CustomizePanel from './CustomizePanel';
import KeybindingsPanel from './KeybindingsPanel';
import AlgorithmLab from './AlgorithmLab';
import SolverPanel from './SolverPanel';
import {
  autosavePreference,
  saveAutosave,
  saveProject,
  restoreProject,
  setAutosavePreference,
  watchAutosave,
} from '@/lib/cube/persistence';
import { Switch } from '@/components/ui/switch';
import { registerCubeTools } from '@/lib/cube/webmcp';
import { Range, Choice, Toggle } from './Controls';
import {
  useCube,
  getState,
  pause,
  patch,
  settings,
  setPresentation,
  perform,
  undo,
  redo,
  resetCube,
  loadPlayer,
  play,
  applyInstant,
  allowMoves,
  replayHistory,
  stopReplay,
  HISTORY_REPLAY_TITLE,
  notify,
  cameraActions,
  restoreHistory,
  type Mode,
  type View,
} from '@/lib/cube/store';
import { FACES, COLORS, isSolved, scramble, type Face } from '@/lib/cube/model';
import { canTurn, withinTurnTolerance } from '@/lib/cube/interaction';
import {
  formatShortcut,
  keyboardShortcut,
  shortcutActions,
} from '@/lib/cube/keybindings';

const modes: [Mode, string, typeof Box][] = [
  ['play', '玩魔方', Box],
  ['explode', '拆解', Layers3],
  ['customize', '定制', Palette],
  ['solver', '求解', WandSparkles],
  ['camera', '视角', Move3D],
  ['inspect', '检查', Scan],
];
const phoneLayout =
  '(max-width: 760px), (max-height: 530px) and (orientation: landscape)';
const railLayout = '(max-height: 530px) and (orientation: landscape)';
const STAGE_RAIL_RESERVE = 320;
interface SheetStyle extends React.CSSProperties {
  '--sheet-h'?: string;
  '--sheet-w'?: string;
}
interface SheetDrag {
  origin: number;
  size: number;
  bar: number;
  max: number;
  horizontal: boolean;
  moved: boolean;
  next: number;
}
function matches(query: string) {
  return typeof window !== 'undefined' && window.matchMedia(query).matches;
}
let restoredSession = false;
export default function CubeApp({ onSwitch }: { onSwitch: (puzzle: PuzzleType) => void }) {
  const s = useCube(
      'cube',
      'partialTurns',
      'busy',
      'solving',
      'mode',
      'player',
      'cursor',
      'history',
      'presentation',
      'currentMove',
      'view',
      'settings',
      'ready',
      'scramble',
      'scrambleCursor',
      'selected',
      'notice',
      'autoSave',
    ),
    [modifier, setModifier] = useState(''),
    [animateScramble, setAnimateScramble] = useState(true),
    [sheet, setSheet] = useState(() => matches(phoneLayout)),
    [rail, setRail] = useState(() => matches(railLayout)),
    [panelOpen, setPanelOpen] = useState(() => !matches(phoneLayout)),
    [sheetHeight, setSheetHeight] = useState<number | null>(null),
    [visible, setVisible] = useState<Mode>('play'),
    [saved, setSaved] = useState(false),
    autoSaveId = useId();
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    scrollRef = useRef<HTMLDivElement>(null),
    sectionRefs = useRef<Partial<Record<Mode, HTMLElement | null>>>({}),
    pendingJump = useRef<{ mode: Mode; until: number } | null>(null),
    deferredJump = useRef<Mode | null>(null),
    panelRef = useRef<HTMLElement>(null),
    handleRef = useRef<HTMLButtonElement>(null),
    navRef = useRef<HTMLElement>(null),
    dragState = useRef<SheetDrag | null>(null),
    lastSheet = useRef<number | null>(null),
    pointerTap = useRef(false);
  function offsetIn(node: HTMLElement) {
    return (
      node.getBoundingClientRect().top -
      (scrollRef.current?.getBoundingClientRect().top || 0)
    );
  }
  function scrollerAnimates() {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function scrollToSection(id: Mode, smooth = true) {
    const scroller = scrollRef.current,
      node = sectionRefs.current[id];
    if (!node || !scroller) return;
    setVisible(id);
    const motion = smooth && scrollerAnimates();
    pendingJump.current = motion
      ? { mode: id, until: Date.now() + 1400 }
      : null;
    scroller.scrollTo({
      top: scroller.scrollTop + offsetIn(node) - 2,
      behavior: motion ? 'smooth' : 'auto',
    });
  }
  function jumpTo(id: Mode) {
    if (!panelOpen) {
      deferredJump.current = id;
      setPanelOpen(true);
      return;
    }
    scrollToSection(id);
  }
  // 播放器卡片出现或消失会改变面板内容高度，等布局落定后重新对齐当前区块
  function anchorPanel(id: Mode, change: () => void) {
    change();
    requestAnimationFrame(() => scrollToSection(id, false));
  }
  function sheetMetrics(panel: HTMLElement) {
    const workspace = panel.parentElement,
      horizontal = rail,
      bar = horizontal
        ? parseFloat(
            getComputedStyle(panel).getPropertyValue('--rail-width'),
          ) || 42
        : (handleRef.current?.offsetHeight ?? 0) +
          (navRef.current?.offsetHeight ?? 0),
      span = horizontal
        ? (workspace?.clientWidth ?? 0)
        : (workspace?.clientHeight ?? 0),
      stage = workspace?.querySelector('.stage'),
      reserve = horizontal
        ? STAGE_RAIL_RESERVE
        : parseFloat(stage ? getComputedStyle(stage).minHeight : '') || 250;
    return { bar, max: Math.max(bar + 80, span - reserve), horizontal };
  }
  function openSheet(height: number | null) {
    if (height !== null) lastSheet.current = height;
    setSheetHeight(height);
    setPanelOpen(true);
  }
  function closeSheet() {
    setSheetHeight(null);
    setPanelOpen(false);
  }
  function startDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const panel = panelRef.current;
    if (!sheet || !panel) return;
    const { bar, max, horizontal } = sheetMetrics(panel),
      size = horizontal ? panel.offsetWidth : panel.offsetHeight;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerTap.current = false;
    dragState.current = {
      origin: horizontal ? e.clientX : e.clientY,
      size,
      bar,
      max,
      horizontal,
      moved: false,
      next: size,
    };
    setSheetHeight(size);
    setPanelOpen(true);
  }
  function moveDrag(e: React.PointerEvent<HTMLButtonElement>) {
    const drag = dragState.current;
    if (!drag) return;
    const delta = (drag.horizontal ? e.clientX : e.clientY) - drag.origin;
    if (Math.abs(delta) > 5) drag.moved = true;
    drag.next = Math.min(drag.max, Math.max(drag.bar, drag.size - delta));
    setSheetHeight(Math.round(drag.next));
  }
  function endDrag(cancelled = false) {
    const drag = dragState.current;
    if (!drag) return;
    dragState.current = null;
    pointerTap.current = true;
    if (cancelled) {
      if (drag.size <= drag.bar + 1) closeSheet();
      else openSheet(Math.round(drag.size));
      return;
    }
    if (!drag.moved) {
      if (drag.size <= drag.bar + 1) openSheet(lastSheet.current);
      else closeSheet();
      return;
    }
    if (drag.next <= drag.bar + 24) closeSheet();
    else openSheet(Math.round(drag.next));
  }
  function toggleSheet() {
    if (panelOpen) closeSheet();
    else openSheet(lastSheet.current);
  }
  const attachSection = useCallback((node: HTMLElement | null) => {
    if (node) sectionRefs.current[node.dataset.section as Mode] = node;
  }, []);
  const blockProps = (id: Mode) => ({
    className: `panel-block${visible === id ? ' active' : ''}`,
    'data-section': id,
    ref: attachSection,
  });
  useEffect(registerCubeTools, []);
  useEffect(() => {
    const sheetQuery = window.matchMedia(phoneLayout),
      railQuery = window.matchMedia(railLayout),
      sync = () => {
        setSheet(sheetQuery.matches);
        setRail(railQuery.matches);
        setSheetHeight(null);
        dragState.current = null;
        lastSheet.current = null;
      };
    sheetQuery.addEventListener('change', sync);
    railQuery.addEventListener('change', sync);
    return () => {
      sheetQuery.removeEventListener('change', sync);
      railQuery.removeEventListener('change', sync);
    };
  }, []);
  useEffect(() => {
    if (restoredSession) return;
    restoredSession = true;
    const autosave = autosavePreference();
    if (autosave) patch({ autoSave: true });
    void restoreProject(autosave ? 'autosave' : 'saved');
  }, []);
  useEffect(() => {
    if (!s.autoSave) return;
    return watchAutosave();
  }, [s.autoSave]);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.isComposing ||
        (e.target instanceof HTMLElement &&
          e.target.closest(
            'input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=slider],[role=combobox],[role=dialog]',
          ))
      )
        return;
      // Keep the keybinding disclosure accessible with the keyboard.
      if (
        (e.code === 'Space' || e.code === 'Enter') &&
        e.target instanceof HTMLElement &&
        e.target.closest('summary')
      )
        return;
      const shortcut = keyboardShortcut(e);
      if (!shortcut) return;
      const state = getState();
      const action = shortcutActions.find(
        (key) => state.settings.keybindings[key] === shortcut,
      );
      if (!action || state.solving) return;
      e.preventDefault();
      if (e.repeat) return;
      if (action === 'exitPresentation') setPresentation(false);
      else if (action === 'undo') void undo();
      else if (action === 'redo') void redo();
      else if (action === 'playPause') {
        if (state.player?.playing) pause();
        else void play();
      } else void perform(action);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    let frame = 0;
    const sync = () => {
      frame = 0;
      const pending = pendingJump.current;
      if (pending) {
        const node = sectionRefs.current[pending.mode];
        if (node && Date.now() < pending.until && Math.abs(offsetIn(node)) > 2)
          return;
        pendingJump.current = null;
      }
      const line = Math.max(30, scroller.clientHeight * 0.32);
      let next: Mode = 'play';
      for (const [id] of modes) {
        const node = sectionRefs.current[id];
        if (node && offsetIn(node) <= line) next = id;
      }
      setVisible(next);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  useEffect(() => {
    if (!panelOpen) return;
    const id = deferredJump.current || visible;
    deferredJump.current = null;
    scrollToSection(id, false);
  }, [panelOpen]);
  useEffect(() => {
    if (s.solving || s.mode === visible) return;
    patch({ mode: visible });
  }, [s.solving, s.mode, visible]);
  function saveOnce() {
    void saveProject().then(
      () => {
        notify('当前魔方状态已保存到本机。');
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1600);
      },
      () => notify('保存失败：本机存储不可用或空间不足，请导出方案备份。'),
    );
  }
  function toggleAutoSave(on: boolean) {
    patch({ autoSave: on });
    setAutosavePreference(on);
    if (on) {
      void saveAutosave();
      notify('自动保存已开启，改动会自动写入本机。');
    } else notify('自动保存已关闭，可用保存按钮留存进度。');
  }
  function newScramble() {
    if (s.busy || s.solving) return;
    const moves = scramble();
    if (!allowMoves(moves)) return;
    patch({
      scramble: moves.join(' '),
      scrambleCursor: s.cursor + moves.length,
    });
    if (animateScramble) {
      loadPlayer(moves, 'Scramble');
      void play();
    } else applyInstant(moves, 'Scramble');
  }
  const solved = !s.partialTurns && isSolved(s.cube),
    locked = s.busy || s.solving,
    replay =
      s.player &&
      s.player.title === HISTORY_REPLAY_TITLE &&
      (s.player.playing || s.player.index < s.player.moves.length)
        ? s.player
        : null,
    panelStyle: SheetStyle | undefined =
      sheet && sheetHeight !== null
        ? rail
          ? { '--sheet-w': `${sheetHeight}px` }
          : { '--sheet-h': `${sheetHeight}px` }
        : undefined;
  return (
    <main
      className={`cube-app ${s.presentation ? 'presentation' : ''} ${panelOpen ? '' : 'panel-collapsed'}`}
    >
      <header className="app-header">
        <div className="brand" aria-label="AXIS 魔方工作室">
          <PuzzleSwitcher value="cube" onChange={onSwitch} disabled={locked} />
          <strong>
            AXIS<span>/</span>03
          </strong>
          <span className="brand-divider" />
          <span className="brand-subtitle">魔方工作室</span>
        </div>
        <div className="header-center">
          MAGNETIC PRECISION CUBE <span>·</span> DIGITAL EDITION
        </div>
        <div className="header-actions">
          <span className="local-badge">
            <i />
            本地工作区
          </span>
          <div className="autosave-switch">
            <label htmlFor={autoSaveId}>自动保存</label>
            <Switch
              id={autoSaveId}
              aria-label="自动保存"
              checked={s.autoSave}
              onCheckedChange={toggleAutoSave}
            />
          </div>
          <button
            className="icon-button"
            disabled={locked}
            title={saved ? '已保存' : '保存当前状态'}
            aria-label="保存当前状态"
            onClick={saveOnce}
          >
            {saved ? <Check size={18} /> : <Save size={18} />}
          </button>
          <button
            className="icon-button"
            title="全屏"
            aria-label="全屏"
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
            className="icon-button presentation-toggle"
            disabled={s.solving}
            title="展示模式"
            aria-label="展示模式"
            onClick={() => setPresentation(!s.presentation)}
          >
            <Eye size={18} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <section
          className="stage"
          data-solving={s.solving || undefined}
          inert={s.solving}
        >
          <Viewport />
          {s.presentation && (
            <div className="presentation-hint" aria-live="polite">
              {s.settings.autoRotate ? '自动旋转中' : '自动旋转已暂停'} ·
              点击空白{s.settings.autoRotate ? '暂停' : '继续'}
            </div>
          )}
          {s.solving && (
            <div className="solve-lock" aria-live="polite">
              正在计算 · 魔方已锁定 · 可在求解面板终止
            </div>
          )}
          <div className="stage-state">
            <i className={solved ? 'solved' : ''} />
            <span>
              {s.currentMove
                ? `转动 ${s.currentMove}`
                : s.partialTurns
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
                ['six', '六面总览'],
                ['net', '平面展开'],
              ]}
              onChange={(v) => patch({ view: v as View })}
            />
          </div>
          <FaceMaps />
          <div className="stage-bottom">
            <div className="interaction-hint">
              <MousePointer2 size={15} />
              <span>
                {s.mode === 'customize'
                  ? '点击贴片多选 · 在右侧编辑外观'
                  : s.mode === 'explode' || s.mode === 'camera'
                    ? '拖动自由旋转 · Shift 拖动滚转 · 双指或滚轮缩放'
                    : s.mode === 'inspect'
                      ? '点击零件查看信息 · 拖动空白旋转视角'
                      : s.settings.magnetStrength === 0
                        ? '按住拖动转层 · 松手停留当前位置'
                        : '按住拖动转层 · 松手磁力归位'}
              </span>
            </div>
            <div className="camera-buttons">
              <button
                title="重置视角"
                aria-label="重置视角"
                onClick={() => cameraActions.reset()}
              >
                <RotateCcw size={16} />
              </button>
              <button
                title="适配视图"
                aria-label="适配视图"
                onClick={() => cameraActions.fit()}
              >
                <Focus size={18} />
                <span>适配视图</span>
              </button>
            </div>
          </div>
          <div className="object-spec">
            <span>26 PIECES</span>
            <span>6 AXES</span>
            <span>54 TILES</span>
          </div>
          {!s.ready && (
            <div className="loading-overlay">
              <Box size={36} />
              <strong>AXIS / 03</strong>
              <span>正在装配模型与材质…</span>
              <div className="loading-bar" />
            </div>
          )}
        </section>
        <aside className="control-panel" ref={panelRef} style={panelStyle}>
          <button
            className="mobile-handle"
            ref={handleRef}
            aria-expanded={panelOpen}
            aria-label={
              panelOpen
                ? '收起控制面板，可拖动调整面板高度'
                : '展开控制面板，可拖动调整面板高度'
            }
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={() => endDrag()}
            onPointerCancel={() => endDrag(true)}
            onClick={() => {
              if (pointerTap.current) {
                pointerTap.current = false;
                return;
              }
              toggleSheet();
            }}
          >
            <span className="handle-bar" />
          </button>
          <nav className="panel-nav" ref={navRef} aria-label="面板导航">
            {modes.map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                className={visible === id ? 'active' : ''}
                aria-current={visible === id ? 'true' : undefined}
                onClick={() => jumpTo(id)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
          <div className="panel-scroll" ref={scrollRef}>
            <section {...blockProps('play')}>
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
                  onChange={(v) => settings({ magnetStrength: v })}
                />
                <Range
                  label="归位阻尼"
                  value={s.settings.magnetDamping}
                  min={0.05}
                  max={2}
                  step={0.05}
                  disabled={s.solving}
                  onChange={(v) => settings({ magnetDamping: v })}
                />
                <Range
                  label="转层容错角度"
                  value={s.settings.turnTolerance}
                  disabled={s.solving}
                  min={0}
                  max={45}
                  step={1}
                  digits={0}
                  unit="°"
                  onChange={(v) => settings({ turnTolerance: v })}
                />
                <p className="microcopy">
                  转动垂直层时，先将容错范围内的错位层平滑归位，再转动新层。设为
                  0° 时要求严格对齐。
                </p>
                <p className="microcopy">
                  强度为 0
                  时可停在任意角度。阻尼越低，归位回弹越明显；越高，回弹越小。
                </p>
                {s.partialTurns && (
                  <p className="help-text" aria-live="polite">
                    {withinTurnTolerance(
                      s.partialTurns,
                      s.settings.turnTolerance,
                    )
                      ? `错位在 ${s.settings.turnTolerance}° 容错范围内：转动垂直层时会自动就近归位。`
                      : `错位超出 ${s.settings.turnTolerance}° 容错范围：请先沿原轴对齐，或增大容错角度。`}
                  </p>
                )}
              </section>
              <>
                <div className="quick-actions">
                  <button
                    className="primary-button"
                    onClick={newScramble}
                    disabled={locked}
                  >
                    <Shuffle size={17} />
                    随机打乱
                    <ArrowUpRight size={17} />
                  </button>
                  <button
                    className="secondary-button"
                    onClick={resetCube}
                    disabled={locked}
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
                  value={animateScramble}
                  onChange={setAnimateScramble}
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
                    <h3>面转动</h3>
                    <div className="modifier-buttons">
                      {['', "'", '2'].map((v) => (
                        <button
                          key={v}
                          aria-pressed={modifier === v}
                          className={modifier === v ? 'active' : ''}
                          onClick={() => setModifier(v)}
                        >
                          {v === '' ? '90°' : v === "'" ? '−90°' : '180°'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="face-moves">
                    {FACES.map((f) => (
                      <button
                        key={f}
                        onClick={() => void perform(f + modifier)}
                        disabled={
                          locked ||
                          !canTurn(
                            s.partialTurns,
                            f + modifier,
                            s.settings.turnTolerance,
                          )
                        }
                        title={
                          !canTurn(
                            s.partialTurns,
                            f + modifier,
                            s.settings.turnTolerance,
                          )
                            ? '请先对齐错位转层'
                            : undefined
                        }
                      >
                        <i style={{ background: COLORS[f] }} />
                        <strong>
                          {f}
                          {modifier}
                        </strong>
                      </button>
                    ))}
                  </div>
                  <KeybindingsPanel />
                </section>
                <AlgorithmLab />
              </>
            </section>
            <section {...blockProps('explode')}>
              <>
                <div className="engineering-card">
                  <Layers3 size={27} />
                  <div>
                    <strong>从装配，到每一颗磁铁</strong>
                    <p>分层展开，原位聚合。</p>
                  </div>
                  <span>03</span>
                </div>
                <Range
                  label="拆解程度"
                  value={s.settings.explode}
                  min={0}
                  max={3}
                  onChange={(v) => {
                    settings({ explode: v });
                    cameraActions.fit();
                  }}
                />
                <div className="explode-presets">
                  {[
                    [0, '完整'],
                    [1, '分块'],
                    [2, '结构'],
                    [3, '完全拆解'],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      className={
                        Math.abs(s.settings.explode - Number(v)) < 0.03
                          ? 'active'
                          : ''
                      }
                      onClick={() => {
                        settings({ explode: Number(v) });
                        setTimeout(() => cameraActions.fit(), 30);
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <Range
                  label="内部组件分离"
                  value={s.settings.internal}
                  min={0}
                  max={1.5}
                  onChange={(v) => settings({ internal: v })}
                />
                <Range
                  label="块间间隙"
                  value={s.settings.gap}
                  step={0.001}
                  digits={3}
                  min={0}
                  max={0.3}
                  onChange={(v) => settings({ gap: v })}
                />
                <Range
                  label="块体尺寸"
                  value={s.settings.size}
                  min={0.65}
                  max={1.08}
                  onChange={(v) => settings({ size: v })}
                />
                <Range
                  label="贴片偏移"
                  value={s.settings.stickerOffset}
                  min={0}
                  max={0.2}
                  onChange={(v) => settings({ stickerOffset: v })}
                />
                <Toggle
                  label="显示磁性组件"
                  value={s.settings.showMagnets}
                  onChange={(v) => settings({ showMagnets: v })}
                />
                <button
                  className="wide-button"
                  onClick={() => {
                    settings({
                      explode: 0,
                      gap: 0.006,
                      size: 1,
                      stickerOffset: 0,
                      internal: 1,
                    });
                    setTimeout(() => cameraActions.reset(), 30);
                  }}
                >
                  恢复完整装配 <RotateCcw size={16} />
                </button>
                <div className="part-legend">
                  <h3>结构索引</h3>
                  <p>
                    <i style={{ background: '#cccfbd' }} />
                    彩色外壳 <span>54</span>
                  </p>
                  <p>
                    <i style={{ background: '#5e6870' }} />
                    角块 / 棱块骨架 <span>8 / 12</span>
                  </p>
                  <p>
                    <i style={{ background: '#b7c4cd' }} />
                    磁力定位 / 轴心磁铁 <span>48 / 16</span>
                  </p>
                  <p>
                    <i style={{ background: '#b1c5a2' }} />
                    中心张力调节 <span>6</span>
                  </p>
                  <p>
                    <i style={{ background: '#333f4a' }} />
                    六轴核心 <span>1</span>
                  </p>
                </div>
              </>
            </section>
            <section {...blockProps('customize')}>
              <CustomizePanel />
            </section>
            <section {...blockProps('solver')}>
              <SolverPanel />
            </section>
            <section {...blockProps('camera')}>
              <>
                <div className="camera-grid">
                  {FACES.map((f) => (
                    <button key={f} onClick={() => cameraActions.face(f)}>
                      <span>{f}</span>
                      {
                        (
                          {
                            U: '上',
                            D: '下',
                            R: '右',
                            L: '左',
                            F: '前',
                            B: '后',
                          } as Record<Face, string>
                        )[f]
                      }
                      视图
                    </button>
                  ))}
                </div>
                <button
                  className="wide-button"
                  onClick={() => cameraActions.reset()}
                >
                  标准产品视角 <Move3D size={18} />
                </button>
                <button
                  className="wide-button"
                  onClick={() => cameraActions.focus()}
                >
                  所选部件特写 <Focus size={18} />
                </button>
                <button
                  className="wide-button"
                  onClick={() => cameraActions.fit()}
                >
                  适配当前模型 <Focus size={18} />
                </button>
                <Toggle
                  label="自动旋转展示"
                  value={s.settings.autoRotate}
                  onChange={(v) => settings({ autoRotate: v })}
                />
                <Range
                  label="塑料表面粗糙度"
                  value={s.settings.roughness}
                  min={0.18}
                  max={0.65}
                  onChange={(v) => settings({ roughness: v })}
                />
                <section className="panel-section">
                  <h3>棚拍光源</h3>
                  <Toggle
                    label="光源跟随视角"
                    value={s.settings.lightFollowCamera}
                    onChange={(v) => settings({ lightFollowCamera: v })}
                  />
                  <p className="helper-text">
                    关闭时光源固定在场景中。可独立调整方向、仰角与亮度。
                  </p>
                  <Range
                    label="光源方向"
                    value={s.settings.lightAzimuth}
                    min={-180}
                    max={180}
                    step={1}
                    digits={0}
                    unit="°"
                    onChange={(v) => settings({ lightAzimuth: v })}
                  />
                  <Range
                    label="光源仰角"
                    value={s.settings.lightElevation}
                    min={-80}
                    max={80}
                    step={1}
                    digits={0}
                    unit="°"
                    onChange={(v) => settings({ lightElevation: v })}
                  />
                  <Range
                    label="光源强度"
                    value={s.settings.lightIntensity}
                    min={0}
                    max={5}
                    step={0.1}
                    digits={1}
                    onChange={(v) => settings({ lightIntensity: v })}
                  />
                </section>
                <Choice
                  label="显示品质"
                  value={s.settings.quality}
                  options={[
                    ['auto', '自动'],
                    ['high', '高品质'],
                    ['low', '流畅'],
                  ]}
                  onChange={(v) =>
                    settings({ quality: v as 'auto' | 'high' | 'low' })
                  }
                />
                <Choice
                  label="按键与算法动画"
                  value={s.settings.easing}
                  options={[
                    ['magnetic', '柔和减速'],
                    ['smooth', '平滑'],
                    ['linear', '线性'],
                  ]}
                  onChange={(v) =>
                    settings({ easing: v as 'magnetic' | 'smooth' | 'linear' })
                  }
                />
                <button
                  className="wide-button"
                  onClick={() => setPresentation(true)}
                >
                  进入展示模式 <Expand size={17} />
                </button>
                <p className="microcopy">
                  点击空白暂停 / 继续自动旋转。
                  {s.settings.keybindings.exitPresentation
                    ? `按 ${formatShortcut(s.settings.keybindings.exitPresentation)} 或点击`
                    : '点击'}
                  右上角眼睛按钮退出展示。
                </p>
              </>
            </section>
            <section {...blockProps('inspect')}>
              <>
                <div className="inspection-state">
                  <span className="live-dot" />
                  物理状态合法 <strong>26 / 26</strong>
                </div>
                <p className="help-text">
                  点击 3D
                  贴片或辅助面格子，交叉高亮同一贴片。颜色与图片是外观，不会改变魔方的真实状态。
                </p>
                <div className="inspection-list">
                  {s.selected.length ? (
                    s.selected.map((id) => {
                      const p = s.cube.find((p) =>
                        p.stickers.some((t) => t.id === id),
                      )!;
                      return (
                        <div key={id}>
                          <strong>{id}</strong>
                          <span>
                            {p.kind === 'corner'
                              ? '角块'
                              : p.kind === 'edge'
                                ? '棱块'
                                : '中心块'}
                          </span>
                          <code>{p.pos.join(' , ')}</code>
                        </div>
                      );
                    })
                  ) : (
                    <p>选择一个贴片以查看所属零件。</p>
                  )}
                </div>
                {replay ? (
                  <button
                    className="wide-button replay-stop"
                    onClick={() => anchorPanel('inspect', stopReplay)}
                  >
                    终止回放 · {replay.index} / {replay.moves.length}
                    <CircleStop size={16} />
                  </button>
                ) : (
                  <button
                    className="wide-button"
                    disabled={locked || !s.history.length}
                    onClick={() => anchorPanel('inspect', replayHistory)}
                  >
                    回放操作历史 <ArrowUpRight size={16} />
                  </button>
                )}
                <button
                  className="wide-button"
                  disabled={
                    locked || !s.scramble || s.cursor < s.scrambleCursor
                  }
                  onClick={() => restoreHistory(s.history, s.scrambleCursor)}
                >
                  回到打乱状态 <RotateCcw size={16} />
                </button>
                <p className="microcopy">
                  转动、撤销与求解共用同一个物理状态；拆解、材质与镜头独立于状态。
                </p>
              </>
            </section>
            <div className="panel-footer">
              <span>AXIS ENGINE</span>
              <span>
                01.0 <i />
              </span>
            </div>
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <span>DESIGNED TO BE EXPLORED.</span>
        <span>
          <i />
          {s.mode === 'explode'
            ? `EXPLODE ${s.settings.explode.toFixed(2)}`
            : 'ALL SYSTEMS CONNECTED'}
        </span>
        <span>
          LOCAL FIRST <span>·</span> 3D WORKSPACE
        </span>
      </footer>
      {s.notice && <output className="toast">{s.notice}</output>}
    </main>
  );
}
