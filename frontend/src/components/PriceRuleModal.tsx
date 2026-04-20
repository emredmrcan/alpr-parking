import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import type { PriceRule } from '@/types/api'

const schema = z
  .object({
    duration_from_min: z.number({ invalid_type_error: 'Gerekli' }).min(0, 'En az 0 olmalı'),
    duration_to_min: z.number({ invalid_type_error: '' }).nullable().optional(),
    price: z.number({ invalid_type_error: 'Gerekli' }).min(0, 'Negatif olamaz'),
    label: z.string().optional(),
  })
  .refine(
    (d) =>
      d.duration_to_min == null ||
      d.duration_to_min > d.duration_from_min,
    { message: 'Bitiş, başlangıçtan büyük olmalı', path: ['duration_to_min'] },
  )

type FormData = z.infer<typeof schema>

interface Props {
  open: boolean
  onClose: () => void
  onSubmit: (data: { duration_from_min: number; duration_to_min: number | null; price: number; label: string | null }) => void
  loading?: boolean
  initial?: PriceRule | null
}

export default function PriceRuleModal({ open, onClose, onSubmit, loading, initial }: Props) {
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
      title={initial ? 'Tarife Kuralını Düzenle' : 'Tarife Kuralı Ekle'}
      width="max-w-sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            İptal
          </Button>
          <Button variant="primary" loading={loading} onClick={handleSubmit(submit)}>
            Kaydet
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        <Input
          label="Başlangıç Süresi (dk)"
          type="number"
          min="0"
          error={errors.duration_from_min?.message}
          {...register('duration_from_min', { valueAsNumber: true })}
        />
        <Input
          label="Bitiş Süresi (dk)"
          type="number"
          min="1"
          hint="Boş bırakın → sınırsız"
          error={errors.duration_to_min?.message}
          {...register('duration_to_min', {
            setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
          })}
        />
        <Input
          label="Ücret (₺)"
          type="number"
          step="0.01"
          min="0"
          error={errors.price?.message}
          {...register('price', { valueAsNumber: true })}
        />
        <Input
          label="Açıklama"
          type="text"
          placeholder="Örn: İlk 30 dakika"
          {...register('label')}
        />
      </form>
    </Modal>
  )
}
