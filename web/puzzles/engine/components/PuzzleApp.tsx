import { MagneticControls, AssemblyControls } from '@/components/workspace/SettingsControls';
import Notice from '@/components/workspace/Notice';
import CameraControls from '@/components/workspace/CameraControls';
import StageStatus from '@/components/workspace/StageStatus';
import QuickActions, { HistoryActions } from '@/components/workspace/QuickActions';
import InteractionHint from '@/components/workspace/InteractionHint';
import { useEffect,useMemo,useState } from 'react';
import {
Copy,
Focus,
RotateCcw,
} from 'lucide-react';
import type { PuzzleType } from '@/components/workspace/PuzzleSwitcher';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspacePanel,{ useWorkspacePanel } from '@/components/workspace/WorkspacePanel';
import { Range,Choice,Toggle } from '@/components/workspace/Controls';
import { useTranslation } from '@/lib/i18n';
import { getSession,useSession } from '@/puzzles/engine/session';
import { colorSolved,scramble } from '@/puzzles/engine/model';
import { restore,save,setAutoSave,watch } from '@/puzzles/engine/persistence';
import { registerPuzzleTools } from '@/puzzles/engine/webmcp';
import { keyboardShortcut,shouldIgnoreShortcut } from '@/lib/workspace/keybindings';
import type { PuzzleId } from '@/puzzles/engine/types';
import PuzzleViewport from './PuzzleViewport';
import { FaceMaps } from './FaceCanvas';
import CustomizePanel from './CustomizePanel';
import AlgorithmPanel from './AlgorithmPanel';
import KeybindingsPanel from './KeybindingsPanel';
import SolverPanel from './SolverPanel';

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
    isMinx = id === 'megaminx';
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
          <StageStatus
            solved={resolved}
            partial={session.motion.held}
            currentMove={session.motion.tracks
              .filter((track) => track.mode !== 'held')
              .map((track) => track.key)
              .join(' · ')}
            steps={s.cursor}
          />
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
            <InteractionHint mode={s.mode} magnetStrength={s.settings.magnetStrength} />
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
            <MagneticControls value={s.settings} onChange={(patch) => session.settings(patch)} disabled={s.solving} maxAngle={(session.def.step * 90) / Math.PI} />
            <QuickActions
              disabled={locked || session.motion.dragging}
              onScramble={() => {
                  if (locked) return;
                  const moves = scramble(session.def);
                  session.rememberScramble(moves);
                  session.patch({ scramble: moves.join(' ') });
                  if (animate) {
                    session.loadPlayer(moves, 'scramble');
                    void session.play();
                  } else session.instant(moves);
              }}
              onAlign={() => {
                session.pause();
                session.motion.align(true);
              }}
              onReset={() => session.reset()}
            />
            <HistoryActions cursor={s.cursor} length={s.history.length} disabled={s.solving || session.motion.moving} onUndo={() => { void session.undo(); }} onRedo={() => { void session.redo(); }} />
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
            <AssemblyControls puzzle={session.def.id} value={s.settings} onChange={(patch) => session.settings(patch)} disabled={s.solving} onExplode={() => session.camera.fit()} onReset={() => setTimeout(() => session.camera.fit(), 350)} limits={{ internal: 3, gap: 0.2, gapStep: 0.002, size: 1.2, stickerOffset: 0.4 }} />
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
            <CameraControls value={s.settings} onChange={(update) => session.settings(update)} actions={session.camera} onPresentation={() => session.presentation(true)} disabled={s.solving} limits={{roughness:[0.05,0.9],elevation:[-90,90],intensity:6}}/>
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
      <Notice message={s.notice ? t(s.notice.key, s.notice.params) : null}/>
    </main>
  );
}
