import PlayerControls,{ MoveTrack } from '@/components/workspace/PlayerControls';
import { tx,useLanguage } from '@/lib/i18n';
import { memo,useState } from 'react';
import {
Check,
ChevronDown
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
} from '@/puzzles/cube/store';
import { Range } from '@/components/workspace/Controls';
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
          <></>
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
      <MoveTrack moves={p.moves} index={p.index} onSeek={(i) => { void seek(i); }} disabled={s.busy || s.solving}/>
      <PlayerControls index={p.index} length={p.moves.length} playing={p.playing} busy={s.busy} disabled={s.solving} onSeek={(i) => {void seek(i);}} onPrevious={() => {void playerPrevious();}} onNext={() => {pause();void playerNext();}} onPlay={() => {if(p.index === p.moves.length) void seek(0).then(() => play()); else void play();}} onPause={pause}
        onCopy={() => {void navigator.clipboard.writeText(p.moves.join(' ')).then(() => notify(tx('common.copied')), () => notify(tx('common.error')));}}/>
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
