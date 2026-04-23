import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Textarea from '@/components/ui/Textarea'
import ImageDropzone from '@/components/ImageDropzone'
import { sessionsApi } from '@/api/sessions'
import { recognizeApi } from '@/api/recognize'
import { formatTime, formatMoney, getDurationMinutes } from '@/utils/format'
import { userFacingApiDetail } from '@/utils/apiError'
import { usePricingStore } from '@/stores/pricingStore'
import type { Session } from '@/types/api'

const schema = z.object({
  amount_paid: z.number({ invalid_type_error: 'Geçerli bir tutar girin' }).min(0),
  notes: z.string().optional(),
})

type FormData = z.infer<typeof schema>

interface ExitModalProps {
  session: Session | null
  onClose: () => void
}

export default function ExitModal({ session, onClose }: ExitModalProps) {
  const qc = useQueryClient()
  const computeFee = usePricingStore((s) => s.computeFee)

  const [exitPreview, setExitPreview] = useState<string | null>(null)
  const [exitImagePath, setExitImagePath] = useState<string | null>(null)
  const [uploadingExit, setUploadingExit] = useState(false)

  const duration = session ? getDurationMinutes(session.entrance_time) : 0
  const calculatedFee = computeFee(duration)

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: { amount_paid: calculatedFee, notes: '' },
    })

  const amountPaid = watch('amount_paid')
  const diff = typeof amountPaid === 'number' ? amountPaid - calculatedFee : 0

  useEffect(() => {
    if (session) {
      const fee = computeFee(getDurationMinutes(session.entrance_time))
      setValue('amount_paid', fee)
      reset({ amount_paid: fee, notes: '' })
      setExitPreview(null)
      setExitImagePath(null)
    }
  }, [session, computeFee, setValue, reset])

  const { mutate: confirmExit, isPending } = useMutation({
    mutationFn: (data: FormData) =>
      sessionsApi.confirmExit(session!.id, {
        amount_paid: data.amount_paid,
        exit_image_path: exitImagePath,
        notes: data.notes || null,
      }),
    onSuccess: ({ session: updated }) => {
      toast.success(`Seans kapatıldı — ${formatMoney(updated.amount_paid)} tahsil edildi`)
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      onClose()
    },
    onError: (err: unknown) => {
      toast.error(userFacingApiDetail(err) ?? 'Çıkış işlemi tamamlanamadı.')
    },
  })

  const handleExitImage = async (file: File) => {
    const url = URL.createObjectURL(file)
    setExitPreview(url)
    setUploadingExit(true)
    try {
      const result = await recognizeApi.upload(file)
      if (result.image_path) setExitImagePath(result.image_path)
    } catch {
      // image saved locally anyway
    } finally {
      setUploadingExit(false)
    }
  }

  if (!session) return null

  return (
    <Modal
      open={!!session}
      onClose={onClose}
      title="Çıkış İşlemi"
      width="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            loading={isPending}
            onClick={handleSubmit((d) => confirmExit(d))}
          >
            ÇIKIŞI ONAYLA
          </Button>
        </>
      }
    >
      {/* Session info */}
      <div className="bg-slate-50 rounded-md p-4 mb-5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Plaka</span>
          <span className="font-bold font-mono tracking-widest text-slate-900">
            {session.plate_number}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-500">Giriş</span>
          <span className="text-slate-700">
            {formatTime(session.entrance_time)} —{' '}
            {duration < 1 ? 'az önce giriş yaptı' : `${duration} dk önce`}
          </span>
        </div>
        <div className="flex justify-between text-sm border-t border-slate-200 pt-2 mt-2">
          <span className="text-slate-500">Hesaplanan ücret</span>
          <span className="font-semibold text-slate-900 text-base">
            {formatMoney(calculatedFee)}
          </span>
        </div>
      </div>

      <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
        {/* Amount collected */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">
            Tahsil Edilen (₺)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            {...register('amount_paid', { valueAsNumber: true })}
            className="h-11 rounded-md border border-slate-200 px-3 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600"
          />
          {errors.amount_paid && (
            <p className="text-xs text-red-600">{errors.amount_paid.message}</p>
          )}
          {typeof amountPaid === 'number' && diff !== 0 && (
            <p className={`text-xs font-medium ${diff > 0 ? 'text-green-600' : 'text-amber-600'}`}>
              Fark: {diff > 0 ? '+' : ''}{formatMoney(diff)}
            </p>
          )}
          <p className="text-xs text-slate-400">Sürücünün ödediği farklıysa değiştirin</p>
        </div>

        {/* Exit image */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">
            Çıkış Fotoğrafı <span className="text-slate-400 font-normal">(isteğe bağlı)</span>
          </label>
          <ImageDropzone
            onFile={handleExitImage}
            loading={uploadingExit}
            preview={exitPreview}
            onClear={() => { setExitPreview(null); setExitImagePath(null) }}
            height="h-32"
          />
        </div>

        {/* Notes */}
        <Textarea
          label="Notlar (isteğe bağlı)"
          placeholder="Varsa özel durumu belirtin"
          {...register('notes')}
        />
      </form>
    </Modal>
  )
}
