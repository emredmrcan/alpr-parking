import { useEffect, useState } from 'react'
import { Car } from 'lucide-react'
import { formatClientClock } from '@/utils/format'

function Clock() {
  const [time, setTime] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1_000)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="text-sm font-mono text-slate-600 tabular-nums">{formatClientClock(time)}</span>
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
    </header>
  )
}
