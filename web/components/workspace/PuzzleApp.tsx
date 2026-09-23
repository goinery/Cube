import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  Box,
  Check,
  Copy,
  Expand,
  Eye,
  Focus,
  Layers3,
  Move3D,
  Palette,
  RotateCcw,
  Save,
  Scan,
  Shuffle,
  Undo2,
  Redo2,
  WandSparkles,
  MousePointer2,
} from 'lucide-react';
import PuzzleSwitcher, { type PuzzleType } from '../cube/PuzzleSwitcher';
import LanguageSwitcher from '../cube/LanguageSwitcher';
import { Range, Choice, Toggle } from '../cube/Controls';
import { useTranslation } from '@/lib/i18n';
import { getSession, useSession } from '@/lib/puzzle/session';
import { colorSolved, pictureSolved, scramble } from '@/lib/puzzle/model';
import { restore, save, setAutoSave, watch } from '@/lib/puzzle/persistence';
import { registerPuzzleTools } from '@/lib/puzzle/webmcp';
import { keyboardShortcut } from '@/lib/cube/keybindings';
import type { PuzzleId } from '@/lib/puzzle/types';
import PuzzleViewport from './PuzzleViewport';
import { FaceMaps } from './FaceCanvas';
import CustomizePanel from './CustomizePanel';
import {
  AlgorithmPanel,
  KeybindingsPanel,
  Player,
  SolverPanel,
} from './Panels';

const modes = [
  ['play', Box],
  ['explode', Layers3],
  ['customize', Palette],
  ['solver', WandSparkles],
  ['camera', Move3D],
  ['inspect', Scan],
] as const;
export default function PuzzleApp({
  id,
  onSwitch,
}: {
  id: PuzzleId;
  onSwitch: (type: PuzzleType) => void;
}) {
  const session = useMemo(() => getSession(id), [id]),
    s = useSession(session),
    { t } = useTranslation(),
    [modifier, setModifier] = useState(''),
    [depth, setDepth] = useState(1),
    [width, setWidth] = useState(1),
    [animate, setAnimate] = useState(true),
    [panelSize, setPanelSize] = useState(48),
    [open, setOpen] = useState(false);
  const panelDrag = useRef<{
      position: number;
      size: number;
      horizontal: boolean;
      moved: boolean;
    } | null>(null),
    ignoreClick = useRef(false);
  useEffect(() => {
    void restore(session);
    const unsubscribe = watch(session);
    return () => {
      unsubscribe();
      session.stop();
      session.cancelSolve();
    };
  }, [session]);
  useEffect(() => registerPuzzleTools(session), [session, t]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          'input,textarea,select,[contenteditable="true"],[role="dialog"]',
        )
      )
        return;
      const key = keyboardShortcut(e);
      if (!key) return;
      const action = Object.keys(session.state.keys).find(
        (a) => session.state.keys[a] === key,
      );
      if (!action) return;
      e.preventDefault();
      if (action === 'undo') void session.undo();
      else if (action === 'redo') void session.redo();
      else if (action === 'playPause')
        session.state.player?.playing ? session.pause() : void session.play();
      else if (action === 'exitPresentation') session.presentation(false);
      else void session.perform(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);
  const resolved = !session.motion.held && colorSolved(session.def, s.puzzle),
    pictures = !session.motion.held && pictureSolved(session.def, s.puzzle),
    isMinx = id === 'megaminx';
  const range = (
    label: string,
    key: keyof typeof s.settings,
    min: number,
    max: number,
    step = 0.01,
    digits = 2,
    unit = '',
  ) => (
    <Range
      label={t(label)}
      value={s.settings[key] as number}
      min={min}
      max={max}
      step={step}
      digits={digits}
      unit={unit}
      disabled={s.solving}
      onChange={(value) => {
        session.settings({ [key]: value });
        if (key === 'explode') session.camera.fit();
      }}
    />
  );
  function startPanel(e: React.PointerEvent) {
    const horizontal = matchMedia(
      '(max-height:520px) and (orientation:landscape)',
    ).matches;
    panelDrag.current = {
      position: horizontal ? e.clientX : e.clientY,
      size: open ? panelSize : 0,
      horizontal,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function movePanel(e: React.PointerEvent) {
    const d = panelDrag.current;
    if (!d) return;
    const delta =
      ((d.position - (d.horizontal ? e.clientX : e.clientY)) /
        (d.horizontal ? innerWidth : innerHeight)) *
      100;
    if (Math.abs(delta) > 1) d.moved = true;
    if (!d.moved) return;
    const next = Math.max(0, Math.min(72, d.size + delta));
    setOpen(next > 8);
    if (next > 8) setPanelSize(next);
  }
  function endPanel() {
    ignoreClick.current = Boolean(panelDrag.current?.moved);
    panelDrag.current = null;
  }
  return (
    <main
      className={`cube-app puzzle-workspace ${s.presentation ? 'presentation' : ''} ${open ? '' : 'panel-collapsed'}`}
      style={{ '--puzzle-panel-size': `${panelSize}%` } as CSSProperties}
    >
      <header className="app-header">
        <div className="brand">
          <PuzzleSwitcher value={id} onChange={onSwitch} />
          <strong>
            AXIS<span>/</span>
            {isMinx ? '12' : String(session.def.order).padStart(2, '0')}
          </strong>
          <span className="brand-divider" />
          <span className="brand-subtitle">{t('app.name')}</span>
        </div>
        <div className="header-actions">
          <LanguageSwitcher />
          <Toggle
            label={t('app.autoSave')}
            value={s.autoSave}
            onChange={(on) => setAutoSave(session, on)}
          />
          <button
            className="icon-button"
            aria-label={t('app.save')}
            title={t('app.save')}
            onClick={() =>
              void save(session).catch(() => session.notify('common.storage'))
            }
          >
            <Save size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={t('app.fullscreen')}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void document.documentElement
                  .requestFullscreen()
                  .catch(() => session.notify('common.error'));
            }}
          >
            <Expand size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={t('app.presentation')}
            onClick={() => session.presentation(!s.presentation)}
          >
            <Eye size={18} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <section className="stage">
          <PuzzleViewport session={session} />
          <div className="stage-state">
            <i className={resolved ? 'solved' : ''} />
            <span>
              {t(
                pictures
                  ? 'app.pictureSolved'
                  : resolved
                    ? 'app.solved'
                    : 'app.working',
              )}
            </span>
            <span className="state-divider" />
            <span>{s.cursor}</span>
          </div>
          <div className="view-controls">
            <Choice
              label={t('camera.normal')}
              value={s.view}
              options={['normal', 'hidden', 'all', 'net'].map((view) => [
                view,
                t(`camera.${view}`),
              ])}
              onChange={(view) =>
                session.patch({ view: view as typeof s.view })
              }
            />
          </div>
          <FaceMaps session={session} />
          <div className="stage-bottom">
            <div className="interaction-hint">
              <MousePointer2 size={15} />
              <span>{t('camera.hint')}</span>
            </div>
            <div className="camera-buttons">
              <button
                aria-label={t('camera.reset')}
                onClick={() => session.camera.reset()}
              >
                <RotateCcw size={17} />
              </button>
              <button aria-label={t('camera.fit')} onClick={() => session.camera.fit()}>
                <Focus size={18} />
                <span>{t('camera.fit')}</span>
              </button>
            </div>
          </div>
          <div className="object-spec">
            <span>
              {t('puzzle.tiles', { count: session.def.tiles.length })}
            </span>
            <span>
              {t('motion.held', { count: session.motion.tracks.length })}
            </span>
          </div>
          {s.solving && (
            <div className="solve-lock">
              {s.solveStatus
                ? t(s.solveStatus.key, s.solveStatus.params)
                : t('solver.initializing')}
            </div>
          )}
          {s.presentation && (
            <button
              className="puzzle-exit-presentation"
              onClick={() => session.presentation(false)}
            >
              {t('app.exitPresentation')}
            </button>
          )}
        </section>
        <aside className="control-panel">
          <button
            className="mobile-handle"
            aria-label={t('app.name')}
            aria-expanded={open}
            onPointerDown={startPanel}
            onPointerMove={movePanel}
            onPointerUp={endPanel}
            onPointerCancel={endPanel}
            onClick={() => {
              if (ignoreClick.current) {
                ignoreClick.current = false;
                return;
              }
              setOpen(!open);
            }}
          >
            <span className="handle-bar" />
          </button>
          <nav className="panel-nav">
            {modes.map(([mode, Icon]) => (
              <button
                key={mode}
                className={s.mode === mode ? 'active' : ''}
                aria-current={s.mode === mode ? 'true' : undefined}
                onClick={() => {
                  session.patch({ mode });
                  setOpen(true);
                }}
              >
                <Icon size={18} />
                <span>{t(`mode.${mode}`)}</span>
              </button>
            ))}
          </nav>
          <div className="panel-scroll">
            <div hidden={s.mode !== 'play'}>
              <section className="panel-section magnetic-controls">
                <div className="section-head">
                  <h3>{t('motion.title')}</h3>
                  <span className="tag">
                    {t(
                      s.settings.magnetStrength === 0
                        ? 'common.off'
                        : 'common.on',
                    )}
                  </span>
                </div>
                {range('motion.strength', 'magnetStrength', 0, 2, 0.05)}
                {range('motion.damping', 'magnetDamping', 0.05, 2, 0.05)}
                {range(
                  'motion.tolerance',
                  'turnTolerance',
                  0,
                  (session.def.step * 90) / Math.PI,
                  1,
                  0,
                  '°',
                )}
                <p className="microcopy">{t('motion.help')}</p>
                <p className="microcopy">{t('motion.free')}</p>
                {session.motion.held && (
                  <button
                    className="wide-button"
                    onClick={() => {
                      if (!session.motion.align())
                        session.notify('motion.outOfTolerance', {
                          degrees: s.settings.turnTolerance,
                        });
                    }}
                  >
                    {t('motion.align')}
                  </button>
                )}
              </section>
              <div className="action-grid">
                <button
                  className="primary-button"
                  disabled={s.solving}
                  onClick={() => {
                    const moves = scramble(session.def);
                    session.rememberScramble(moves);
                    session.patch({ scramble: moves.join(' ') });
                    if (animate) {
                      session.loadPlayer(moves, 'scramble');
                      void session.play();
                    } else session.instant(moves);
                  }}
                >
                  <Shuffle size={17} />
                  {t('motion.scramble')}
                </button>
                <button
                  className="secondary-button"
                  disabled={s.solving}
                  onClick={() => session.reset()}
                >
                  <RotateCcw size={16} />
                  {t('common.reset')}
                </button>
              </div>
              <div className="history-actions">
                <button
                  disabled={!s.cursor || s.solving || session.motion.moving}
                  onClick={() => void session.undo()}
                >
                  <Undo2 size={16} />
                  {t('motion.undo')}
                </button>
                <button
                  disabled={
                    s.cursor === s.history.length ||
                    s.solving ||
                    session.motion.moving
                  }
                  onClick={() => void session.redo()}
                >
                  <Redo2 size={16} />
                  {t('motion.redo')}
                </button>
                <span>
                  {s.cursor} / {s.history.length}
                </span>
              </div>
              <Toggle
                label={t('motion.animateScramble')}
                value={animate}
                onChange={setAnimate}
              />
              {s.scramble && (
                <div className="scramble-record">
                  <button
                    aria-label={t('common.copy')}
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(s.scramble)
                        .then(() => session.notify('common.copied'))
                        .catch(() => session.notify('common.error'))
                    }
                  >
                    <Copy size={14} />
                  </button>
                  <p>{s.scramble}</p>
                </div>
              )}
              <section className="panel-section">
                <div className="section-head">
                  <h3>{t('motion.moves')}</h3>
                  <div className="modifier-buttons">
                    {['', "'", '2', ...(isMinx ? ["2'"] : [])].map((m) => (
                      <button
                        key={m}
                        aria-pressed={modifier === m}
                        className={modifier === m ? 'active' : ''}
                        onClick={() => setModifier(m)}
                      >
                        {m ||
                          `${Math.round((session.def.step * 180) / Math.PI)}°`}
                      </button>
                    ))}
                  </div>
                </div>
                {!isMinx && (
                  <>
                    <Range
                      label={t('motion.depth')}
                      value={depth}
                      min={1}
                      max={session.def.order}
                      step={1}
                      digits={0}
                      onChange={(d) => {
                        setDepth(d);
                        setWidth(1);
                      }}
                    />
                    <Range
                      label={t('motion.width')}
                      value={width}
                      min={1}
                      max={session.def.order}
                      step={1}
                      digits={0}
                      onChange={(w) => {
                        setWidth(w);
                        setDepth(1);
                      }}
                    />
                  </>
                )}
                <div className="face-moves">
                  {session.def.faces.map((face) => {
                    const move = isMinx
                      ? face.id
                      : width > 1
                        ? `${width === 2 ? '' : width}${face.id}w`
                        : `${depth === 1 ? '' : depth}${face.id}`;
                    return (
                      <button
                        key={face.id}
                        disabled={s.solving}
                        onClick={() => void session.perform(move + modifier)}
                      >
                        <i style={{ background: face.color }} />
                        <strong>
                          {move}
                          {modifier}
                        </strong>
                      </button>
                    );
                  })}
                </div>
                {
                  <div className="puzzle-whole-turns">
                    <span>{t('motion.whole')}</span>
                    {(isMinx ? ['@U', '@R', '@F'] : ['x', 'y', 'z']).map(
                      (move) => (
                        <button
                          key={move}
                          onClick={() => void session.perform(move + modifier)}
                        >
                          {move}
                          {modifier}
                        </button>
                      ),
                    )}
                  </div>
                }
                <KeybindingsPanel session={session} />
              </section>
              <AlgorithmPanel session={session} />
            </div>
            <div hidden={s.mode !== 'explode'}>
              <div className="engineering-card">
                <Layers3 size={27} />
                <strong>{t('explode.title')}</strong>
              </div>
              {range('explode.amount', 'explode', 0, 3)}
              <div className="explode-presets">
                {['assembled', 'pieces', 'structure', 'complete'].map(
                  (label, index) => (
                    <button
                      key={label}
                      className={
                        Math.abs(s.settings.explode - index) < 0.03
                          ? 'active'
                          : ''
                      }
                      onClick={() => {
                        session.settings({ explode: index });
                        session.camera.fit();
                      }}
                    >
                      {t('explode.' + label)}
                    </button>
                  ),
                )}
              </div>
              {range('explode.internal', 'internal', 0, 3)}
              {range('explode.gap', 'gap', 0, 0.2, 0.002, 3)}
              {range('explode.size', 'size', 0.65, 1.2)}
              {range('explode.offset', 'stickerOffset', 0, 0.4)}
              <Toggle
                label={t('explode.magnets')}
                value={s.settings.showMagnets}
                onChange={(showMagnets) => session.settings({ showMagnets })}
              />
              <button
                className="wide-button"
                onClick={() => {
                  session.settings({
                    explode: 0,
                    gap: 0.008,
                    size: 1,
                    internal: 1,
                    stickerOffset: 0,
                  });
                  setTimeout(() => session.camera.fit(), 350);
                }}
              >
                {t('explode.assemble')}
                <RotateCcw size={16} />
              </button>
              <div className="part-legend">
                <h3>{t('explode.parts')}</h3>
                <p>
                  {t('explode.shells')}
                  <span>{session.def.tiles.length}</span>
                </p>
                {[...new Set(session.def.pieces.map((p) => p.kind))].map(
                  (kind) => (
                    <p key={kind}>
                      {t(`puzzle.${kind}`)}
                      <span>
                        {
                          session.def.pieces.filter((p) => p.kind === kind)
                            .length
                        }
                      </span>
                    </p>
                  ),
                )}
                <p>
                  {t('explode.honeycomb')}
                  <span>{session.def.pieces.length}</span>
                </p>
                <p>
                  {t('explode.tension')}
                  <span>{session.def.faces.length}</span>
                </p>
                <p>
                  {t('explode.core')}
                  <span>1</span>
                </p>
              </div>
            </div>
            <div hidden={s.mode !== 'customize'} inert={s.solving}>
              <CustomizePanel session={session} />
            </div>
            <div hidden={s.mode !== 'solver'}>
              <SolverPanel session={session} />
            </div>
            <div hidden={s.mode !== 'camera'}>
              <div className="camera-grid">
                {session.def.faces.map((face) => (
                  <button
                    key={face.id}
                    onClick={() => session.camera.face(face.id)}
                  >
                    <span>{face.id}</span>
                    {t('puzzle.face', { face: face.id })}
                  </button>
                ))}
              </div>
              <button
                className="wide-button"
                onClick={() => session.camera.reset()}
              >
                {t('camera.reset')}
                <Move3D size={18} />
              </button>
              <button
                className="wide-button"
                onClick={() => session.camera.focus()}
              >
                {t('camera.focus')}
                <Focus size={18} />
              </button>
              <button
                className="wide-button"
                onClick={() => session.camera.fit()}
              >
                {t('camera.fit')}
                <Focus size={18} />
              </button>
              <button
                className="wide-button"
                onClick={() => session.presentation(true)}
              >
                {t('app.presentation')}
                <Expand size={16} />
              </button>
              <Toggle
                label={t('camera.auto')}
                value={s.settings.autoRotate}
                onChange={(autoRotate) => session.settings({ autoRotate })}
              />
              {range('camera.roughness', 'roughness', 0.05, 0.9)}
              <section className="panel-section">
                <h3>{t('camera.light')}</h3>
                <Toggle
                  label={t('camera.follow')}
                  value={s.settings.lightFollowCamera}
                  onChange={(lightFollowCamera) =>
                    session.settings({ lightFollowCamera })
                  }
                />
                {range('camera.azimuth', 'lightAzimuth', -180, 180, 1, 0, '°')}
                {range(
                  'camera.elevation',
                  'lightElevation',
                  -90,
                  90,
                  1,
                  0,
                  '°',
                )}
                {range('camera.intensity', 'lightIntensity', 0, 6)}
              </section>
              <Choice
                label={t('camera.quality')}
                value={s.settings.quality}
                options={['auto', 'high', 'low'].map((q) => [
                  q,
                  t(q === 'auto' ? 'camera.adaptive' : `camera.${q}`),
                ])}
                onChange={(quality) =>
                  session.settings({
                    quality: quality as typeof s.settings.quality,
                  })
                }
              />
              <Choice
                label={t('motion.easing')}
                value={s.settings.easing}
                options={['smooth', 'magnetic', 'linear'].map((q) => [
                  q,
                  t(`motion.${q}`),
                ])}
                onChange={(easing) =>
                  session.settings({
                    easing: easing as typeof s.settings.easing,
                  })
                }
              />
            </div>
            <div hidden={s.mode !== 'inspect'}>
              <div className="inspection-state">
                <span className="live-dot" />
                {t('inspect.valid')}
                <strong>
                  {session.def.pieces.length} / {session.def.pieces.length}
                </strong>
              </div>
              <p className="help-text">{t('inspect.help')}</p>
              <h3>{t('player.historyTitle')}</h3>
              <p className="microcopy">
                {t('player.step', { index: s.cursor, count: s.history.length })}
              </p>
              <button
                className="wide-button"
                onClick={() =>
                  s.player?.kind === 'history' && s.player.playing
                    ? session.stop()
                    : session.replay()
                }
              >
                {t(
                  s.player?.kind === 'history' && s.player.playing
                    ? 'player.stop'
                    : 'player.replay',
                )}
              </button>
              <button
                className="wide-button"
                disabled={!s.scrambleState || s.solving}
                onClick={() => session.returnToScramble()}
              >
                {t('inspect.scramble')}
                <RotateCcw size={15} />
              </button>
              <div className="puzzle-history">
                {s.history.length
                  ? s.history
                      .slice(Math.max(0, s.cursor - 50), s.cursor + 20)
                      .map((move, i) => <span key={i}>{move}</span>)
                  : t('player.empty')}
              </div>
              {s.selected.length > 0 && (
                <div className="part-legend">
                  {s.selected.map((id) => {
                    const tile = session.def.tiles.find((t) => t.id === id)!,
                      piece = session.def.pieces[tile.piece];
                    return (
                      <p key={id}>
                        {id}
                        <span>{t(`puzzle.${piece.kind}`)}</span>
                        <code>
                          {session.def.group.quaternions[
                            s.puzzle.rotations[tile.piece]
                          ]
                            .toArray()
                            .map((n) => n.toFixed(2))
                            .join(' , ')}
                        </code>
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
            {s.player && s.mode !== 'solver' && (
              <div className="puzzle-player-link">
                <button
                  className="wide-button"
                  onClick={() => session.patch({ mode: 'solver' })}
                >
                  {t('player.title')} · {s.player.index} /{' '}
                  {s.player.moves.length}
                </button>
                <button
                  onClick={() =>
                    s.player?.playing ? session.pause() : void session.play()
                  }
                >
                  {t(s.player.playing ? 'player.pause' : 'player.play')}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
      {s.notice && (
        <div className="notice" role="status">
          {t(s.notice.key, s.notice.params)}
        </div>
      )}
    </main>
  );
}
