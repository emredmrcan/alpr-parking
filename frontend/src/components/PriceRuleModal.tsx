import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import type { PriceRule } from '@/types/api'

const makeSchema = (t: TFunction) => z
  .object({
    duration_from_min: z.number({ invalid_type_error: t('priceRule.required') }).min(0, t('priceRule.min0')),
    duration_to_min: z.number({ invalid_type_error: '' }).nullable().optional(),
    price: z.number({ invalid_type_error: t('priceRule.required') }).min(0, t('priceRule.nonNegative')),
    label: z.string().optional(),
  })
  .refine(
    (d) =>
      d.duration_to_min == null ||
      d.duration_to_min > d.duration_from_min,
    { message: t('priceRule.endAfterStart'), path: ['duration_to_min'] },
  )

type FormData = z.infer<ReturnType<typeof makeSchema>>

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (data: { duration_from_min: number; duration_to_min: number | null; price: number; label: string | null }) => void
  loading?: boolean
  initial?: PriceRule | null
}

export default function PriceRuleModal({ open, onClose, onSubmit, loading, initial }: Props) {
  const { t } = useTranslation()
  const schema = useMemo(() => makeSchema(t), [t])
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      duration_from_min: 0,
      duration_to_min: undefined,
      price: 0,
      label: '',
    },
  })

  useEffect(() => {
    if (initial) {
      reset({
        duration_from_min: initial.duration_from_min,
        duration_to_min: initial.duration_to_min ?? undefined,
        price: parseFloat(initial.price),
        label: initial.label ?? '',
      })
    } else {
      reset({ duration_from_min: 0, duration_to_min: undefined, price: 0, label: '' })
    }
  }, [initial, open, reset])

  const submit = (data: FormData) => {
    onSubmit({
      duration_from_min: data.duration_from_min,
      duration_to_min: data.duration_to_min ?? null,
      price: data.price,
      label: data.label || null,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? t('priceRule.editTitle') : t('priceRule.addTitle')}
      width="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={loading} onClick={handleSubmit(submit)}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <Input
          label={t('priceRule.from')}
          type="number"
          min="0"
          error={errors.duration_from_min?.message}
          {...register('duration_from_min', { valueAsNumber: true })}
        />
        <Input
          label={t('priceRule.to')}
          type="number"
          min="1"
          hint={t('priceRule.toHint')}
          error={errors.duration_to_min?.message}
          {...register('duration_to_min', {
            setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
          })}
        />
        <Input
          label={t('priceRule.price')}
          type="number"
          step="0.01"
          min="0"
          error={errors.price?.message}
          {...register('price', { valueAsNumber: true })}
        />
        <Input
          label={t('priceRule.description')}
          type="text"
          placeholder={t('priceRule.placeholder')}
          {...register('label')}
        />
      </form>
    </Modal>
  )
}
