import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGS, currentLang } from '@/i18n'

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const active = currentLang()

  return (
    <div
      role="group"
      aria-label={t('language.label')}
      className="inline-flex rounded-md border border-slate-200 overflow-hidden text-xs font-semibold"
    >
      {SUPPORTED_LANGS.map((lng) => (
        <button
          key={lng}
          type="button"
          onClick={() => void i18n.changeLanguage(lng)}
          aria-pressed={active === lng}
          className={[
            'px-2.5 py-1 uppercase transition-colors',
            active === lng ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100',
          ].join(' ')}
        >
          {lng}
        </button>
      ))}
    </div>
  )
}
