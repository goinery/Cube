'use client';
import { tx, useLanguage } from '@/lib/i18n';
import { memo, useState } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  StepBack,
  Copy,
  Check,
  ChevronDown,
} from 'lucide-react';
import {
  useCube,
  play,
  pause,
  playerNext,
  playerPrevious,
  seek,
  settings,
  notify,
} from '@/lib/cube/store';
import { Range } from './Controls';
export default memo(function Player() {
  useLanguage();
  const s = useCube('player', 'busy', 'solving', 'settings'),
    p = s.player,
    [open, setOpen] = useState(true);
  if (!p) return null;
  const stage =
    p.stages.find((x) => p.index >= x.start && p.index < x.end) ||
    (p.index === p.moves.length ? p.stages.at(-1) : undefined);
  return (
    <section className={`player${open ? '' : ' compact'}`} inert={s.solving}>
      <div className="section-head">
        <div>
          <span className="eyebrow">SEQUENCE PLAYER</span>
          <h3>{p.title}</h3>
        </div>
        <span className="counter">
          {p.index}
          <span> / {p.moves.length}</span>
        </span>
        <button
          className="player-collapse"
          aria-expanded={open}
          aria-label={open ? tx('legacy.m241') : tx('legacy.m242')}
          title={open ? tx('legacy.m241') : tx('legacy.m242')}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {p.stages.length > 0 && (
        <div className="stage-list">
          {p.stages.map((st, i) => (
            <button
              key={i}
              className={`${p.index >= st.end ? 'complete' : ''} ${stage === st ? 'current' : ''}`}
              onClick={() => void seek(st.start)}
              disabled={s.busy}
              title={tx('legacy.m243', { p0: st.label })}
            >
              <span>
                {p.index >= st.end ? (
                  <Check size={12} />
                ) : (
                  String(i + 1).padStart(2, '0')
                )}
              </span>
              {st.name}
            </button>
          ))}
        </div>
      )}
      {stage && (
        <div className="stage-description">
          <strong>{stage.label}</strong>
          <p>{stage.description}</p>
          <button
            className="text-button"
            disabled={s.busy}
            onClick={() => {
              void seek(stage.start).then(() => play());
            }}
          >
            {tx('legacy.m244')}
          </button>
        </div>
      )}
      <div className="move-track" aria-label={tx('legacy.m245')}>
        {p.moves.length ? (
          p.moves.map((m, i) => (
            <button
              key={i}
              className={`${i < p.index ? 'done' : ''} ${i === p.index ? 'active' : ''}`}
              onClick={() => void seek(i)}
              disabled={s.busy}
              title={tx('legacy.m246', { p0: i + 1 })}
            >
              {m}
            </button>
          ))
        ) : (
          <span>{tx('legacy.m247')}</span>
        )}
      </div>
      <div className="progress-line">
        <span
          style={{
            width: `${p.moves.length ? (p.index / p.moves.length) * 100 : 100}%`,
          }}
        />
      </div>
      <div className="player-buttons">
        <button
          className="icon-button"
          title={tx('legacy.m248')}
          aria-label={tx('legacy.m248')}
          disabled={s.busy || p.index === 0}
          onClick={() => void seek(0)}
        >
          <RotateCcw size={17} />
        </button>
        <button
          className="icon-button"
          title={tx('legacy.m249')}
          aria-label={tx('legacy.m249')}
          disabled={s.busy || p.index === 0}
          onClick={() => void playerPrevious()}
        >
          <StepBack size={18} />
        </button>
        <button
          className="play-button"
          aria-label={p.playing ? tx('legacy.m050') : tx('legacy.m250')}
          onClick={() =>
            p.playing
              ? pause()
              : p.index === p.moves.length
                ? void seek(0).then(() => play())
                : void play()
          }
          disabled={s.busy && !p.playing}
        >
          {p.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          className="icon-button"
          title={tx('legacy.m251')}
          aria-label={tx('legacy.m251')}
          disabled={s.busy || p.index === p.moves.length}
          onClick={() => {
            pause();
            void playerNext();
          }}
        >
          <SkipForward size={18} />
        </button>
        <button
          className="icon-button"
          title={tx('legacy.m252')}
          aria-label={tx('legacy.m252')}
          onClick={() => {
            void navigator.clipboard.writeText(p.moves.join(' ')).then(
              () => notify(tx('legacy.m253')),
              () => notify(tx('legacy.m254')),
            );
          }}
        >
          <Copy size={16} />
        </button>
      </div>
      <Range
        label={tx('legacy.m255')}
        value={s.settings.speed}
        min={0.25}
        max={3}
        step={0.25}
        unit="×"
        onChange={(v) => settings({ speed: v })}
      />
    </section>
  );
});
