import { useState } from 'react'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
  const qc = useQueryClient()
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)

  const { mutate: deleteRule, isPending: deleting } = useMutation({
    mutationFn: (id: number) => pricingApi.remove(id),
    onSuccess: () => {
      toast.success('Tarife kuralı silindi.')
      qc.invalidateQueries({ queryKey: ['pricing'] })
      setConfirmId(null)
    },
    onError: () => toast.error('Silme işlemi başarısız.'),
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {['Başlangıç (dk)', 'Bitiş (dk)', 'Ücret (₺)', 'Açıklama', 'İşlem'].map((h) => (
              <th
                key={h}
                className="text-left py-2.5 px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rules.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center py-10 text-sm text-slate-400">
                Henüz tarife kuralı tanımlanmamış.
              </td>
            </tr>
          ) : (
            rules.map((rule) => (
              <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 text-slate-900 font-medium">{rule.duration_from_min}</td>
                <td className="py-3 px-4 text-slate-700">
                  {rule.duration_to_min ?? <span className="text-slate-400">Sınırsız</span>}
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
                      Düzenle
                    </Button>
                    <ConfirmPopover
                      open={confirmId === rule.id}
                      onConfirm={() => deleteRule(rule.id)}
                      onCancel={() => setConfirmId(null)}
                      message="Bu tarife kuralını silmek istediğinizden emin misiniz?"
                      confirmLabel="Sil"
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
                        Sil
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
