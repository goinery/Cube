import { useTranslation } from '@/lib/i18n';
import FrameRateControl from './FrameRateControl';

export default function StageStatus({
  solved,
  partial,
  currentMove,
  steps,
}: {
  solved: boolean;
  partial: boolean;
  currentMove: string;
  steps: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="stage-state">
      <i className={solved && !partial && !currentMove ? 'solved' : ''} />
      <span>
        {currentMove
          ? t('legacy.m053', { p0: currentMove })
          : t(partial ? 'legacy.m054' : solved ? 'legacy.m055' : 'legacy.m056')}
      </span>
      <span className="state-divider" />
      <span>{t('app.steps', { count: steps })}</span>
      <span className="state-divider stage-fps-divider" />
      <FrameRateControl />
    </div>
  );
}
