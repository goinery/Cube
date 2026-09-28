import { CircleStop,Copy,Pause,Play,RotateCcw,SkipBack,SkipForward } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
export function MoveTrack({moves, index, onSeek, disabled = false}: {moves: string[]; index: number; onSeek: (index: number) => void; disabled?: boolean}) {
  const {t} = useTranslation();
  const start = Math.max(0, Math.min(index - 20, moves.length - 80));
  return <><div className="move-track" aria-label={t('legacy.m245')}>
    {moves.slice(start, start + 80).map((move, offset) => <button key={start + offset} className={start+offset < index ? 'done' : start+offset === index ? 'active' : ''} disabled={disabled} onClick={() => onSeek(start + offset)}>{move}</button>)}
  </div><div className="progress-line"><span style={{width:`${moves.length ? index / moves.length * 100 : 100}%`}}/></div></>;
}
export default function PlayerControls({index, length, playing, busy = false, disabled = false, onSeek, onPrevious, onNext, onPlay, onPause, onStop, onCopy}: {
  index: number; length: number; playing: boolean; busy?: boolean; disabled?: boolean;
  onSeek: (index: number) => void; onPrevious: () => void; onNext: () => void;
  onPlay: () => void; onPause: () => void; onStop?: () => void; onCopy?: () => void;
}) {
  const {t} = useTranslation();
  return <div className="player-buttons">
    <button className="icon-button" aria-label={t('player.start')} disabled={disabled || busy || !index} onClick={() => onSeek(0)}><RotateCcw size={17}/></button>
    <button className="icon-button" aria-label={t('player.previous')} disabled={disabled || busy || !index} onClick={onPrevious}><SkipBack size={18}/></button>
    <button className="play-button" aria-label={t(playing ? 'player.pause' : 'player.play')} disabled={disabled || (busy && !playing)} onClick={playing ? onPause : onPlay}>{playing ? <Pause size={18}/> : <Play size={18}/>}</button>
    <button className="icon-button" aria-label={t('player.next')} disabled={disabled || busy || index === length} onClick={onNext}><SkipForward size={18}/></button>
    {onCopy && <button className="icon-button" aria-label={t('common.copy')} onClick={onCopy}><Copy size={16}/></button>}
    {onStop && <button className="icon-button" aria-label={t('player.stop')} disabled={disabled} onClick={onStop}><CircleStop size={18}/></button>}
  </div>;
}
