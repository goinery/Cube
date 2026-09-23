'use client';
import { tx, useLanguage, localized } from '@/lib/i18n';
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
import LanguageSwitcher from './LanguageSwitcher';
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
const modes: [Mode, string, typeof Box][] = localized(() => [
  ['play', tx('legacy.m028'), Box],
  ['explode', tx('legacy.m029'), Layers3],
  ['customize', tx('legacy.m030'), Palette],
  ['solver', tx('legacy.m031'), WandSparkles],
  ['camera', tx('legacy.m032'), Move3D],
  ['inspect', tx('legacy.m033'), Scan],
]);
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
export default function CubeApp({
  onSwitch,
}: {
  onSwitch: (puzzle: PuzzleType) => void;
}) {
  useLanguage();
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
    pendingJump = useRef<{
      mode: Mode;
      until: number;
    } | null>(null),
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
        notify(tx('legacy.m034'));
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1600);
      },
      () => notify(tx('legacy.m035')),
    );
  }
  function toggleAutoSave(on: boolean) {
    patch({ autoSave: on });
    setAutosavePreference(on);
    if (on) {
      void saveAutosave();
      notify(tx('legacy.m036'));
    } else notify(tx('legacy.m037'));
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
        <div className="brand" aria-label={tx('legacy.m038')}>
          <PuzzleSwitcher value="cube" onChange={onSwitch} disabled={locked} />
          <strong>
            AXIS<span>/</span>03
          </strong>
          <span className="brand-divider" />
          <span className="brand-subtitle">{tx('legacy.m039')}</span>
        </div>
        <div className="header-center">
          MAGNETIC PRECISION CUBE <span>·</span> DIGITAL EDITION
        </div>
        <div className="header-actions">
          <LanguageSwitcher />
          <span className="local-badge">
            <i />
            {tx('legacy.m040')}
          </span>
          <div className="autosave-switch">
            <label htmlFor={autoSaveId}>{tx('legacy.m041')}</label>
            <Switch
              id={autoSaveId}
              aria-label={tx('legacy.m041')}
              checked={s.autoSave}
              onCheckedChange={toggleAutoSave}
            />
          </div>
          <button
            className="icon-button"
            disabled={locked}
            title={saved ? tx('legacy.m042') : tx('legacy.m043')}
            aria-label={tx('legacy.m043')}
            onClick={saveOnce}
          >
            {saved ? <Check size={18} /> : <Save size={18} />}
          </button>
          <button
            className="icon-button"
            title={tx('legacy.m044')}
            aria-label={tx('legacy.m044')}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void document.documentElement
                  .requestFullscreen()
                  .catch(() => notify(tx('legacy.m045')));
            }}
          >
            <Expand size={18} />
          </button>
          <button
            className="icon-button presentation-toggle"
            disabled={s.solving}
            title={tx('legacy.m046')}
            aria-label={tx('legacy.m046')}
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
              {s.settings.autoRotate ? tx('legacy.m047') : tx('legacy.m048')}
              {tx('legacy.m049')}
              {s.settings.autoRotate ? tx('legacy.m050') : tx('legacy.m051')}
            </div>
          )}
          {s.solving && (
            <div className="solve-lock" aria-live="polite">
              {tx('legacy.m052')}
            </div>
          )}
          <div className="stage-state">
            <i className={solved ? 'solved' : ''} />
            <span>
              {s.currentMove
                ? tx('legacy.m053', { p0: s.currentMove })
                : s.partialTurns
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
              label={tx('legacy.m058')}
              value={s.view}
              options={[
                ['normal', tx('legacy.m059')],
                ['hidden', tx('legacy.m060')],
                ['six', tx('legacy.m061')],
                ['net', tx('legacy.m062')],
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
                  ? tx('legacy.m063')
                  : s.mode === 'explode' || s.mode === 'camera'
                    ? tx('legacy.m064')
                    : s.mode === 'inspect'
                      ? tx('legacy.m065')
                      : s.settings.magnetStrength === 0
                        ? tx('legacy.m066')
                        : tx('legacy.m067')}
              </span>
            </div>
            <div className="camera-buttons">
              <button
                title={tx('legacy.m068')}
                aria-label={tx('legacy.m068')}
                onClick={() => cameraActions.reset()}
              >
                <RotateCcw size={16} />
              </button>
              <button
                title={tx('legacy.m069')}
                aria-label={tx('legacy.m069')}
                onClick={() => cameraActions.fit()}
              >
                <Focus size={18} />
                <span>{tx('legacy.m069')}</span>
              </button>
            </div>
          </div>
          <div className="object-spec">
            <span>{tx('app.pieces', { count: 26 })}</span>
            <span>6 AXES</span>
            <span>{tx('app.tiles', { count: 54 })}</span>
          </div>
          {!s.ready && (
            <div className="loading-overlay">
              <Box size={36} />
              <strong>AXIS / 03</strong>
              <span>{tx('legacy.m070')}</span>
              <div className="loading-bar" />
            </div>
          )}
        </section>
        <aside className="control-panel" ref={panelRef} style={panelStyle}>
          <button
            className="mobile-handle"
            ref={handleRef}
            aria-expanded={panelOpen}
            aria-label={panelOpen ? tx('legacy.m071') : tx('legacy.m072')}
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
          <nav
            className="panel-nav"
            ref={navRef}
            aria-label={tx('legacy.m073')}
          >
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
                  onChange={(v) => settings({ magnetStrength: v })}
                />
                <Range
                  label={tx('legacy.m078')}
                  value={s.settings.magnetDamping}
                  min={0.05}
                  max={2}
                  step={0.05}
                  disabled={s.solving}
                  onChange={(v) => settings({ magnetDamping: v })}
                />
                <Range
                  label={tx('legacy.m079')}
                  value={s.settings.turnTolerance}
                  disabled={s.solving}
                  min={0}
                  max={45}
                  step={1}
                  digits={0}
                  unit="°"
                  onChange={(v) => settings({ turnTolerance: v })}
                />
                <></>
                <></>
                {s.partialTurns && (
                  <p className="help-text" aria-live="polite">
                    {withinTurnTolerance(
                      s.partialTurns,
                      s.settings.turnTolerance,
                    )
                      ? tx('legacy.m082', { p0: s.settings.turnTolerance })
                      : tx('legacy.m083', { p0: s.settings.turnTolerance })}
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
                    {tx('legacy.m084')}
                    <ArrowUpRight size={17} />
                  </button>
                  <button
                    className="secondary-button"
                    onClick={resetCube}
                    disabled={locked}
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
                  value={animateScramble}
                  onChange={setAnimateScramble}
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
                    <h3>{tx('legacy.m093')}</h3>
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
                            ? tx('legacy.m094')
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
                <></>
                <Range
                  label={tx('legacy.m097')}
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
                    [0, tx('legacy.m098')],
                    [1, tx('legacy.m099')],
                    [2, tx('legacy.m100')],
                    [3, tx('legacy.m101')],
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
                  label={tx('legacy.m102')}
                  value={s.settings.internal}
                  min={0}
                  max={1.5}
                  onChange={(v) => settings({ internal: v })}
                />
                <Range
                  label={tx('legacy.m103')}
                  value={s.settings.gap}
                  step={0.001}
                  digits={3}
                  min={0}
                  max={0.3}
                  onChange={(v) => settings({ gap: v })}
                />
                <Range
                  label={tx('legacy.m104')}
                  value={s.settings.size}
                  min={0.65}
                  max={1.08}
                  onChange={(v) => settings({ size: v })}
                />
                <Range
                  label={tx('legacy.m105')}
                  value={s.settings.stickerOffset}
                  min={0}
                  max={0.2}
                  onChange={(v) => settings({ stickerOffset: v })}
                />
                <Toggle
                  label={tx('legacy.m106')}
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
                  {tx('legacy.m107')}
                  <RotateCcw size={16} />
                </button>
                <div className="part-legend">
                  <h3>{tx('legacy.m108')}</h3>
                  <p>
                    <i style={{ background: '#cccfbd' }} />
                    {tx('legacy.m109')}
                    <span>54</span>
                  </p>
                  <p>
                    <i style={{ background: '#5e6870' }} />
                    {tx('legacy.m110')}
                    <span>8 / 12</span>
                  </p>
                  <p>
                    <i style={{ background: '#b7c4cd' }} />
                    {tx('legacy.m111')}
                    <span>48 / 16</span>
                  </p>
                  <p>
                    <i style={{ background: '#b1c5a2' }} />
                    {tx('legacy.m112')}
                    <span>6</span>
                  </p>
                  <p>
                    <i style={{ background: '#333f4a' }} />
                    {tx('legacy.m113')}
                    <span>1</span>
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
                            U: tx('legacy.m114'),
                            D: tx('legacy.m115'),
                            R: tx('legacy.m116'),
                            L: tx('legacy.m117'),
                            F: tx('legacy.m118'),
                            B: tx('legacy.m119'),
                          } as Record<Face, string>
                        )[f]
                      }
                      {tx('legacy.m058')}
                    </button>
                  ))}
                </div>
                <button
                  className="wide-button"
                  onClick={() => cameraActions.reset()}
                >
                  {tx('legacy.m120')}
                  <Move3D size={18} />
                </button>
                <button
                  className="wide-button"
                  onClick={() => cameraActions.focus()}
                >
                  {tx('legacy.m121')}
                  <Focus size={18} />
                </button>
                <button
                  className="wide-button"
                  onClick={() => cameraActions.fit()}
                >
                  {tx('legacy.m122')}
                  <Focus size={18} />
                </button>
                <Toggle
                  label={tx('legacy.m123')}
                  value={s.settings.autoRotate}
                  onChange={(v) => settings({ autoRotate: v })}
                />
                <Range
                  label={tx('legacy.m124')}
                  value={s.settings.roughness}
                  min={0.18}
                  max={0.65}
                  onChange={(v) => settings({ roughness: v })}
                />
                <section className="panel-section">
                  <h3>{tx('legacy.m125')}</h3>
                  <Toggle
                    label={tx('legacy.m126')}
                    value={s.settings.lightFollowCamera}
                    onChange={(v) => settings({ lightFollowCamera: v })}
                  />
                  <></>
                  <Range
                    label={tx('legacy.m128')}
                    value={s.settings.lightAzimuth}
                    min={-180}
                    max={180}
                    step={1}
                    digits={0}
                    unit="°"
                    onChange={(v) => settings({ lightAzimuth: v })}
                  />
                  <Range
                    label={tx('legacy.m129')}
                    value={s.settings.lightElevation}
                    min={-80}
                    max={80}
                    step={1}
                    digits={0}
                    unit="°"
                    onChange={(v) => settings({ lightElevation: v })}
                  />
                  <Range
                    label={tx('legacy.m130')}
                    value={s.settings.lightIntensity}
                    min={0}
                    max={5}
                    step={0.1}
                    digits={1}
                    onChange={(v) => settings({ lightIntensity: v })}
                  />
                </section>
                <Choice
                  label={tx('legacy.m131')}
                  value={s.settings.quality}
                  options={[
                    ['auto', tx('legacy.m132')],
                    ['high', tx('legacy.m133')],
                    ['low', tx('legacy.m134')],
                  ]}
                  onChange={(v) =>
                    settings({ quality: v as 'auto' | 'high' | 'low' })
                  }
                />
                <Choice
                  label={tx('legacy.m135')}
                  value={s.settings.easing}
                  options={[
                    ['magnetic', tx('legacy.m136')],
                    ['smooth', tx('legacy.m137')],
                    ['linear', tx('legacy.m138')],
                  ]}
                  onChange={(v) =>
                    settings({ easing: v as 'magnetic' | 'smooth' | 'linear' })
                  }
                />
                <button
                  className="wide-button"
                  onClick={() => setPresentation(true)}
                >
                  {tx('legacy.m139')}
                  <Expand size={17} />
                </button>
                <></>
              </>
            </section>
            <section {...blockProps('inspect')}>
              <>
                <div className="inspection-state">
                  <span className="live-dot" />
                  {tx('legacy.m144')}
                  <strong>26 / 26</strong>
                </div>
                <></>
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
                              ? tx('legacy.m146')
                              : p.kind === 'edge'
                                ? tx('legacy.m147')
                                : tx('legacy.m148')}
                          </span>
                          <code>{p.pos.join(' , ')}</code>
                        </div>
                      );
                    })
                  ) : (
                    <></>
                  )}
                </div>
                {replay ? (
                  <button
                    className="wide-button replay-stop"
                    onClick={() => anchorPanel('inspect', stopReplay)}
                  >
                    {tx('legacy.m150')}
                    {replay.index} / {replay.moves.length}
                    <CircleStop size={16} />
                  </button>
                ) : (
                  <button
                    className="wide-button"
                    disabled={locked || !s.history.length}
                    onClick={() => anchorPanel('inspect', replayHistory)}
                  >
                    {tx('legacy.m151')}
                    <ArrowUpRight size={16} />
                  </button>
                )}
                <button
                  className="wide-button"
                  disabled={
                    locked || !s.scramble || s.cursor < s.scrambleCursor
                  }
                  onClick={() => restoreHistory(s.history, s.scrambleCursor)}
                >
                  {tx('legacy.m152')}
                  <RotateCcw size={16} />
                </button>
                <></>
              </>
            </section>
            <div className="panel-footer">
              <span>{tx('app.engine')}</span>
              <span>
                01.0 <i />
              </span>
            </div>
          </div>
        </aside>
      </div>
      <footer className="app-footer">
        <span>{tx('app.name')}</span>
        <span>
          <i />
          {s.mode === 'explode'
            ? `${tx('mode.explode')} ${s.settings.explode.toFixed(2)}`
            : tx('app.ready')}
        </span>
        <span>
          {tx('app.local')}
        </span>
      </footer>
      {s.notice && <output className="toast">{s.notice}</output>}
    </main>
  );
}
