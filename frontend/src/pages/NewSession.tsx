import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, ArrowRight, RotateCcw } from 'lucide-react'
import Button from '@/components/ui/Button'
import PlateInput from '@/components/PlateInput'
import ImageDropzone from '@/components/ImageDropzone'
import { recognizeApi } from '@/api/recognize'
import { sessionsApi } from '@/api/sessions'
import { validateTrPlate, formatTime } from '@/utils/format'
import type { RecognitionResult, PriceSummary } from '@/types/api'
import { useNavigate } from 'react-router-dom'

type Step = 'upload' | 'confirm' | 'success'

export default function NewSession() {
  const qc = useQueryClient()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('upload')
  const [manualMode, setManualMode] = useState(false)
  const [plate, setPlate] = useState('')
  const [ocrResult, setOcrResult] = useState<RecognitionResult | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [recognising, setRecognising] = useState(false)
  const [noPlate, setNoPlate] = useState(false)
  const [duplicate, setDuplicate] = useState<PriceSummary | null>(null)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced duplicate check
  useEffect(() => {
    if (plate.length < 5) { setDuplicate(null); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const summary = await sessionsApi.getByPlate(plate)
        setDuplicate(summary)
      } catch {
        setDuplicate(null)
      }
    }, 600)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [plate])

  const handleFile = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file)
    setPreview(url)
    setRecognising(true)
    setNoPlate(false)
    setOcrResult(null)
    try {
      const result = await recognizeApi.upload(file)
      setOcrResult(result)
      if (result.best) {
        setPlate(result.best.plate)
        setStep('confirm')
      } else {
        setNoPlate(true)
        setStep('confirm')
      }
    } catch {
      setNoPlate(true)
      setStep('confirm')
      toast.error('Görüntü işlenirken hata oluştu.')
    } finally {
      setRecognising(false)
    }
  }, [])

  const { mutate: createSession, isPending } = useMutation({
    mutationFn: () =>
      sessionsApi.create({
        plate_number: plate,
        raw_ocr_text: ocrResult?.best?.raw_ocr ?? null,
        entered_manually: manualMode || !ocrResult?.best,
        image_path: ocrResult?.image_path ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
      qc.invalidateQueries({ queryKey: ['stats'] })
      setStep('success')
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? ''
      if (err?.response?.status === 409) {
        setDuplicateError(detail)
      } else {
        toast.error(detail || 'Seans oluşturulamadı.')
      }
    },
  })

  const reset = () => {
    setStep('upload')
    setManualMode(false)
    setPlate('')
    setOcrResult(null)
    setPreview(null)
    setRecognising(false)
    setNoPlate(false)
    setDuplicate(null)
    setDuplicateError(null)
  }

  const { isValid } = validateTrPlate(plate)
  const canConfirm = plate.length >= 5

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="bg-white border border-slate-200 rounded-lg p-10 flex flex-col items-center gap-5 max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
            <CheckCircle2 size={36} className="text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Seans oluşturuldu</h2>
            <p className="text-sm text-slate-500 mt-1">
              <span className="font-mono font-bold tracking-widest text-slate-800">{plate}</span>{' '}
              plakalı araç içeri girdi.
            </p>
          </div>
          <div className="flex gap-3 w-full">
            <Button variant="secondary" className="flex-1" onClick={reset}>
              <RotateCcw size={14} className="mr-1.5" />
              Yeni Seans
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => navigate('/active')}>
              Aktif Araçlar
              <ArrowRight size={14} className="ml-1.5" />
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Yeni Seans</h1>
        <p className="text-sm text-slate-500 mt-0.5">Araç girişini kaydetmek için görüntü yükleyin veya plakayı girin.</p>
      </div>

      {/* Manual mode toggle */}
      <div className="flex items-center gap-2 mb-5">
        <button
          onClick={() => { setManualMode((v) => !v); if (!manualMode) setStep('confirm') }}
          className={[
            'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent',
            'transition-colors duration-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600',
            manualMode ? 'bg-blue-600' : 'bg-slate-200',
          ].join(' ')}
          role="switch"
          aria-checked={manualMode}
        >
          <span
            className={[
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm',
              'transition-transform duration-200',
              manualMode ? 'translate-x-4' : 'translate-x-0',
            ].join(' ')}
          />
        </button>
        <span className="text-sm text-slate-600">Manuel giriş (kamera olmadan)</span>
      </div>

      <div className="space-y-4">
        {/* Step 1: Upload */}
        {!manualMode && (
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0">1</span>
                Görüntü Yükle
              </h2>
            </div>
            <div className="p-5">
              <ImageDropzone
                onFile={handleFile}
                loading={recognising}
                preview={preview}
                onClear={() => {
                  setPreview(null)
                  setOcrResult(null)
                  setPlate('')
                  setNoPlate(false)
                  setStep('upload')
                }}
                height="h-44"
              />
              {noPlate && (
                <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>Plaka tespit edilemedi — aşağıya manuel olarak girin</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Step 2: Confirm */}
        {(step === 'confirm' || manualMode) && (
          <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-bold shrink-0">
                  {manualMode ? '1' : '2'}
                </span>
                Plakayı Onayla
              </h2>
            </div>
            <div className="p-5 space-y-4">
              <PlateInput
                value={plate}
                onChange={setPlate}
                confidence={ocrResult?.best?.confidence}
                autoFocus={manualMode || noPlate}
              />

              {/* Duplicate warning */}
              {duplicate && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <div>
                    Bu plakaya ait{' '}
                    <strong>{formatTime(duplicate.entrance_time)}</strong> saatinden itibaren aktif seans
                    mevcut.{' '}
                    <button
                      className="underline font-medium"
                      onClick={() => navigate('/active')}
                    >
                      Çıkış işlemi yapmak ister misiniz?
                    </button>
                  </div>
                </div>
              )}

              {/* API conflict error */}
              {duplicateError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  <span>{duplicateError}</span>
                </div>
              )}

              <Button
                variant="primary"
                size="lg"
                className="w-full text-base font-semibold"
                disabled={!canConfirm || isPending}
                loading={isPending}
                onClick={() => createSession()}
              >
                GİRİŞİ ONAYLA
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
