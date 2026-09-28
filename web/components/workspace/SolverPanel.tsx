import type { ReactNode } from 'react';
import { ArrowUpRight, CheckCircle2, LoaderCircle, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { Solution, SolveMode } from '@/puzzles/engine/solver-types';
import { Toggle } from './Controls';

interface Props {
  pictures: boolean;
  onPicturesChange: (pictures: boolean) => void;
  solving: boolean;
  busy?: boolean;
  status: string;
  result: Pick<Solution, 'count' | 'seconds' | 'colorMoves' | 'centerMoves'> | null;
  onSolve: () => void;
  onCancel: () => void;
  cfop?: { mode: SolveMode; onModeChange: (mode: SolveMode) => void };
  notice?: ReactNode;
  children: ReactNode;
}

export default function SolverPanel({
  pictures, onPicturesChange, solving, busy, status, result,
  onSolve, onCancel, cfop, notice, children,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      <div className="section-head">
        <h3>{t('solver.title')}</h3>
      </div>
      {cfop && (
        <div className="solver-options" role="group" aria-label={t('solver.method')}>
          {(['standard', 'cfop'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cfop.mode === mode ? 'active' : ''}
              aria-pressed={cfop.mode === mode}
              disabled={solving}
              onClick={() => cfop.onModeChange(mode)}
            >
              <i aria-hidden="true" />
              <span>
                <strong>{t(`solver.${mode}`)}</strong>
                <small>{t(`solver.${mode}Description`)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      {notice}
      <Toggle
        label={t('solver.pictures')}
        value={pictures}
        onChange={onPicturesChange}
        disabled={solving}
      />
      <button
        className="primary-button solve-button"
        disabled={busy || solving}
        onClick={onSolve}
      >
        <span>{t('solver.start')}</span>
        {solving ? <LoaderCircle className="spin" size={18} /> : <ArrowUpRight size={18} />}
      </button>
      {solving && (
        <output className="solver-progress" aria-live="polite">
          <LoaderCircle className="spin" size={16} />
          <span>{status}</span>
          <button onClick={onCancel} aria-label={t('solver.cancel')}>
            <X size={17} />
            {t('solver.cancel')}
          </button>
        </output>
      )}
      {result && (
        <div className="solver-result" role="status">
          <CheckCircle2 size={17} />
          <div>
            <strong>{t('solver.done', { count: result.count, seconds: result.seconds })}</strong>
            {result.colorMoves !== undefined && (
              <p>{t('solver.breakdown', {
                colors: result.colorMoves,
                pictures: result.centerMoves ?? 0,
              })}</p>
            )}
          </div>
        </div>
      )}
      {children}
    </>
  );
}
