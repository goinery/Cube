import { MagneticControls, AssemblyControls } from '@/components/workspace/SettingsControls';
import Notice from '@/components/workspace/Notice';
import CameraControls from '@/components/workspace/CameraControls';
import { keyboardShortcut,shouldIgnoreShortcut } from '@/lib/workspace/keybindings';
import StageStatus from '@/components/workspace/StageStatus';
import QuickActions, { HistoryActions } from '@/components/workspace/QuickActions';
import InteractionHint from '@/components/workspace/InteractionHint';
import { tx,useLanguage } from '@/lib/i18n';
import { useEffect,useState } from 'react';
import {
RotateCcw,
ArrowUpRight,
Copy,
Focus,
CircleStop
} from 'lucide-react';
import Viewport from './Viewport';
import type { PuzzleType } from '@/components/workspace/PuzzleSwitcher';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspacePanel,{ useWorkspacePanel } from '@/components/workspace/WorkspacePanel';

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
} from '@/puzzles/cube/persistence';
import { registerCubeTools } from '@/puzzles/cube/webmcp';
import { Choice,Toggle } from '@/components/workspace/Controls';
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
alignCube,
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
} from '@/puzzles/cube/store';
import { FACES,COLORS,isSolved,scramble,type Face } from '@/puzzles/cube/model';
import { canTurn, withinTurnTolerance } from '@/puzzles/cube/interaction';
import {
shortcutActions,
} from '@/puzzles/cube/keybindings';
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
      'scramble',
      'scrambleCursor',
      'selected',
      'notice',
      'autoSave',
    ),
    [modifier, setModifier] = useState(''),
    [animateScramble, setAnimateScramble] = useState(true);
  const panel = useWorkspacePanel(s.mode, s.solving, (mode) => patch({ mode }));
  const blockProps = (id: Mode) => ({
    className: 'panel-block',
    'data-section': id,
  });
  function anchorPanel(id: Mode, change: () => void) {
    change();
    panel.jump(id, false);
  }
  useEffect(registerCubeTools, []);
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (shouldIgnoreShortcut(e)) return;
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
        : null;
  return (
    <main
      className={`cube-app ${s.presentation ? 'presentation' : ''} ${panel.open ? '' : 'panel-collapsed'}`}
    >
      <WorkspaceHeader
        puzzle="cube"
        onSwitch={onSwitch}
        autoSave={s.autoSave}
        onAutoSave={toggleAutoSave}
        onSave={async () => {
          await saveProject();
          notify(tx('legacy.m034'));
        }}
        onError={() => notify(tx('common.error'))}
        locked={locked}
        solving={s.solving}
        presentation={s.presentation}
        onPresentation={setPresentation}
      />
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
          <StageStatus
            solved={solved}
            partial={!!s.partialTurns}
            currentMove={s.currentMove}
            steps={s.cursor}
          />
          <div className="view-controls">
            <Choice
              disabled={s.solving}
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
            <Toggle
              label={tx('camera.minimal')}
              value={s.settings.minimal}
              onChange={(minimal) => settings({ minimal })}
            />
          </div>
          <FaceMaps />
          <div className="stage-bottom">
            <InteractionHint mode={s.mode} magnetStrength={s.settings.magnetStrength} />
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
            <span>{tx('app.axes', { count: 6 })}</span>
            <span>{tx('app.tiles', { count: 54 })}</span>
          </div>
        </section>
        <WorkspacePanel controller={panel}>
          <section {...blockProps('play')}>
            <MagneticControls value={s.settings} onChange={settings} disabled={s.solving} maxAngle={45}>
{s.partialTurns && (
                <p className="help-text" aria-live="polite">
                  {withinTurnTolerance(s.partialTurns, s.settings.turnTolerance)
                    ? tx('legacy.m082', { p0: s.settings.turnTolerance })
                    : tx('legacy.m083', { p0: s.settings.turnTolerance })}
                </p>
              )}
</MagneticControls>
            <>
              <QuickActions
                disabled={locked}
                onScramble={newScramble}
                onAlign={() => {
                  pause();
                  void alignCube().catch(() => notify(tx('legacy.m487')));
                }}
                onReset={resetCube}
              />
              <HistoryActions cursor={s.cursor} length={s.history.length} disabled={locked} onUndo={() => { void undo(); }} onRedo={() => { void redo(); }} />
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
            <AssemblyControls puzzle="cube" value={s.settings} onChange={settings} disabled={s.solving} onExplode={() => setTimeout(() => cameraActions.fit(), 30)} onReset={() => setTimeout(() => cameraActions.reset(), 30)} />
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
              <CameraControls value={s.settings} onChange={settings} actions={cameraActions} onPresentation={() => setPresentation(true)} disabled={s.solving} limits={{roughness:[0.18,0.65],elevation:[-80,80],intensity:5}}/>
            </>
          </section>
          <section {...blockProps('inspect')}>
            <>
              <div className="inspection-state">
                <span className="live-dot" />
                {tx('legacy.m144')}
                <strong>26 / 26</strong>
              </div>
              <div className="inspection-list">
                {s.selected.length
                  ? s.selected.map((id) => {
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
                  : null}
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
                disabled={locked || !s.scramble || s.cursor < s.scrambleCursor}
                onClick={() => restoreHistory(s.history, s.scrambleCursor)}
              >
                {tx('legacy.m152')}
                <RotateCcw size={16} />
              </button>
            </>
          </section>
          <div className="panel-footer">
            <span>{tx('app.engine')}</span>
            <span>
              01.0 <i />
            </span>
          </div>
        </WorkspacePanel>
      </div>
      <Notice message={s.notice}/>
    </main>
  );
}
