import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import SessionsTable from '@/components/SessionsTable'
import SessionDetailDrawer from '@/components/SessionDetailDrawer'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { sessionsApi } from '@/api/sessions'
import type { Session } from '@/types/api'
import { userFacingApiDetail } from '@/utils/apiError'

const PAGE_SIZE = 50

type StatusFilter = '' | 'ACTIVE' | 'PAID'

export default function AllSessions() {
  const { t } = useTranslation()
  const qc = useQueryClient()
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

  const { mutate: deleteSession, isPending: deleting, variables: deletingId } = useMutation({
    mutationFn: (id: number) => sessionsApi.softDelete(id, { deleted_by: 'operator' }),
    onSuccess: (_, id) => {
      toast.success(t('sessions.deleted'))
      if (detailSession?.id === id) {
        setDetailSession(null)
      }
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
    onError: (err) => {
      toast.error(userFacingApiDetail(err) ?? t('sessions.deleteFailed'))
    },
  })

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">{t('sessions.title')}</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {data ? t('sessions.records', { count: data.total }) : t('common.loading')}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-56">
          <Input
            placeholder={t('sessions.searchPlate')}
            value={plateSearch}
            onChange={handlePlateChange}
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center border border-slate-200 rounded-md overflow-hidden bg-white h-9">
          {([['', t('sessions.all')], ['ACTIVE', t('status.active')], ['PAID', t('status.paid')]] as [StatusFilter, string][]).map(
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
            {t('sessions.clear')}
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
          onDelete={(session) => deleteSession(session.id)}
          deletingSessionId={deleting ? (deletingId ?? null) : null}
        />
      </div>

      <SessionDetailDrawer
        session={detailSession}
        onClose={() => setDetailSession(null)}
      />
    </div>
  )
}
