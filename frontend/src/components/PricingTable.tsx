import { useState } from 'react'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import Button from '@/components/ui/Button'
import ConfirmPopover from '@/components/ConfirmPopover'
import { pricingApi } from '@/api/pricing'
import { formatMoney } from '@/utils/format'
import type { PriceRule } from '@/types/api'

interface Props {
  rules: PriceRule[]
  onEdit: (rule: PriceRule) => void
}

export default function PricingTable({ rules, onEdit }: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const { mutate: deleteRule, isPending: deleting } = useMutation({
    mutationFn: (id: number) => pricingApi.remove(id),
    onSuccess: () => {
      toast.success(t('pricingTable.deleted'))
      qc.invalidateQueries({ queryKey: ['pricing'] })
      setConfirmId(null)
    },
    onError: () => toast.error(t('pricingTable.deleteFailed')),
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {['pricingTable.colFrom', 'pricingTable.colTo', 'pricingTable.colPrice', 'pricingTable.colDescription', 'pricingTable.colActions'].map((h) => (
              <th
                key={h}
                className="text-left py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                {t(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-10 text-sm text-slate-400">
                {t('pricingTable.empty')}
              </td>
            </tr>
          ) : (
            rules.map((rule) => (
              <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 text-slate-900 font-medium">{rule.duration_from_min}</td>
                <td className="py-3 px-4 text-slate-700">
                  {rule.duration_to_min ?? <span className="text-slate-400">{t('pricingTable.unlimited')}</span>}
                </td>
                <td className="py-3 px-4 font-semibold text-slate-900">
                  {formatMoney(rule.price)}
                </td>
                <td className="py-3 px-4 text-slate-600">{rule.label ?? '—'}</td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeft={<Pencil size={13} />}
                      onClick={() => onEdit(rule)}
                    >
                      {t('common.edit')}
                    </Button>
                    <ConfirmPopover
                      open={confirmId === rule.id}
                      onConfirm={() => deleteRule(rule.id)}
                      onCancel={() => setConfirmId(null)}
                      message={t('pricingTable.confirmDelete')}
                      confirmLabel={t('common.delete')}
                      loading={deleting && deletingId === rule.id}
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Trash2 size={13} />}
                        onClick={() => {
                          setDeletingId(rule.id)
                          setConfirmId(rule.id)
                        }}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        {t('common.delete')}
                      </Button>
                    </ConfirmPopover>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
