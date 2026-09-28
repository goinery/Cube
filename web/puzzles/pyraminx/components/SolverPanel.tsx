import { CircleStop, WandSparkles } from 'lucide-react';
import { tx, useLanguage } from '@/lib/i18n';
import PlayerControls, { MoveTrack } from '@/components/workspace/PlayerControls';
import { EasingControl } from '@/components/workspace/CameraControls';
import { Range } from '@/components/workspace/Controls';
import { cancelSolve, startSolve, settings, usePyraminx, seek, previous, next, play, pause, patch } from '../store';

export default function SolverPanel() {
  useLanguage();
  const s = usePyraminx(), locked = s.busy || s.solving;
  return <>

            <div className="section-head">
              <h3>{tx('legacy.m365')}</h3>
              <span className="tag">{tx('legacy.m366')}</span>
            </div>
            <button
              className="wide-button"
              disabled={s.busy}
              onClick={() => {
                if (s.solving) cancelSolve();
                else void startSolve();
              }}
            >
              {s.solving ? tx('legacy.m368') : tx('legacy.m369')}
              {s.solving ? (
                <CircleStop size={16} />
              ) : (
                <WandSparkles size={16} />
              )}
            </button>
            {s.solving && (
              <output className="microcopy">{s.solveStatus}</output>
            )}
            <Range
              label={tx('legacy.m255')}
              value={s.settings.speed}
              min={0.2}
              max={3}
              step={0.1}
              digits={1}
              unit="×"
              disabled={s.solving}
              onChange={(speed) => settings({ speed })}
            />
            <EasingControl value={s.settings.easing} onChange={(easing) => settings({easing})} disabled={s.solving}/>
            {s.player && (
              <div className="pyr-player">
                <div className="section-head">
                  <h3>{s.player.title}</h3>
                  <span className="tag">
                    {s.player.index} / {s.player.moves.length}
                  </span>
                </div>
                <PlayerControls index={s.player.index} length={s.player.moves.length} playing={s.player.playing} busy={s.busy} disabled={s.solving} onSeek={(i) => {void seek(i);}} onPrevious={() => {void previous();}} onNext={() => {void next();}} onPlay={() => {void play();}} onPause={pause} onStop={() => {pause();patch({player:null});}}/>
                <Range label={tx('player.jump')} value={s.player.index} min={0} max={Math.max(1,s.player.moves.length)} step={1} digits={0} disabled={locked} onChange={(i) => {void seek(i);}}/>
                {s.player.bodyLength !== undefined && (
                  <div className="pyr-button-row">
                    <button disabled={locked} onClick={() => void seek(0)}>
                      {tx('legacy.m376')}
                    </button>
                    <button
                      disabled={locked}
                      onClick={() => void seek(s.player!.bodyLength!)}
                    >
                      {tx('legacy.m377')}
                    </button>
                    <button
                      disabled={locked}
                      onClick={() => void seek(s.player!.moves.length)}
                    >
                      {tx('legacy.m378')}
                    </button>
                  </div>
                )}
                <MoveTrack moves={s.player.moves} index={s.player.index} disabled={locked} onSeek={(i) => {void seek(i);}}/>

              </div>
            )}
            </>;
}
