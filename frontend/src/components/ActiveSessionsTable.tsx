import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { formatTime, formatDuration, formatMoney, getDurationMinutes } from '@/utils/format'
import { usePricingStore } from '@/stores/pricingStore'
import type { Session } from '@/types/api'

interface Props {
  sessions: Session[]
  loading?: boolean
  onExit: (session: Session) => void
  compact?: boolean
}

export default function ActiveSessionsTable({ sessions, loading, onExit, compact }: Props) {
  const computeFee = usePricingStore((s) => s.computeFee)
  const [, tick] = useState(0)

  // Re-render every 60 s for live duration/fee
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Spinner size={24} />
      </div>
    )
  }

  if (!sessions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
        <p className="text-sm">Park halinde aktif araç yok.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Plaka</th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Giriş</th>
            <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Süre</th>
            {!compact && (
              <th className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Ücret</th>
            )}
            <th className="py-2.5 px-3" />
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const mins = getDurationMinutes(s.entrance_time)
            const fee = computeFee(mins)
            return (
              <tr key={s.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="py-3 px-3">
                  <span className="font-mono font-bold tracking-widest text-slate-900">
                    {s.plate_number}
                  </span>
                </td>
                <td className="py-3 px-3 text-slate-600">{formatTime(s.entrance_time)}</td>
                <td className="py-3 px-3 text-slate-700 font-medium">{formatDuration(mins)}</td>
                {!compact && (
                  <td className="py-3 px-3 font-semibold text-slate-900">{formatMoney(fee)}</td>
                )}
                <td className="py-3 px-3 text-right">
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<LogOut size={13} />}
                    onClick={() => onExit(s)}
                  >
                    Çıkış
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
