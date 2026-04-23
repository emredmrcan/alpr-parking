import React, { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CalendarPlus, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import AlertDialog from '@/components/ui/AlertDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { subscriptionsApi } from '@/api/subscriptions'
import type { Subscription, SubscriptionCreate, SubscriptionUpdate } from '@/types/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAN_OPTIONS = [
  { value: 'WEEKLY', label: 'Haftalık (7 gün)' },
  { value: 'MONTHLY', label: 'Aylık (1 takvim ayı)' },
  { value: 'YEARLY', label: 'Yıllık (1 takvim yılı)' },
] as const

type PlanType = 'WEEKLY' | 'MONTHLY' | 'YEARLY'
type StatusFilter = 'all' | 'active' | 'inactive'

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcEndDate(plan: PlanType, start: string): string {
  if (!start) return ''
  const d = new Date(start + 'T00:00:00')
  if (plan === 'WEEKLY') {
    d.setDate(d.getDate() + 7)
  } else if (plan === 'MONTHLY') {
    const month = d.getMonth()
    d.setMonth(month + 1)
    // clamp overflow (e.g. Jan 31 → Feb 28, not Mar 3)
    if (d.getMonth() !== (month + 1) % 12) d.setDate(0)
  } else {
    d.setFullYear(d.getFullYear() + 1)
  }
  return d.toISOString().split('T')[0]
}

function subStatus(s: Subscription): 'active' | 'expired' | 'deactivated' {
  const today = new Date().toISOString().split('T')[0]
  if (!s.is_active) return 'deactivated'
  if (s.end_date < today) return 'expired'
  return 'active'
}

const STATUS_LABEL: Record<ReturnType<typeof subStatus>, string> = {
  active: 'Aktif',
  expired: 'Süresi Dolmuş',
  deactivated: 'Devre Dışı',
}

const STATUS_CLASS: Record<ReturnType<typeof subStatus>, string> = {
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
  deactivated: 'bg-rose-50 text-rose-700 border-rose-200',
}

const PLAN_LABEL: Record<PlanType, string> = {
  WEEKLY: 'Haftalık',
  MONTHLY: 'Aylık',
  YEARLY: 'Yıllık',
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Subscriptions() {
  const qc = useQueryClient()
  const [plateFilter, setPlateFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Subscription | null>(null)
  const [renewTarget, setRenewTarget] = useState<Subscription | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null)

  const activeParam =
    statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined

  const { data: subs = [], isLoading } = useQuery({
    queryKey: ['subscriptions', plateFilter, statusFilter],
    queryFn: () =>
      subscriptionsApi.list({
        plate: plateFilter || undefined,
        active: activeParam,
      }),
  })

  const { mutate: removeSub, isPending: removing, variables: removingId } = useMutation({
    mutationFn: subscriptionsApi.remove,
    onSuccess: () => {
      toast.success('Abonelik silindi.')
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
    },
    onError: () => toast.error('Silinemedi.'),
  })

  const openAdd = () => {
    setEditTarget(null)
    setRenewTarget(null)
    setModalOpen(true)
  }

  const openEdit = (s: Subscription) => {
    setEditTarget(s)
    setRenewTarget(null)
    setModalOpen(true)
  }

  const openRenew = (s: Subscription) => {
    setEditTarget(null)
    setRenewTarget(s)
    setModalOpen(true)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <BadgeCheck size={20} className="text-emerald-600" />
            Abonelikler
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Abonelerin plaka numaraları sisteme kayıtlıdır. Plaka kameradan okunduğunda bariyer
            otomatik açılır ve seans <strong>₺0,00</strong> olarak kaydedilir.
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={16} />} onClick={openAdd}>
          Yeni Abonelik
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <Input
          placeholder="Plakaya göre ara…"
          value={plateFilter}
          onChange={(e) => setPlateFilter(e.target.value.toUpperCase())}
          className="w-56"
        />
        <div className="flex rounded-md border border-slate-200 overflow-hidden text-sm">
          {(['all', 'active', 'inactive'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={[
                'px-3 py-1.5 font-medium transition-colors',
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {s === 'all' ? 'Tümü' : s === 'active' ? 'Aktif' : 'Aktif Değil'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Yükleniyor…</p>
      ) : subs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <BadgeCheck size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-700 font-medium">Abonelik bulunamadı</p>
          <p className="text-sm text-slate-500 mt-1">
            "Yeni Abonelik" ile ilk aboneliği ekleyin.
          </p>
          <Button className="mt-4" variant="primary" onClick={openAdd}>
            İlk aboneliği ekle
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Plaka</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Plan</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Başlangıç</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Bitiş</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-700">Durum</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-700">İşlemler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {subs.map((s) => {
                const status = subStatus(s)
                return (
                  <tr key={s.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900 tracking-wider">
                      {s.plate_number}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {PLAN_LABEL[s.plan_type as PlanType] ?? s.plan_type}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{s.start_date}</td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">{s.end_date}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_CLASS[status]}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Yenile"
                          onClick={() => openRenew(s)}
                          className="p-1.5 rounded text-slate-500 hover:text-emerald-700 hover:bg-emerald-50"
                        >
                          <RefreshCw size={14} />
                        </button>
                        <button
                          type="button"
                          title="Düzenle"
                          onClick={() => openEdit(s)}
                          className="p-1.5 rounded text-slate-500 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          title="Sil"
                          onClick={() => setDeleteTarget(s)}
                          disabled={removing && removingId === s.id}
                          className="p-1.5 rounded text-slate-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-40"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      <SubscriptionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editTarget={editTarget}
        renewTarget={renewTarget}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['subscriptions'] })
          setModalOpen(false)
        }}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        title="Aboneliği sil"
        description={
          deleteTarget
            ? `"${deleteTarget.plate_number}" plakasına ait ${PLAN_LABEL[deleteTarget.plan_type as PlanType] ?? deleteTarget.plan_type} aboneliği kalıcı olarak silinecek. Geçmiş kayıtlar korunur.`
            : ''
        }
        confirmLabel="Evet, sil"
        cancelLabel="İptal"
        confirming={removing}
        onConfirm={() => {
          if (!deleteTarget) return
          removeSub(deleteTarget.id, { onSettled: () => setDeleteTarget(null) })
        }}
      />
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function SubscriptionModal({
  open,
  onClose,
  editTarget,
  renewTarget,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editTarget: Subscription | null
  renewTarget: Subscription | null
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const isEdit = Boolean(editTarget)
  const isRenew = Boolean(renewTarget) && !editTarget

  const source = editTarget ?? renewTarget

  const [plate, setPlate] = useState('')
  const [plan, setPlan] = useState<PlanType>('MONTHLY')
  const [startDate, setStartDate] = useState('')
  const [notes, setNotes] = useState('')
  const [isActive, setIsActive] = useState(true)

  const endDate = calcEndDate(plan, startDate)

  useEffect(() => {
    if (!open) return
    if (source) {
      setPlate(source.plate_number)
      setPlan(source.plan_type as PlanType)
      setNotes(source.notes ?? '')
      if (isRenew) {
        // New subscription starts the day after the current end date
        const d = new Date(source.end_date + 'T00:00:00')
        d.setDate(d.getDate() + 1)
        setStartDate(d.toISOString().split('T')[0])
        setIsActive(true)
      } else {
        setStartDate(source.start_date)
        setIsActive(source.is_active)
      }
    } else {
      setPlate('')
      setPlan('MONTHLY')
      setStartDate(new Date().toISOString().split('T')[0])
      setNotes('')
      setIsActive(true)
    }
  }, [open, source, isRenew])

  const { mutate: save, isPending } = useMutation({
    mutationFn: async () => {
      const trimmedPlate = plate.trim().toUpperCase()
      if (!trimmedPlate) throw new Error('Plaka gerekli.')
      if (!startDate) throw new Error('Başlangıç tarihi gerekli.')

      if (isEdit && editTarget) {
        const body: SubscriptionUpdate = {
          plan_type: plan,
          start_date: startDate,
          is_active: isActive,
          notes: notes.trim() || null,
        }
        return subscriptionsApi.update(editTarget.id, body)
      }

      const body: SubscriptionCreate = {
        plate_number: trimmedPlate,
        plan_type: plan,
        start_date: startDate,
        notes: notes.trim() || null,
      }
      return subscriptionsApi.create(body)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Abonelik güncellendi.' : isRenew ? 'Abonelik yenilendi.' : 'Abonelik eklendi.')
      qc.invalidateQueries({ queryKey: ['subscriptions'] })
      onSaved()
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? err?.message ?? 'Bilinmeyen hata.'
      toast.error(detail)
    },
  })

  const title = isEdit ? 'Aboneliği Düzenle' : isRenew ? 'Aboneliği Yenile' : 'Yeni Abonelik'

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
      <Button variant="primary" loading={isPending} onClick={() => save()}>
        {isEdit ? 'Güncelle' : isRenew ? 'Yenile' : 'Kaydet'}
      </Button>
    </>
  )

  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md" footer={footer}>
      <div className="space-y-4">
        {/* Plate */}
        <Input
          label="Plaka Numarası"
          value={plate}
          onChange={(e) => setPlate(e.target.value.toUpperCase())}
          placeholder="34ABC1234"
          disabled={isEdit || isRenew}
          hint={isEdit || isRenew ? 'Plaka değiştirilemez. Yeni bir abonelik oluşturun.' : 'Tam plaka numarasını girin.'}
        />

        {/* Plan */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Plan Türü</label>
          <div className="grid grid-cols-3 gap-2">
            {PLAN_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setPlan(o.value)}
                className={[
                  'rounded-lg border py-2.5 text-sm font-medium transition-colors',
                  plan === o.value
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                ].join(' ')}
              >
                {o.value === 'WEEKLY' ? 'Haftalık' : o.value === 'MONTHLY' ? 'Aylık' : 'Yıllık'}
              </button>
            ))}
          </div>
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Başlangıç Tarihi</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Bitiş Tarihi</label>
            <input
              type="date"
              value={endDate}
              readOnly
              className="w-full h-9 rounded-md border border-slate-100 bg-slate-50 px-3 text-sm text-slate-500 cursor-not-allowed"
            />
            <p className="text-xs text-slate-400">Otomatik hesaplanır</p>
          </div>
        </div>

        {/* Notes */}
        <Input
          label="Notlar (isteğe bağlı)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Örn: Şirket aracı — ABC A.Ş."
        />

        {/* Active toggle (edit only) */}
        {isEdit && (
          <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-300"
            />
            <span>Aktif (işareti kaldırarak erken iptal edebilirsiniz)</span>
          </label>
        )}

        {/* Renew notice */}
        {isRenew && renewTarget && (
          <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
            <span className="font-semibold">Yenileme: </span>
            Mevcut abonelik ({renewTarget.end_date}) sonrasındaki günden başlanarak yeni bir
            kayıt oluşturulacak. Eski kayıt geçmiş olarak korunur.
          </div>
        )}
      </div>
    </Modal>
  )
}
