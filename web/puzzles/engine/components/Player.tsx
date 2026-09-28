import PlayerControls, { MoveTrack } from '@/components/workspace/PlayerControls';
import { Copy } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useSession, type Session } from '../session';
import { Range } from '@/components/workspace/Controls';

export default function Player({ session }: { session: Session }) {
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
