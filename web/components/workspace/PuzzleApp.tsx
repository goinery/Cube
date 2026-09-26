import { assemblyDefaults } from '@/lib/puzzle-config';
import { useEffect, useMemo, useState } from 'react';
import {
  Move3D,
  Expand,
  Copy,
  Focus,
  RotateCcw,
  Shuffle,
  Undo2,
  Redo2,
  MousePointer2,
} from 'lucide-react';
import type { PuzzleType } from '../cube/PuzzleSwitcher';
import WorkspaceHeader, { WorkspaceFooter } from './WorkspaceHeader';
import WorkspacePanel, { useWorkspacePanel } from './WorkspacePanel';
import { Range, Choice, Toggle } from '../cube/Controls';
import { useTranslation } from '@/lib/i18n';
import { getSession, useSession } from '@/lib/puzzle/session';
import { colorSolved, pictureSolved, scramble } from '@/lib/puzzle/model';
import { restore, save, setAutoSave, watch } from '@/lib/puzzle/persistence';
import { registerPuzzleTools } from '@/lib/puzzle/webmcp';
import { keyboardShortcut, shouldIgnoreShortcut } from '@/lib/cube/keybindings';
import type { PuzzleId } from '@/lib/puzzle/types';
import PuzzleViewport from './PuzzleViewport';
import { FaceMaps } from './FaceCanvas';
import CustomizePanel from './CustomizePanel';
import {
  AlgorithmPanel,
  KeybindingsPanel,
  SolverPanel,
} from './Panels';

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
    [animate, setAnimate] = useState(true);
  const panel = useWorkspacePanel(s.mode, s.solving, (mode) =>
    session.patch({ mode }),
  );
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
      if (shouldIgnoreShortcut(e) || session.state.solving) return;
      const key = keyboardShortcut(e);
      if (!key) return;
      const action = Object.keys(session.state.keys).find(
        (a) => session.state.keys[a] === key,
      );
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      if (action === 'undo') void session.undo();
      else if (action === 'redo') void session.redo();
      else if (action === 'playPause') {
        if (session.state.player?.playing) session.pause();
        else void session.play();
      } else if (action === 'exitPresentation') session.presentation(false);
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
  const locked =
    s.solving || session.motion.moving || Boolean(s.player?.playing);
  return (
    <main
      className={`cube-app puzzle-workspace ${s.presentation ? 'presentation' : ''} ${panel.open ? '' : 'panel-collapsed'}`}
    >
      <WorkspaceHeader
        puzzle={id}
        onSwitch={onSwitch}
        autoSave={s.autoSave}
        onAutoSave={(on) => setAutoSave(session, on)}
        onSave={() => save(session)}
        onError={() => session.notify('common.error')}
        locked={locked}
        solving={s.solving}
        presentation={s.presentation}
        onPresentation={(value) => session.presentation(value)}
      />
      <div className="workspace">
        <section
          className="stage"
          inert={s.solving}
          data-solving={s.solving || undefined}
        >
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
            <span>{t('app.steps', { count: s.cursor })}</span>
          </div>
          <div className="view-controls">
            <Choice
              disabled={s.solving}
              label={t('camera.view')}
              value={s.view}
              options={['normal', 'hidden', 'all', 'net'].map((view) => [
                view,
                t(`camera.${view}`),
              ])}
              onChange={(view) =>
                session.patch({ view: view as typeof s.view })
              }
            />
            <Toggle
              label={t('camera.minimal')}
              value={s.settings.minimal}
              onChange={(minimal) => session.settings({ minimal })}
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
                title={t('camera.reset')}
                onClick={() => session.camera.reset()}
              >
                <RotateCcw size={17} />
              </button>
              <button
                aria-label={t('camera.fit')}
                title={t('camera.fit')}
                onClick={() => session.camera.fit()}
              >
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
        </section>
        <WorkspacePanel controller={panel}>
          <div data-section="play" className="panel-block">
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
            <div className="quick-actions">
              <button
                className="primary-button"
                disabled={locked}
                onClick={() => {
                  if (locked) return;
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
                disabled={locked}
                onClick={() => session.reset()}
              >
                <RotateCcw size={16} />
                {t('motion.reset')}
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
          <div data-section="explode" className="panel-block">
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
                session.settings(assemblyDefaults(session.def.id));
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
                      {session.def.pieces.filter((p) => p.kind === kind).length}
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
          <div
            data-section="customize"
            className="panel-block"
            inert={s.solving}
          >
            <CustomizePanel session={session} />
          </div>
          <div data-section="solver" className="panel-block">
            <SolverPanel session={session} />
          </div>
          <div data-section="camera" className="panel-block">
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
              {range('camera.elevation', 'lightElevation', -90, 90, 1, 0, '°')}
              {range('camera.intensity', 'lightIntensity', 0, 6)}
            </section>
            <Choice
              disabled={s.solving}
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
              disabled={s.solving}
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
          <div data-section="inspect" className="panel-block">
            <div className="inspection-state">
              <span className="live-dot" />
              {t('inspect.valid')}
              <strong>
                {session.def.pieces.length} / {session.def.pieces.length}
              </strong>
            </div>
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
                onClick={() => panel.jump('solver')}
              >
                {t('player.title')} · {s.player.index} / {s.player.moves.length}
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
        </WorkspacePanel>
      </div>
      <WorkspaceFooter mode={s.mode} explode={s.settings.explode} />
      {s.notice && (
        <output className="toast">{t(s.notice.key, s.notice.params)}</output>
      )}
    </main>
  );
}
