import { Eye, KeyRound } from 'lucide-react'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/StatusBadge'
import Spinner from '@/components/ui/Spinner'
import { formatDateTime, formatDuration, formatMoney } from '@/utils/format'
import type { Session } from '@/types/api'

interface Props {
  sessions: Session[]
  loading?: boolean
  total: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onView: (session: Session) => void
}

export default function SessionsTable({
  sessions,
  loading,
  total,
  page,
  pageSize,
  onPageChange,
  onView,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Spinner size={24} />
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {[
                'Plaka', 'Giriş', 'Çıkış', 'Süre',
                'Borç', 'Ödenen', 'Fark', 'Durum', '', 'İşlem'
              ].map((h) => (
                <th
                  key={h}
                  className="text-left py-2.5 px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-12 text-slate-400 text-sm">
                  Hiç seans bulunamadı.
                </td>
              </tr>
            ) : (
              sessions.map((s) => {
                const due = s.amount_due ? parseFloat(s.amount_due) : null
                const paid = s.amount_paid ? parseFloat(s.amount_paid) : null
                const diff = due != null && paid != null ? paid - due : null

                return (
                  <tr
                    key={s.id}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-3 px-3">
                      <span className="font-mono font-bold tracking-widest text-slate-900">
                        {s.plate_number}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                      {formatDateTime(s.entrance_time)}
                    </td>
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                      {s.exit_time ? formatDateTime(s.exit_time) : '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-700">
                      {s.duration_minutes != null ? formatDuration(s.duration_minutes) : '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-700">{formatMoney(s.amount_due)}</td>
                    <td className="py-3 px-3 font-medium text-slate-900">
                      {formatMoney(s.amount_paid)}
                    </td>
                    <td className="py-3 px-3">
                      {diff !== null && diff !== 0 ? (
                        <span className={`text-xs font-medium ${diff > 0 ? 'text-green-600' : 'text-amber-600'}`}>
                          {diff > 0 ? '+' : ''}{formatMoney(diff)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-3 px-3">
                      {s.entered_manually && (
                        <span title="Manuel giriş">
                          <KeyRound size={14} className="text-slate-400" />
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Eye size={13} />}
                        onClick={() => onView(s)}
                      >
                        Detay
                      </Button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between px-3 py-3 border-t border-slate-200">
          <span className="text-xs text-slate-500">
            {from}–{to} / {total} seans
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              ←
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
              return (
                <Button
                  key={p}
                  variant={p === page ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={() => onPageChange(p)}
                >
                  {p}
                </Button>
              )
            })}
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              →
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
