import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import en from './locales/en.json'
import tr from './locales/tr.json'

export const SUPPORTED_LANGS = ['en', 'tr'] as const
export type Lang = (typeof SUPPORTED_LANGS)[number]
export const DEFAULT_LANG: Lang = 'en'
export const LANG_STORAGE_KEY = 'alpr-lang'

/** BCP-47 locale used for Intl formatting per UI language. */
export const INTL_LOCALE: Record<Lang, string> = { en: 'en-GB', tr: 'tr-TR' }

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, tr: { translation: tr } },
    supportedLngs: SUPPORTED_LANGS as unknown as string[],
    fallbackLng: DEFAULT_LANG,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANG_STORAGE_KEY,
      caches: ['localStorage'],
    },
  })

export function currentLang(): Lang {
  const l = (i18n.resolvedLanguage ?? i18n.language ?? DEFAULT_LANG).slice(0, 2)
  return (SUPPORTED_LANGS as readonly string[]).includes(l) ? (l as Lang) : DEFAULT_LANG
}

export function intlLocale(): string {
  return INTL_LOCALE[currentLang()]
}

i18n.on('languageChanged', () => {
  document.documentElement.lang = currentLang()
})
document.documentElement.lang = currentLang()

export default i18n
