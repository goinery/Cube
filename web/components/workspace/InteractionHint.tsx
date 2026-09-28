import { MousePointer2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { Mode } from '@/lib/workspace/types';

export default function InteractionHint({ mode, magnetStrength }: { mode: Mode; magnetStrength: number }) {
  const { t } = useTranslation();
  const key = mode === 'customize'
    ? 'legacy.m063'
    : mode === 'inspect'
      ? 'legacy.m065'
      : mode !== 'play'
        ? 'legacy.m064'
        : magnetStrength === 0
          ? 'legacy.m066'
          : 'legacy.m067';
  return (
    <div className="interaction-hint" title={t('camera.hint')}>
      <MousePointer2 size={15} />
      <span>{t(key)}</span>
    </div>
  );
}
