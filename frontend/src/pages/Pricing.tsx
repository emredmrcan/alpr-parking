import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import PricingTable from '@/components/PricingTable'
import PriceRuleModal from '@/components/PriceRuleModal'
import Button from '@/components/ui/Button'
import { pricingApi } from '@/api/pricing'
import { usePricingStore } from '@/stores/pricingStore'
import type { PriceRule } from '@/types/api'

export default function Pricing() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const setRules = usePricingStore((s) => s.setRules)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PriceRule | null>(null)

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['pricing'],
    queryFn: pricingApi.list,
  })

  useEffect(() => {
    if (rules.length) setRules(rules)
  }, [rules, setRules])

  const { mutate: createRule, isPending: creating } = useMutation({
    mutationFn: pricingApi.create,
    onSuccess: () => {
      toast.success(t('pricing.added'))
      qc.invalidateQueries({ queryKey: ['pricing'] })
      setModalOpen(false)
    },
    onError: () => toast.error(t('pricing.addFailed')),
  })

  const { mutate: updateRule, isPending: updating } = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & ReturnType<typeof mapPayload>) =>
      pricingApi.update(id, data),
    onSuccess: () => {
      toast.success(t('pricing.updated'))
      qc.invalidateQueries({ queryKey: ['pricing'] })
      setEditTarget(null)
      setModalOpen(false)
    },
    onError: () => toast.error(t('pricing.updateFailed')),
  })

  function mapPayload(data: {
    duration_from_min: number
    duration_to_min: number | null
    price: number
    label: string | null
  }) {
    return { ...data }
  }

  const handleSubmit = (data: {
    duration_from_min: number
    duration_to_min: number | null
    price: number
    label: string | null
  }) => {
    if (editTarget) {
      updateRule({ id: editTarget.id, ...data })
    } else {
      createRule(data)
    }
  }

  const openAdd = () => { setEditTarget(null); setModalOpen(true) }
  const openEdit = (rule: PriceRule) => { setEditTarget(rule); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setEditTarget(null) }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{t('pricing.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {t('pricing.subtitle')}
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={15} />} onClick={openAdd}>
          {t('pricing.addRule')}
        </Button>
      </div>

      {/* Info banner */}
      <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-md text-sm text-blue-700">
        {t('pricing.info')}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : (
          <PricingTable rules={rules} onEdit={openEdit} />
        )}
      </div>

      <PriceRuleModal
        open={modalOpen}
        onClose={closeModal}
        onSubmit={handleSubmit}
        loading={creating || updating}
        initial={editTarget}
      />
    </div>
  )
}
