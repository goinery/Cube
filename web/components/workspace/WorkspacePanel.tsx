import {
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import {
  Box,
  Layers3,
  Palette,
  WandSparkles,
  Move3D,
  Scan,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

const modes = [
  ['play', Box],
  ['explode', Layers3],
  ['customize', Palette],
  ['solver', WandSparkles],
  ['camera', Move3D],
  ['inspect', Scan],
] as const;
type Mode = (typeof modes)[number][0];
const phoneLayout =
  '(max-width: 760px), (max-height: 530px) and (orientation: landscape)';
const railLayout = '(max-height: 530px) and (orientation: landscape)';

export function useWorkspacePanel(
  mode: Mode,
  solving: boolean,
  onModeChange: (mode: Mode) => void,
) {
  const [open, setOpen] = useState(() => !matchMedia(phoneLayout).matches);
  const jumpRef = useRef<(mode: Mode, smooth?: boolean) => void>(() => {});
  return {
    mode,
    solving,
    onModeChange,
    open,
    setOpen,
    jumpRef,
    jump: (next: Mode, smooth = true) => jumpRef.current(next, smooth),
  };
}

export default function WorkspacePanel({
  controller,
  children,
}: {
  controller: ReturnType<typeof useWorkspacePanel>;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { mode, solving, onModeChange, open, setOpen, jumpRef } = controller;
  const id = useId();
  const [sheet, setSheet] = useState(() => matchMedia(phoneLayout).matches);
  const [rail, setRail] = useState(() => matchMedia(railLayout).matches);
  const [size, setSize] = useState<number | null>(null);
  const panel = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const nav = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const lastSize = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const pending = useRef<{ mode: Mode; until: number } | null>(null);
  const deferred = useRef<Mode | null>(null);
  const drag = useRef<{
    origin: number;
    size: number;
    min: number;
    max: number;
    horizontal: boolean;
    moved: boolean;
    next: number;
    wasOpen: boolean;
  } | null>(null);
  const anchorFrame = useRef(0);

  function scrollToSection(next: Mode, smooth = true) {
    const scroller = scroll.current;
    const node = scroller?.querySelector<HTMLElement>(
      `[data-section="${next}"]`,
    );
    if (!scroller || !node) return;
    const animate =
      smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Clamp to the reachable bottom so short final sections can still become active.
    const top = Math.min(
      scroller.scrollHeight - scroller.clientHeight,
      Math.max(
        0,
        scroller.scrollTop +
          node.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top -
          2,
      ),
    );
    pending.current = animate
      ? { mode: next, until: performance.now() + 1400 }
      : null;
    scroller.scrollTo({ top, behavior: animate ? 'smooth' : 'instant' });
  }
  function jump(next: Mode, smooth = true) {
    if (solving && next !== 'solver') return;
    onModeChange(next);
    if (!open) {
      deferred.current = next;
      setOpen(true);
    } else {
      cancelAnimationFrame(anchorFrame.current);
      anchorFrame.current = requestAnimationFrame(() =>
        scrollToSection(next, smooth),
      );
    }
  }
  useEffect(() => {
    jumpRef.current = jump;
    return () => {
      jumpRef.current = () => {};
    };
  });
  useEffect(() => () => cancelAnimationFrame(anchorFrame.current), []);
  useEffect(() => {
    const phone = matchMedia(phoneLayout),
      landscape = matchMedia(railLayout);
    const sync = () => {
      setSheet(phone.matches);
      setRail(landscape.matches);
      setSize(null);
      lastSize.current = null;
      drag.current = null;
      suppressClick.current = false;
      if (!phone.matches) setOpen(true);
    };
    phone.addEventListener('change', sync);
    landscape.addEventListener('change', sync);
    return () => {
      phone.removeEventListener('change', sync);
      landscape.removeEventListener('change', sync);
    };
  }, [setOpen]);
  const alignPanel = useEffectEvent(() => {
    scrollToSection(deferred.current ?? mode, false);
    deferred.current = null;
  });
  useEffect(() => {
    if (open) alignPanel();
  }, [open, rail]);

  function trackScroll() {
    const scroller = scroll.current;
    if (!scroller || solving || drag.current) return;
    if (pending.current && performance.now() < pending.current.until) return;
    pending.current = null;
    const top =
      scroller.getBoundingClientRect().top +
      Math.max(30, scroller.clientHeight * 0.32);
    let next: Mode = 'play';
    for (const [key] of modes) {
      const node = scroller.querySelector<HTMLElement>(
        `[data-section="${key}"]`,
      );
      if (node && node.getBoundingClientRect().top <= top) next = key;
    }
    if (
      scroller.scrollTop > 0 &&
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
    )
      next = 'inspect';
    if (mode !== next) onModeChange(next);
  }
  function toggle() {
    if (open) setSize(null);
    else setSize(lastSize.current);
    setOpen(!open);
  }
  function startDrag(e: PointerEvent<HTMLButtonElement>) {
    if (!sheet || !panel.current || !e.isPrimary || e.button !== 0) return;
    const element = panel.current,
      workspace = element.parentElement!;
    const min = rail
      ? parseFloat(
          getComputedStyle(element).getPropertyValue('--rail-width'),
        ) || 42
      : (handle.current?.offsetHeight ?? 32) +
        (nav.current?.offsetHeight ?? 48);
    const stage = workspace.querySelector<HTMLElement>('.stage');
    const reserve = rail
      ? 320
      : parseFloat(stage ? getComputedStyle(stage).minHeight : '') || 300;
    const max = Math.max(
      min,
      (rail ? workspace.clientWidth : workspace.clientHeight) - reserve,
    );
    const current = rail ? element.offsetWidth : element.offsetHeight;
    drag.current = {
      origin: rail ? e.clientX : e.clientY,
      size: current,
      min,
      max,
      horizontal: rail,
      moved: false,
      next: current,
      wasOpen: open,
    };
    suppressClick.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function moveDrag(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const delta = (d.horizontal ? e.clientX : e.clientY) - d.origin;
    d.moved ||= Math.abs(delta) > 5;
    if (!d.moved) return;
    d.next = Math.min(d.max, Math.max(d.min, d.size - delta));
    setSize(Math.round(d.next));
    setOpen(true);
  }
  function endDrag(cancelled = false) {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    suppressClick.current = true;
    const expanded = cancelled
      ? d.wasOpen
      : d.moved
        ? d.next > d.min + 24
        : !d.wasOpen;
    const next = expanded
      ? cancelled
        ? d.size
        : d.moved
          ? Math.round(d.next)
          : lastSize.current
      : null;
    setOpen(expanded);
    setSize(next);
    if (expanded) lastSize.current = next;
  }
  const style =
    sheet && size !== null
      ? ({ [rail ? '--sheet-w' : '--sheet-h']: `${size}px` } as CSSProperties)
      : undefined;
  return (
    <aside className="control-panel" ref={panel} style={style}>
      <button
        type="button"
        className="mobile-handle"
        ref={handle}
        aria-expanded={open}
        aria-controls={id}
        aria-label={t(open ? 'app.collapsePanel' : 'app.expandPanel')}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={() => endDrag()}
        onPointerCancel={() => endDrag(true)}
        onLostPointerCapture={() => endDrag(true)}
        onClick={(e) => {
          if (e.detail !== 0 && suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          suppressClick.current = false;
          toggle();
        }}
      >
        <span className="handle-bar" />
      </button>
      <nav className="panel-nav" ref={nav} aria-label={t('app.controls')}>
        {modes.map(([key, Icon]) => (
          <button
            key={key}
            type="button"
            className={mode === key ? 'active' : ''}
            aria-current={mode === key ? 'true' : undefined}
            disabled={solving && key !== 'solver'}
            onClick={() => jump(key)}
          >
            <Icon size={18} />
            <span>{t(`mode.${key}`)}</span>
          </button>
        ))}
      </nav>
      <div
        id={id}
        className="panel-scroll"
        ref={scroll}
        onScroll={trackScroll}
        onWheel={() => {
          pending.current = null;
        }}
        onTouchStart={() => {
          pending.current = null;
        }}
      >
        {children}
      </div>
    </aside>
  );
}
