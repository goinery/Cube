'use client';
import { assemblyDefaults } from '@/lib/puzzle-config';
import { tx, useLanguage } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import {
  Move3D,
  Expand,
  Undo2,
  Redo2,
  RotateCcw,
  Shuffle,
  ArrowUpRight,
  MousePointer2,
  Copy,
  Focus,
  CircleStop,
} from 'lucide-react';
import Viewport from './Viewport';
import type { PuzzleType } from './PuzzleSwitcher';
import WorkspaceHeader, { WorkspaceFooter } from '../workspace/WorkspaceHeader';
import WorkspacePanel, { useWorkspacePanel } from '../workspace/WorkspacePanel';

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
  keyboardShortcut,
  shouldIgnoreShortcut,
  shortcutActions,
} from '@/lib/cube/keybindings';
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
            <span>{tx('app.axes', { count: 6 })}</span>
            <span>{tx('app.tiles', { count: 54 })}</span>
          </div>
        </section>
        <WorkspacePanel controller={panel}>
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
              {s.partialTurns && (
                <p className="help-text" aria-live="polite">
                  {withinTurnTolerance(s.partialTurns, s.settings.turnTolerance)
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
                  settings(assemblyDefaults('cube'));
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
                disabled={s.solving}
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
                disabled={s.solving}
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
      <WorkspaceFooter mode={s.mode} explode={s.settings.explode} />
      {s.notice && <output className="toast">{s.notice}</output>}
    </main>
  );
}
