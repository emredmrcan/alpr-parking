import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enBundle from '@translations/en.json'
import trBundle from '@translations/tr.json'

const STORAGE_KEY = 'alpr_lang'
const DEFAULT_LANG = 'tr'

export function getSavedLang(): string {
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_LANG
}

export function initI18n(): void {
  const lang = getSavedLang()

  i18n.use(initReactI18next).init({
    lng: lang,
    fallbackLng: DEFAULT_LANG,
    resources: {
      tr: { translation: trBundle },
      en: { translation: enBundle },
    },
    interpolation: { escapeValue: false },
  })
}

export async function switchLanguage(lang: string): Promise<void> {
  await i18n.changeLanguage(lang)
  localStorage.setItem(STORAGE_KEY, lang)
  // Sync html[lang] attribute
  document.documentElement.lang = lang
}

export default i18n
