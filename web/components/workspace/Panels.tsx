import { useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Copy,
  Upload,
  Download,
  X,
  Plus,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useSession, defaultKeys, type Session } from '@/lib/puzzle/session';
import { parseAlgorithm } from '@/lib/puzzle/model';
import { download } from '@/lib/puzzle/persistence';
import { keyboardShortcut, formatShortcut } from '@/lib/cube/keybindings';
import { Range, Choice, Toggle } from '../cube/Controls';

export function AlgorithmPanel({ session }: { session: Session }) {
  const s = useSession(session),
    { t } = useTranslation(),
    [input, setInput] = useState(s.presets[0]?.algorithm || ''),
    [name, setName] = useState(''),
    file = useRef<HTMLInputElement>(null);
  return (
    <section className="panel-section">
      <div className="section-head">
        <h3>{t('algorithm.title')}</h3>
        <button
          aria-label={t('common.import')}
          onClick={() => file.current?.click()}
        >
          <Upload size={16} />
        </button>
        <button
          aria-label={t('common.export')}
          onClick={() =>
            download(
              { puzzleId: session.def.id, presets: s.presets },
              `axis-${session.def.id}-algorithms.json`,
            )
          }
        >
          <Download size={16} />
        </button>
      </div>
      <div className="algorithm-presets">
        {s.presets.map((p) => (
          <div key={p.id} className="puzzle-preset">
            <button
              className={input === p.algorithm ? 'active' : ''}
              onClick={() => setInput(p.algorithm)}
            >
              {p.labelKey ? t(p.labelKey) : p.name}
            </button>
            <button
              aria-label={t('common.delete')}
              onClick={() =>
                session.patch({
                  presets: s.presets.filter((x) => x.id !== p.id),
                })
              }
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <textarea
        className="puzzle-algorithm"
        aria-label={t('algorithm.title')}
        placeholder={t('algorithm.placeholder')}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        spellCheck={false}
      />
      <div className="puzzle-algorithm-add">
        <input
          value={name}
          placeholder={t('algorithm.newName')}
          aria-label={t('algorithm.newName')}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          aria-label={t('common.add')}
          disabled={!name.trim() || !input.trim()}
          onClick={() => {
            try {
              parseAlgorithm(session.def, input);
              session.patch({
                presets: [
                  ...s.presets,
                  {
                    id: crypto.randomUUID(),
                    name: name.trim(),
                    algorithm: input.trim(),
                  },
                ],
              });
              setName('');
            } catch (e) {
              session.error(e);
            }
          }}
        >
          <Plus size={18} />
        </button>
      </div>
      <button
        className="primary-button"
        onClick={() => session.run(input)}
        disabled={s.solving}
      >
        <Play size={16} />
        {t('algorithm.play')}
      </button>
      <p className="microcopy">
        {t(
          session.def.id === 'megaminx'
            ? 'algorithm.minxNotation'
            : 'algorithm.notation',
        )}
      </p>
      <input
        type="file"
        hidden
        accept=".json"
        ref={file}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          void f
            .text()
            .then((raw) => {
              const data = JSON.parse(raw);
              if (
                data.puzzleId !== session.def.id ||
                !Array.isArray(data.presets) ||
                data.presets.length > 200
              )
                throw new Error('project.invalid');
              const presets = [...session.state.presets];
              let count = 0;
              for (const p of data.presets) {
                if (
                  typeof p.name !== 'string' ||
                  typeof p.algorithm !== 'string'
                )
                  throw new Error('project.invalid');
                const algorithm = parseAlgorithm(session.def, p.algorithm).join(
                  ' ',
                );
                if (
                  !algorithm ||
                  presets.some((p) => p.algorithm === algorithm)
                )
                  continue;
                let name = p.name.slice(0, 80),
                  suffix = 2;
                while (presets.some((q) => q.name === name))
                  name = `${p.name.slice(0, 70)} (${suffix++})`;
                presets.push({
                  id: crypto.randomUUID(),
                  name,
                  algorithm,
                  ...(typeof p.labelKey === 'string'
                    ? { labelKey: p.labelKey }
                    : {}),
                });
                count++;
              }
              session.patch({ presets });
              session.notify('algorithm.imported', { count });
            })
            .catch((e) => session.error(e));
        }}
      />
    </section>
  );
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
      <p className="microcopy">{t('keys.clear')}</p>
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
  const start = Math.max(0, Math.min(p.index - 20, p.moves.length - 80));
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
      <div className="move-track">
        {p.moves.slice(start, start + 80).map((move, i) => (
          <button
            key={start + i}
            className={
              start + i < p.index
                ? 'done'
                : start + i === p.index
                  ? 'active'
                  : ''
            }
            onClick={() => session.seek(start + i)}
          >
            {move}
          </button>
        ))}
      </div>
      <div className="progress-line">
        <span
          style={{
            width: `${p.moves.length ? (p.index / p.moves.length) * 100 : 0}%`,
          }}
        />
      </div>
      <div className="player-buttons">
        <button aria-label={t('player.start')} onClick={() => session.seek(0)}>
          <RotateCcw size={17} />
        </button>
        <button
          aria-label={t('player.previous')}
          disabled={!p.index}
          onClick={() => session.previous()}
        >
          <SkipBack size={18} />
        </button>
        <button
          className="play-button"
          aria-label={t(p.playing ? 'player.pause' : 'player.play')}
          onClick={() => (p.playing ? session.pause() : void session.play())}
        >
          {p.playing ? <Pause size={19} /> : <Play size={19} />}
        </button>
        <button
          aria-label={t('player.next')}
          disabled={p.index === p.moves.length}
          onClick={() => void session.next()}
        >
          <SkipForward size={18} />
        </button>
        <button aria-label={t('player.stop')} onClick={() => session.stop()}>
          <X size={17} />
        </button>
      </div>
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
    [mode, setMode] = useState<'fast' | 'short' | 'teaching'>('fast'),
    [pictures, setPictures] = useState(true);
  return (
    <>
      <Choice
        label={t('solver.title')}
        value={mode}
        options={(['fast', 'short', 'teaching'] as const).map((mode) => [
          mode,
          t(`solver.${mode}`),
        ])}
        onChange={(v) => setMode(v as typeof mode)}
      />
      <Toggle
        label={t('solver.pictures')}
        value={pictures}
        onChange={setPictures}
        disabled={s.solving}
      />
      <p className="microcopy">{t('solver.help')}</p>
      <button
        className="primary-button"
        onClick={() =>
          s.solving ? session.cancelSolve() : session.solve(mode, pictures)
        }
      >
        {t(s.solving ? 'solver.cancel' : 'solver.start')}
      </button>
      {s.solveStatus && (
        <p className="solve-progress" role="status">
          {t(s.solveStatus.key, s.solveStatus.params)}
        </p>
      )}
      {s.solveResult && (
        <p className="help-text">{t('solver.done', s.solveResult)}</p>
      )}
      <Player session={session} />
    </>
  );
}
