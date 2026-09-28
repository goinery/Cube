import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useSession, type Session } from '../session';
import { Toggle } from '@/components/workspace/Controls';
import Player from './Player';

export default function SolverPanel({ session }: { session: Session }) {
  const s = useSession(session),
    { t } = useTranslation(),
    [pictures, setPictures] = useState(true);
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
