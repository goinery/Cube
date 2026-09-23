import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import en from './en.json';
import zh from './zh-CN.json';

export type Locale = 'zh-CN' | 'en';
function preferredLanguage(): Locale {
  try {
    const saved = localStorage.getItem('axis-language');
    if (saved === 'zh-CN' || saved === 'en') return saved;
  } catch {
    /* Preferences are optional in restricted storage contexts. */
  }
  return typeof navigator !== 'undefined' && /^en\b/i.test(navigator.language)
    ? 'en'
    : 'zh-CN';
}
void i18n
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, 'zh-CN': { translation: zh } },
    lng: preferredLanguage(),
    fallbackLng: 'zh-CN',
    interpolation: { escapeValue: false },
    initAsync: false,
  });
export function setLanguage(locale: Locale) {
  void i18n.changeLanguage(locale);
  try {
    localStorage.setItem('axis-language', locale);
  } catch {}
}
i18n.on('languageChanged', (locale) => {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
});
if (typeof document !== 'undefined')
  document.documentElement.lang = i18n.language;
export const t = (key: string, params?: Record<string, unknown>): string =>
  i18n.t(key, params) as string;
export const tx = t;
export function useLanguage() {
  useTranslation();
}
/** Module-level menus keep their numeric and icon data while labels follow the locale. */
export function localized<T extends object>(create: () => T): T {
  let language = i18n.language,
    value = create();
  const read = () => {
    if (language !== i18n.language) {
      language = i18n.language;
      value = create();
    }
    return value;
  };
  return new Proxy(value, {
    get: (_, key) => Reflect.get(read(), key),
    ownKeys: () => Reflect.ownKeys(read()),
    getOwnPropertyDescriptor: (_, key) =>
      Reflect.getOwnPropertyDescriptor(read(), key),
  });
}
export { i18n, useTranslation };
