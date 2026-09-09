'use client';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  StepBack,
  Copy,
  Check,
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
export default function Player() {
  const s = useCube(),
    p = s.player;
  if (!p) return null;
  const stage =
    p.stages.find((x) => p.index >= x.start && p.index < x.end) ||
    (p.index === p.moves.length ? p.stages.at(-1) : undefined);
  return (
    <section className="player" inert={s.solving}>
      <div className="section-head">
        <div>
          <span className="eyebrow">SEQUENCE PLAYER</span>
          <h3>{p.title}</h3>
        </div>
        <span className="counter">
          {p.index}
          <span> / {p.moves.length}</span>
        </span>
      </div>
      {p.stages.length > 0 && (
        <div className="stage-list">
          {p.stages.map((st, i) => (
            <button
              key={i}
              className={`${p.index >= st.end ? 'complete' : ''} ${stage === st ? 'current' : ''}`}
              onClick={() => void seek(st.start)}
              disabled={s.busy}
              title={`跳转到 ${st.label}`}
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
            重新播放此阶段 ↺
          </button>
        </div>
      )}
      <div className="move-track" aria-label="算法步骤">
        {p.moves.length ? (
          p.moves.map((m, i) => (
            <button
              key={i}
              className={`${i < p.index ? 'done' : ''} ${i === p.index ? 'active' : ''}`}
              onClick={() => void seek(i)}
              disabled={s.busy}
              title={`定位到第 ${i + 1} 步`}
            >
              {m}
            </button>
          ))
        ) : (
          <span>当前阶段已完成</span>
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
          title="从头定位"
          aria-label="从头定位"
          disabled={s.busy || p.index === 0}
          onClick={() => void seek(0)}
        >
          <RotateCcw size={17} />
        </button>
        <button
          className="icon-button"
          title="上一步"
          aria-label="上一步"
          disabled={s.busy || p.index === 0}
          onClick={() => void playerPrevious()}
        >
          <StepBack size={18} />
        </button>
        <button
          className="play-button"
          aria-label={p.playing ? '暂停' : '播放'}
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
          title="下一步"
          aria-label="下一步"
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
          title="复制算法"
          aria-label="复制算法"
          onClick={() => {
            void navigator.clipboard.writeText(p.moves.join(' ')).then(
              () => notify('算法已复制。'),
              () => notify('浏览器未授予剪贴板权限。'),
            );
          }}
        >
          <Copy size={16} />
        </button>
      </div>
      <Range
        label="播放速度"
        value={s.settings.speed}
        min={0.25}
        max={3}
        step={0.25}
        unit="×"
        onChange={(v) => settings({ speed: v })}
      />
    </section>
  );
}
