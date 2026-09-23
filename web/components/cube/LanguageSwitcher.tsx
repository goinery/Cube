import { Languages } from 'lucide-react';
import { setLanguage, useTranslation } from '@/lib/i18n';
export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  return (
    <button className="icon-button" aria-label={t('app.language')}
      title={t('app.language')} onClick={() => setLanguage(i18n.language === 'en' ? 'zh-CN' : 'en')}>
      <Languages size={18} />
    </button>
  );
}
