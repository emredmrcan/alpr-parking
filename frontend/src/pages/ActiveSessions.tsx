import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { PlusCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import ActiveSessionsTable from '@/components/ActiveSessionsTable'
import ExitModal from '@/components/ExitModal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { sessionsApi } from '@/api/sessions'
import { pricingApi } from '@/api/pricing'
import { usePricingStore } from '@/stores/pricingStore'
import type { Session } from '@/types/api'

export default function ActiveSessions() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [exitTarget, setExitTarget] = useState<Session | null>(null)
  const setRules = usePricingStore((s) => s.setRules)

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions', { status: 'ACTIVE' }],
    queryFn: () => sessionsApi.list({ status: 'ACTIVE', limit: 200 }),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  })

  const { data: pricing } = useQuery({
    queryKey: ['pricing'],
    queryFn: pricingApi.list,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (pricing) setRules(pricing)
  }, [pricing, setRules])

  const filtered = (sessions?.items ?? []).filter((s) =>
    search === '' || s.plate_number.includes(search.toUpperCase()),
  )

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('active.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('active.subtitle')}</p>
        </div>
        <Link to="/gate">
          <Button variant="primary" size="md" iconLeft={<PlusCircle size={15} />}>
            {t('active.manualEntry')}
          </Button>
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-64">
          <Input
            placeholder={t('sessions.searchPlate')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {sessions && (
          <span className="text-sm text-slate-500">
            {t('common.vehicleCount', { count: filtered.length })}
          </span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <ActiveSessionsTable
          sessions={filtered}
          loading={isLoading}
          onExit={setExitTarget}
        />
      </div>

      <ExitModal session={exitTarget} onClose={() => setExitTarget(null)} />
    </div>
  )
}
