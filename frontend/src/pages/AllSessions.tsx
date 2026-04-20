import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import SessionsTable from '@/components/SessionsTable'
import SessionDetailDrawer from '@/components/SessionDetailDrawer'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { sessionsApi } from '@/api/sessions'
import type { Session } from '@/types/api'

const PAGE_SIZE = 50

type StatusFilter = '' | 'ACTIVE' | 'PAID'

export default function AllSessions() {
  const [page, setPage] = useState(1)
  const [plateSearch, setPlateSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [detailSession, setDetailSession] = useState<Session | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['sessions', { page, plate: plateSearch, status: statusFilter }],
    queryFn: () =>
      sessionsApi.list({
        plate: plateSearch || undefined,
        status: statusFilter || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    placeholderData: (prev) => prev,
  })

  const handlePlateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlateSearch(e.target.value)
    setPage(1)
  }

  const handleStatusChange = (v: StatusFilter) => {
    setStatusFilter(v)
    setPage(1)
  }

  const clearFilters = () => {
    setPlateSearch('')
    setStatusFilter('')
    setPage(1)
  }

  const hasFilters = plateSearch !== '' || statusFilter !== ''

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Tüm Seanslar</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {data ? `${data.total} kayıt` : 'Yükleniyor…'}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-56">
          <Input
            placeholder="Plakaya göre ara…"
            value={plateSearch}
            onChange={handlePlateChange}
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-white h-9">
          {([['', 'Tümü'], ['ACTIVE', 'Aktif'], ['PAID', 'Ödendi']] as [StatusFilter, string][]).map(
            ([val, label]) => (
              <button
                key={val}
                onClick={() => handleStatusChange(val)}
                className={[
                  'px-3 h-full text-sm font-medium transition-colors border-r border-slate-200 last:border-0',
                  statusFilter === val
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                {label}
              </button>
            ),
          )}
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Temizle
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <SessionsTable
          sessions={data?.items ?? []}
          loading={isLoading}
          total={data?.total ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          onView={setDetailSession}
        />
      </div>

      <SessionDetailDrawer
        session={detailSession}
        onClose={() => setDetailSession(null)}
      />
    </div>
  )
}
