import PlayerControls,{ MoveTrack } from './PlayerControls';
import AlgorithmEditor from './AlgorithmEditor';
import { presetPolicy,validatePresets } from '@/lib/puzzle/presets';
import { useState } from 'react';
import {
Copy
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useSession,defaultKeys,defaultPresets,type Session } from '@/lib/puzzle/session';
import { download } from '@/lib/puzzle/persistence';
import { keyboardShortcut,formatShortcut } from '@/lib/workspace/keybindings';
import { Range,Toggle } from '@/components/workspace/Controls';

export function AlgorithmPanel({ session }: { session: Session }) {
  const s = useSession(session), { t } = useTranslation();
  return <AlgorithmEditor presets={s.presets} readPresets={() => session.state.presets} policy={presetPolicy(session.def)} label={(p) => p.labelKey ? t(p.labelKey) : p.name} create={(p) => ({ ...p, id: crypto.randomUUID() })}
    onChange={(presets) => session.patch({presets})} onPlay={(input) => {  session.run(input); }}
    onImport={async (file) => {
      if (file.size > 3 * 1024 * 1024) throw new Error('project.tooLarge');
      const data = JSON.parse(await file.text());
      if (data.puzzleId !== session.def.id) throw new Error('project.invalid');
      return validatePresets(session.def, data.presets).map((p) => ({...p, id: crypto.randomUUID()}));
    }}
    onExport={() => download({puzzleId: session.def.id, presets: session.state.presets}, `axis-${session.def.id}-algorithms.json`)}
    onReset={() => session.patch({presets: defaultPresets(session.def)})} onError={(error) => session.error(error)} disabled={s.solving}/>
}
export function KeybindingsPanel({ session }: { session: Session }) {
  const s = useSession(session),
    { t } = useTranslation();
  const actions = [
    ...new Set([
      ...session.def.faces.flatMap((f) => [f.id, f.id + "'", f.id + '2']),
      ...session.def.primitiveMoves,
      ...Object.keys(s.keys),
    ]),
  ];
  return (
    <details className="puzzle-keybindings">
      <summary>{t('keys.title')}</summary>
      <></>
      {actions.map((action) => (
        <label key={action}>
          <span>
            {['undo', 'redo', 'playPause', 'exitPresentation'].includes(action)
              ? t(
                  action === 'playPause'
                    ? 'keys.playPause'
                    : action === 'exitPresentation'
                      ? 'app.exitPresentation'
                      : `motion.${action}`,
                )
              : action}
          </span>
          <input
            readOnly
            aria-label={action}
            value={
              s.keys[action] ? formatShortcut(s.keys[action]) : t('keys.unset')
            }
            onKeyDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (e.key === 'Escape') {
                e.currentTarget.blur();
                return;
              }
              const binding =
                e.key === 'Delete' || e.key === 'Backspace'
                  ? ''
                  : keyboardShortcut(e.nativeEvent);
              if (binding === null) return;
              if (
                binding &&
                Object.entries(s.keys).some(
                  ([key, value]) => key !== action && value === binding,
                )
              ) {
                session.notify('keys.conflict');
                return;
              }
              session.patch({ keys: { ...s.keys, [action]: binding } });
              e.currentTarget.blur();
            }}
          />
        </label>
      ))}
      <button
        className="secondary-button"
        onClick={() => session.patch({ keys: defaultKeys(session.def) })}
      >
        {t('keys.defaults')}
      </button>
    </details>
  );
}
export function Player({ session }: { session: Session }) {
  const s = useSession(session),
    { t } = useTranslation(),
    p = s.player;
  if (!p) return null;
  return (
    <section className="player">
      <div className="section-head">
        <h3>{t(`player.${p.kind}`)}</h3>
        <span className="counter">
          {p.index} / {p.moves.length}
        </span>
        <button
          aria-label={t('common.copy')}
          onClick={() =>
            void navigator.clipboard
              .writeText(p.moves.join(' '))
              .then(() => session.notify('common.copied'))
              .catch(() => session.notify('common.error'))
          }
        >
          <Copy size={15} />
        </button>
      </div>
      {p.stages.length > 0 && (
        <div className="stage-list">
          {p.stages.map((stage, i) => (
            <button
              key={i}
              onClick={() => session.seek(stage.start)}
              className={
                p.index >= stage.start && p.index < stage.end ? 'current' : ''
              }
            >
              {t(stage.key, {
                kind:
                  typeof stage.params?.kindKey === 'string'
                    ? t(stage.params.kindKey)
                    : '',
              })}
            </button>
          ))}
        </div>
      )}
      <MoveTrack moves={p.moves} index={p.index} onSeek={(i) => {void session.seek(i);}} disabled={s.solving}/>
      <PlayerControls index={p.index} length={p.moves.length} playing={p.playing} disabled={s.solving} onSeek={(i) => {void session.seek(i);}} onPrevious={() => {void session.previous();}} onNext={() => {void session.next();}} onPlay={() => {void session.play();}} onPause={() => session.pause()} onStop={() => session.stop()}/>
      <Range
        label={t('player.jump')}
        value={p.index}
        min={0}
        max={Math.max(1, p.moves.length)}
        step={1}
        digits={0}
        onChange={(index) => session.seek(index)}
      />
      <Range
        label={t('motion.speed')}
        value={s.settings.speed}
        min={0.2}
        max={4}
        onChange={(speed) => session.settings({ speed })}
      />
    </section>
  );
}
export function SolverPanel({ session }: { session: Session }) {
  const s = useSession(session),
    { t } = useTranslation(),
    [pictures, setPictures] = useState(
      Object.keys(s.appearance.photos).length > 0,
    );
  return (
    <>
      <div className="section-head">
        <h3>{t('solver.title')}</h3>
      </div>
      <Toggle
        label={t('solver.pictures')}
        value={pictures}
        onChange={setPictures}
        disabled={s.solving}
      />
      <></>
      <button
        className="primary-button"
        onClick={() =>
          s.solving ? session.cancelSolve() : session.solve(pictures)
        }
      >
        {t(s.solving ? 'solver.cancel' : 'solver.start')}
      </button>
      {s.solveStatus && (
        <output className="solve-progress">
          {t(s.solveStatus.key, s.solveStatus.params)}
        </output>
      )}
      {s.solveResult && (
        <p className="help-text">{t('solver.done', s.solveResult)}</p>
      )}
      <Player session={session} />
    </>
  );
}
