import { useEffect, useState } from 'react'
import { Car, Globe } from 'lucide-react'
import { switchLanguage, getSavedLang } from '@/i18n'

function Clock() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1_000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="text-sm font-mono text-slate-600 tabular-nums">
      {time.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })}
    </span>
  )
}

function LanguageSwitcher() {
  const [lang, setLang] = useState(getSavedLang)
  const [open, setOpen] = useState(false)

  const toggle = async (l: string) => {
    await switchLanguage(l)
    setLang(l)
    setOpen(false)
    // Reload to re-render all strings
    window.location.reload()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
      >
        <Globe size={14} />
        {lang.toUpperCase()}
        <span className="text-slate-400 text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded-md shadow-md overflow-hidden min-w-[80px]">
          {['tr', 'en'].map((l) => (
            <button
              key={l}
              onClick={() => toggle(l)}
              className={[
                'w-full text-left px-3 py-2 text-sm transition-colors',
                lang === l
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              {l === 'tr' ? 'Türkçe' : 'English'}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TopNav() {
  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center px-5 gap-4">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center">
          <Car size={15} className="text-white" />
        </div>
        <span className="text-base font-semibold text-slate-900">ALPR Otopark</span>
      </div>

      <div className="flex-1" />

      <Clock />
      <LanguageSwitcher />
    </header>
  )
}
