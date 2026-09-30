import SolverPanel from './SolverPanel';
import ShortcutEditor from '@/components/workspace/ShortcutEditor';
import CustomizePanel from './CustomizePanel';
import { MagneticControls, AssemblyControls } from '@/components/workspace/SettingsControls';
import PlayerControls,{ MoveTrack } from '@/components/workspace/PlayerControls';
import Notice from '@/components/workspace/Notice';
import CameraControls,{ EasingControl } from '@/components/workspace/CameraControls';
import PhotoDialog from './PhotoDialog';
import { importImage } from '@/lib/workspace/images';
import { download } from '@/lib/workspace/files';
import AlgorithmPanel from './AlgorithmPanel';
import { captureProject,importProject,restoreLocal,saveLocal,setAutoSave,watchAutosave } from '@/puzzles/pyraminx/persistence';
import PalettePresets from '@/components/workspace/PalettePresets';
import StageStatus from '@/components/workspace/StageStatus';
import QuickActions, { HistoryActions } from '@/components/workspace/QuickActions';
import InteractionHint from '@/components/workspace/InteractionHint';
import { tx,useLanguage } from '@/lib/i18n';
import { useEffect,useRef,useState } from 'react';
import {
CircleStop,
Copy,
Download,Focus,
Play,
RotateCcw,
Upload,
WandSparkles,
X
} from 'lucide-react';
import type { PuzzleType } from '@/components/workspace/PuzzleSwitcher';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspacePanel,{ useWorkspacePanel } from '@/components/workspace/WorkspacePanel';

import { Choice,Range,Toggle } from '@/components/workspace/Controls';
import type { Mode,View } from '@/lib/workspace/types';
import {
formatShortcut,
keyboardShortcut,
shouldIgnoreShortcut,
} from '@/lib/workspace/keybindings';
import { FACE_HEIGHT_RATIO } from '@/puzzles/pyraminx/appearance';
import {
AXES,
FACE_COLORS,
PYRAMINX_PALETTES,
FACE_NAMES,
PIECES,
TILES,
isSolved,
moveToken,scramble,
type Layer
} from '@/puzzles/pyraminx/model';
import {
align,
applyInstant,
cameraActions,
cancelSolve,
defaultColors,
defaultKeys,getState,
loadPlayer,
next,
notify,
patch,
pause,
runQuickAction,
perform,
play,
previous,
redo,
replayHistory,
resetPuzzle,seek,
setPresentation,
settings,
startSolve,
undo,
usePyraminx,
type Photo
} from '@/puzzles/pyraminx/store';
import Viewport from './Viewport';
export default function PyraminxApp({
  onSwitch,
}: {
  onSwitch: (puzzle: PuzzleType) => void;
}) {
  useLanguage();
  const s = usePyraminx();
  const [layer, setLayer] = useState<Layer>('body'),
    [reverse, setReverse] = useState(false),
    [animated, setAnimated] = useState(true);
  const panel = useWorkspacePanel(s.mode, s.solving, (mode) => patch({ mode }));
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
  async function newScramble() {
    if (getState().solving) return;
    if (!(await align(true))) return;
    const moves = scramble();
    patch({ scramble: moves.join(' ') });
    if (animated) {
      loadPlayer(moves, tx('legacy.m084'));
      void play();
    } else await applyInstant(moves);
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
          <StageStatus
            solved={solved}
            partial={s.partials.length > 0}
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
            <InteractionHint mode={s.mode} magnetStrength={s.settings.magnetStrength} />
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
        </section>
        <WorkspacePanel controller={panel}>
          <section {...section('play')}>
            <MagneticControls value={s.settings} onChange={settings} disabled={s.solving} maxAngle={60} />
            <QuickActions
              disabled={s.solving || s.dragging}
              onScramble={() => void runQuickAction(newScramble)}
              onAlign={() => void runQuickAction(() => align(true))}
              onReset={() => void runQuickAction(resetPuzzle)}
            />
            <HistoryActions cursor={s.cursor} length={s.history.length} disabled={locked} onUndo={() => { void undo(); }} onRedo={() => { void redo(); }} />
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
              <ShortcutEditor bindings={s.keybindings} disabled={s.solving}
                onChange={(keybindings) => patch({ keybindings })}
                onConflict={() => notify(tx('keys.conflict'))}
                onReset={() => patch({ keybindings: defaultKeys() })} />
            </section>
            <AlgorithmPanel />
          </section>
          <section {...section('explode')}>
            <AssemblyControls puzzle="pyraminx" value={s.settings} onChange={settings} disabled={s.solving} onReset={() => cameraActions.reset()} />
          </section>
          <section {...section('customize')}>
            <CustomizePanel />
          </section>
          <section {...section('solver')}>
            <SolverPanel />
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
            <CameraControls value={s.settings} onChange={settings} actions={cameraActions} onPresentation={() => setPresentation(true)} disabled={s.solving} limits={{roughness:[0.05,1],elevation:[-10,90],intensity:6}}/>
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
      <Notice message={s.notice}/>
    </main>
  );
}
