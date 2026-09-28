import { AlignCenter, RotateCcw, Shuffle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function QuickActions({
  disabled,
  onScramble,
  onAlign,
  onReset,
}: {
  disabled: boolean;
  onScramble: () => void;
  onAlign: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="quick-actions">
      <button type="button" className="primary-button" disabled={disabled} onClick={onScramble}>
        <Shuffle size={16} />
        {t('motion.scramble')}
      </button>
      <button type="button" className="secondary-button" disabled={disabled} onClick={onAlign} title={t('motion.alignHelp')}>
        <AlignCenter size={16} />
        {t('motion.align')}
      </button>
      <button type="button" className="secondary-button" disabled={disabled} onClick={onReset}>
        <RotateCcw size={16} />
        {t('motion.reset')}
      </button>
    </div>
  );
}
