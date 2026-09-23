import { tx, useLanguage } from '@/lib/i18n';
import { Languages } from 'lucide-react';
import { setLanguage, useTranslation, type Locale } from '@/lib/i18n';
export default function LanguageSwitcher() {
  useLanguage();
  const { t, i18n } = useTranslation();
  return (
    <label className="language-switcher">
      <Languages size={16} />
      <select
        aria-label={t('app.language')}
        value={i18n.language}
        onChange={(e) => setLanguage(e.target.value as Locale)}
      >
        <option value="zh-CN">{tx('legacy.m240')}</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
