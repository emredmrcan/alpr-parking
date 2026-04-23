import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Car, ListChecks, TrendingUp, Clock } from 'lucide-react'
import StatCard from '@/components/StatCard'
import ActiveSessionsTable from '@/components/ActiveSessionsTable'
import ExitModal from '@/components/ExitModal'
import Spinner from '@/components/ui/Spinner'
import { sessionsApi } from '@/api/sessions'
import { pricingApi } from '@/api/pricing'
import { usePricingStore } from '@/stores/pricingStore'
import { formatMoney, formatDuration, formatRecordedDuration, formatStatMinutes, formatTime } from '@/utils/format'
import type { Session } from '@/types/api'
import { useEffect } from 'react'

export default function Dashboard() {
  const [exitTarget, setExitTarget] = useState<Session | null>(null)
  const setRules = usePricingStore((s) => s.setRules)

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: sessionsApi.todayStats,
    refetchInterval: 30_000,
  })

  const { data: activeSessions, isLoading: activeLoading } = useQuery({
    queryKey: ['sessions', { status: 'ACTIVE' }],
    queryFn: () => sessionsApi.list({ status: 'ACTIVE', limit: 50 }),
    refetchInterval: 60_000,
  })

  const { data: recentPaid } = useQuery({
    queryKey: ['sessions', { status: 'PAID', limit: 10 }],
    queryFn: () => sessionsApi.list({ status: 'PAID', limit: 10 }),
    refetchInterval: 30_000,
  })

  const { data: pricing } = useQuery({
    queryKey: ['pricing'],
    queryFn: pricingApi.list,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (pricing) setRules(pricing)
  }, [pricing, setRules])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Genel Bakış</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {new Date().toLocaleDateString('tr-TR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Şu An Aktif"
          value={statsLoading ? <Spinner size={20} className="text-blue-600" /> : stats?.active_count ?? 0}
          icon={<Car size={18} />}
          sub="Park halindeki araç"
        />
        <StatCard
          label="Bugün Toplam"
          value={statsLoading ? <Spinner size={20} className="text-blue-600" /> : stats?.total_today ?? 0}
          icon={<ListChecks size={18} />}
          sub="Giriş yapan araç"
        />
        <StatCard
          label="Bugün Gelir"
          value={statsLoading
            ? <Spinner size={20} className="text-blue-600" />
            : formatMoney(stats?.revenue_today ?? 0)
          }
          icon={<TrendingUp size={18} />}
          sub="Tahsil edilen toplam"
        />
        <StatCard
          label="Ort. Park Süresi"
          value={
            statsLoading
              ? <Spinner size={20} className="text-blue-600" />
              : stats?.avg_duration_minutes != null
              ? formatStatMinutes(stats.avg_duration_minutes)
              : '—'
          }
          icon={<Clock size={18} />}
          sub="Bugün tamamlanan seanslar"
        />
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-[1fr_380px] gap-4 items-start">
        {/* Active sessions */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Aktif Seanslar</h2>
            {activeSessions && (
              <span className="text-xs text-slate-500">
                {activeSessions.total} araç
              </span>
            )}
          </div>
          <ActiveSessionsTable
            sessions={activeSessions?.items ?? []}
            loading={activeLoading}
            onExit={setExitTarget}
          />
        </div>

        {/* Recent paid */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">Son Tamamlanan</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {recentPaid?.items.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">Henüz tamamlanan seans yok.</p>
            )}
            {recentPaid?.items.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-mono font-bold tracking-widest text-slate-900">
                    {s.plate_number}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {formatRecordedDuration(s.duration_minutes, s.entrance_time, s.exit_time)}
                  </p>
                </div>
                <span className="text-sm font-semibold text-green-600">
                  {formatMoney(s.amount_paid)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ExitModal session={exitTarget} onClose={() => setExitTarget(null)} />
    </div>
  )
}
