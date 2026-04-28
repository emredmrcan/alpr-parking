import { useState, useMemo, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import {
  MonitorPlay,
  Camera,
  CameraOff,
  Loader2,
  LogIn,
  LogOut,
  AlertTriangle,
  BadgeCheck,
  X,
  LockOpen,
  Lock,
  ChevronRight,
  DoorOpen,
  PlusCircle,
} from 'lucide-react'
import { candidateApi } from '@/api/candidate'
import { gatesApi } from '@/api/gates'
import { sessionsApi } from '@/api/sessions'
import { formatMoney, formatDuration, validateTrPlate, parseServerInstant } from '@/utils/format'
import { userFacingApiDetail } from '@/utils/apiError'
import type { GateCandidate, ParkingGate, PriceSummary } from '@/types/api'

// ── Constants & types ──────────────────────────────────────────────────────────

const TOO_EARLY_THRESHOLD_SEC = 30
const TOO_EARLY_AUTO_CLEAR_MS = 6_000
const SUBSCRIBER_AUTO_CLEAR_MS = 8_000
const BARRIER_OPEN_DISPLAY_SEC = 10
const BARRIER_CLOSED_DISPLAY_MS = 2_500

type GateMode = 'waiting' | 'looking_up' | 'entrance' | 'too_early' | 'exit' | 'subscriber'
type BarrierPhase = 'idle' | 'open' | 'closed'
type GateBarrierState = { phase: BarrierPhase; countdown: number; error: string | null }

function playSubscriberBeep(): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.6)
  } catch {
    // Audio context not available — silently ignore
  }
}

// ── Main page ──────────────────────────────────────────────────────────────────
// Simplified: just renders a GateStation for every gate simultaneously.
// No "selected gate" concept — the operator sees all cameras at once.

export default function GateView() {
  const { data: gates = [], isLoading } = useQuery({
    queryKey: ['gates'],
    queryFn: gatesApi.list,
  })

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    )
  }

  if (!gates.length) {
    return (
      <div className="p-6 max-w-lg mx-auto space-y-4 text-center">
        <MonitorPlay size={40} className="mx-auto text-slate-300" />
        <h1 className="text-lg font-bold text-slate-900">Kapı tanımlı değil</h1>
        <p className="text-sm text-slate-600">
          Önce <strong>Kapı ayarları</strong> sayfasından en az bir kamera + bariyer çifti
          ekleyin. Ardından kamera döngüsünü (
          <code className="text-xs bg-slate-100 px-1 rounded">python camera_loop.py</code>
          ) başlatın.
        </p>
        <Link
          to="/gates"
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Kapı ayarlarına git <ChevronRight size={14} />
        </Link>
      </div>
    )
  }

  // ≤2 gates → side-by-side on large screens, stacked on small (both always visible)
  // 3+ gates → compact cards in a responsive grid
  const compact = gates.length > 2

  const gridCls = compact
    ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'
    : gates.length === 1
    ? 'grid grid-cols-1 max-w-2xl'
    : 'grid grid-cols-1 lg:grid-cols-2 gap-3'

  return (
    <div className="p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <MonitorPlay size={18} className="text-slate-500 shrink-0" />
        <h1 className="text-base font-bold text-slate-900">Bariyer Ekranı</h1>
        <span className="text-xs text-slate-400 ml-auto">
          {gates.length} kapı · Plaka algılandığında kartlar otomatik güncellenir
        </span>
      </div>

      {/* All gates — always visible simultaneously */}
      <div className={gridCls}>
        {gates.map((gate) => (
          <GateStation key={gate.id} gate={gate} compact={compact} />
        ))}
      </div>
    </div>
  )
}

// ── Self-contained gate station ────────────────────────────────────────────────
// Owns ALL state and mutations for a single gate. Renders either a full or
// compact layout depending on how many gates are configured.

function GateStation({ gate, compact }: { gate: ParkingGate; compact: boolean }) {
  const qc = useQueryClient()
  const [amountPaid, setAmountPaid] = useState('')

  // ── Barrier lifecycle ────────────────────────────────────────────────────────
  const [barrier, setBarrier] = useState<GateBarrierState>({
    phase: 'idle',
    countdown: 0,
    error: null,
  })
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const closedRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const patchBarrier = useCallback(
    (next: Partial<GateBarrierState>) => setBarrier((p) => ({ ...p, ...next })),
    [],
  )

  const startBarrierSequence = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    if (closedRef.current) clearTimeout(closedRef.current)
    patchBarrier({ phase: 'open', countdown: BARRIER_OPEN_DISPLAY_SEC, error: null })
    let rem = BARRIER_OPEN_DISPLAY_SEC
    tickRef.current = setInterval(() => {
      rem -= 1
      patchBarrier({ countdown: rem })
      if (rem <= 0) {
        if (tickRef.current) clearInterval(tickRef.current)
        tickRef.current = null
        patchBarrier({ phase: 'closed', countdown: 0 })
        closedRef.current = setTimeout(
          () => patchBarrier({ phase: 'idle' }),
          BARRIER_CLOSED_DISPLAY_MS,
        )
      }
    }, 1_000)
  }, [patchBarrier])

  useEffect(
    () => () => {
      if (tickRef.current) clearInterval(tickRef.current)
      if (closedRef.current) clearTimeout(closedRef.current)
    },
    [],
  )

  // ── Candidate polling (1 s) ──────────────────────────────────────────────────
  const { data: candidate } = useQuery<GateCandidate | null>({
    queryKey: ['gate-candidate', gate.id],
    queryFn: () => candidateApi.get(gate.id),
    refetchInterval: 1_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  })

  // Tick so that too_early → exit transition happens on time
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  // ── Session lookup ───────────────────────────────────────────────────────────
  const { data: activeSession, isLoading: sessionLoading } = useQuery<PriceSummary | null>({
    queryKey: ['gate-session', candidate?.plate],
    queryFn: async () => {
      if (!candidate) return null
      try {
        return await sessionsApi.getByPlate(candidate.plate)
      } catch (err: any) {
        if (err?.response?.status === 404) return null
        throw err
      }
    },
    enabled: !!candidate,
    staleTime: 0,
    retry: false,
  })

  // ── Gate mode ────────────────────────────────────────────────────────────────
  const gateMode = useMemo<GateMode>(() => {
    if (!candidate) return 'waiting'
    if (candidate.is_subscriber) return 'subscriber'
    if (sessionLoading) return 'looking_up'
    if (!activeSession) return 'entrance'
    const elapsed =
      (Date.now() - parseServerInstant(activeSession.entrance_time).getTime()) / 1_000
    return elapsed < TOO_EARLY_THRESHOLD_SEC ? 'too_early' : 'exit'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate, activeSession, sessionLoading, tick])

  // Pre-fill payment amount when session arrives
  useEffect(() => {
    if (activeSession) setAmountPaid(parseFloat(String(activeSession.amount_due)).toString())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.session_id])

  // ── Query invalidation helper ────────────────────────────────────────────────
  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['gate-candidate', gate.id] })
    qc.invalidateQueries({ queryKey: ['gate-session'] })
    qc.invalidateQueries({ queryKey: ['sessions'] })
  }, [qc, gate.id])

  // ── Mutations ────────────────────────────────────────────────────────────────
  const clearCandidate = useMutation({
    mutationFn: () => candidateApi.clear(gate.id),
    onSuccess: () => {
      invalidateAll()
      patchBarrier({ error: null })
    },
  })

  const confirmEntrance = useMutation({
    mutationFn: async () => {
      if (!candidate) throw new Error('No candidate')
      const res = await sessionsApi.create({
        plate_number: candidate.plate,
        raw_ocr_text: candidate.raw_ocr,
        entered_manually: false,
        gate_id: gate.id,
        trigger_barrier: true,
      })
      await candidateApi.clear(gate.id)
      return res
    },
    onSuccess: (res) => {
      invalidateAll()
      if (res.barrier?.triggered) {
        startBarrierSequence()
      } else {
        const n = res.barrier?.notes ? ` (${res.barrier.notes})` : ''
        patchBarrier({
          error: `Giriş kaydedildi fakat bariyer açılamadı${n}. Manuel açış gerekli.`,
        })
        toast.error('Giriş kaydedildi, bariyer açılamadı. Manuel açış gerekli olabilir.')
      }
    },
    onError: (err: unknown) =>
      toast.error(userFacingApiDetail(err) ?? 'Giriş işlemi tamamlanamadı.'),
  })

  const confirmExit = useMutation({
    mutationFn: async () => {
      if (!activeSession) throw new Error('No active session')
      const res = await sessionsApi.confirmExit(activeSession.session_id, {
        amount_paid: parseFloat(amountPaid) || 0,
        gate_id: gate.id,
        trigger_barrier: true,
      })
      await candidateApi.clear(gate.id)
      return res
    },
    onSuccess: (res) => {
      invalidateAll()
      setAmountPaid('')
      if (res.barrier?.triggered) {
        startBarrierSequence()
      } else {
        const n = res.barrier?.notes ? ` (${res.barrier.notes})` : ''
        patchBarrier({
          error: `Çıkış kaydedildi fakat bariyer açılamadı${n}. Manuel açış gerekli.`,
        })
        toast.error('Çıkış kaydedildi, bariyer açılamadı. Manuel açış gerekli olabilir.')
      }
    },
    onError: (err: unknown) =>
      toast.error(userFacingApiDetail(err) ?? 'Çıkış işlemi tamamlanamadı.'),
  })

  const manualBarrier = useMutation({
    mutationFn: () => gatesApi.testBarrier(gate.id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success('Bariyer komutu gönderildi.')
        startBarrierSequence()
      } else {
        toast.error(res.notes || 'Bariyer yanıt vermedi.')
      }
    },
    onError: () => toast.error('Bariyer açılamadı.'),
  })

  const manualEntrance = useMutation({
    mutationFn: async (plate: string) => {
      const { clean, isValid } = validateTrPlate(plate)
      if (!isValid) throw new Error('INVALID_PLATE')
      try {
        const summary = await sessionsApi.getByPlate(clean)
        const paid = summary.is_subscribed ? 0 : parseFloat(String(summary.amount_due))
        const res = await sessionsApi.confirmExit(summary.session_id, {
          amount_paid: Number.isFinite(paid) ? paid : 0,
          gate_id: gate.id,
          trigger_barrier: true,
        })
        return { flow: 'exit' as const, result: res }
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 404) {
          const res = await sessionsApi.create({
            plate_number: clean,
            raw_ocr_text: clean,
            entered_manually: true,
            gate_id: gate.id,
            trigger_barrier: true,
          })
          return { flow: 'entry' as const, result: res }
        }
        throw e
      }
    },
    onSuccess: ({ flow, result }) => {
      invalidateAll()
      if (result.barrier?.triggered) {
        startBarrierSequence()
        toast.success(
          flow === 'exit'
            ? 'Manuel çıkış kaydedildi; bariyer açıldı.'
            : 'Manuel giriş kaydedildi; bariyer açıldı.',
        )
      } else {
        const n = result.barrier?.notes ? ` (${result.barrier.notes})` : ''
        const pfx =
          flow === 'exit'
            ? 'Çıkış kaydedildi fakat bariyer açılamadı'
            : 'Giriş kaydedildi fakat bariyer açılamadı'
        patchBarrier({ error: `${pfx}${n}. «Bariyeri manuel aç» kullanın.` })
        toast.error(
          flow === 'exit'
            ? 'Çıkış kaydedildi; bariyer açılamadı.'
            : 'Giriş kaydedildi; bariyer açılamadı.',
        )
      }
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === 'INVALID_PLATE') {
        toast.error('Geçersiz plaka formatı.')
        return
      }
      toast.error(userFacingApiDetail(err) ?? 'İşlem tamamlanamadı.')
    },
  })

  // ── Auto-clears ──────────────────────────────────────────────────────────────
  const autoClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (gateMode !== 'too_early') return
    autoClearRef.current = setTimeout(() => clearCandidate.mutate(), TOO_EARLY_AUTO_CLEAR_MS)
    return () => {
      if (autoClearRef.current) clearTimeout(autoClearRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateMode, candidate?.plate])

  const subscriberClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (gateMode !== 'subscriber') return
    playSubscriberBeep()
    subscriberClearRef.current = setTimeout(
      () => clearCandidate.mutate(),
      SUBSCRIBER_AUTO_CLEAR_MS,
    )
    return () => {
      if (subscriberClearRef.current) clearTimeout(subscriberClearRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateMode, candidate?.plate])

  // ── Derived values ───────────────────────────────────────────────────────────
  const barrierLocked = barrier.phase !== 'idle'

  const handleCorrectPlate = useCallback(
    async (plate: string): Promise<void> => {
      await manualEntrance.mutateAsync(plate)
    },
    [manualEntrance],
  )

  // Station accent classes — change border + header colour based on mode
  const accentBorder =
    gateMode === 'entrance'
      ? 'border-emerald-400'
      : gateMode === 'exit'
      ? 'border-indigo-400'
      : gateMode === 'too_early'
      ? 'border-amber-400'
      : gateMode === 'subscriber'
      ? 'border-green-500'
      : 'border-slate-200'

  const accentHeader =
    gateMode === 'entrance'
      ? 'bg-emerald-50 border-emerald-200'
      : gateMode === 'exit'
      ? 'bg-indigo-50 border-indigo-200'
      : gateMode === 'too_early'
      ? 'bg-amber-50 border-amber-200'
      : gateMode === 'subscriber'
      ? 'bg-green-50 border-green-200'
      : 'bg-slate-50 border-slate-200'

  const liveDot =
    gateMode === 'waiting' || gateMode === 'looking_up'
      ? 'bg-slate-400'
      : 'bg-green-500 animate-pulse'

  // ── Compact render (3+ gates) ────────────────────────────────────────────────
  if (compact) {
    return (
      <div
        className={`rounded-2xl border-2 overflow-hidden shadow-sm bg-white transition-colors ${accentBorder}`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-3 py-2 border-b ${accentHeader}`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${liveDot}`} />
            <span className="text-sm font-bold text-slate-900 truncate">{gate.label}</span>
            <span className="text-xs text-slate-400 font-mono shrink-0">#{gate.id}</span>
          </div>
          <StatusPill mode={gateMode} />
        </div>

        {/* Camera — compact */}
        <CameraFeed gate={gate} compact />

        {/* Barrier phase strip */}
        {barrier.phase !== 'idle' && (
          <BarrierPhaseBar phase={barrier.phase} countdown={barrier.countdown} compact />
        )}

        {/* Error */}
        {barrier.error && (
          <div className="mx-3 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
            ⚠ {barrier.error}
          </div>
        )}

        {/* Body */}
        <div className="px-3 py-3 space-y-3">
          {/* State-specific plate / info */}
          {gateMode === 'waiting' && (
            <div className="py-2 text-center">
              <Camera size={24} className="mx-auto text-slate-300 mb-1" />
              <p className="text-sm text-slate-400 italic">Araç bekleniyor…</p>
            </div>
          )}
          {gateMode === 'looking_up' && candidate && (
            <div className="flex items-center gap-2 py-2">
              <Loader2 size={14} className="animate-spin text-slate-400" />
              <span className="text-sm text-slate-500">Sorgulanıyor…</span>
              <span className="font-mono font-bold text-slate-800 ml-auto">{candidate.plate}</span>
            </div>
          )}
          {candidate && gateMode !== 'waiting' && gateMode !== 'looking_up' && (
            <div>
              <p className="font-mono font-black text-2xl tracking-[0.15em] text-slate-900 leading-none">
                {candidate.plate}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <ConfidenceBadge pct={Math.round(candidate.confidence * 100)} />
                <span className="text-xs text-slate-400">
                  {formatDetectedAt(candidate.detected_at)}
                </span>
              </div>
              {candidate.raw_ocr !== candidate.plate && (
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Ham: {candidate.raw_ocr}
                </p>
              )}
            </div>
          )}

          {/* Exit: session summary */}
          {gateMode === 'exit' && activeSession && (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-indigo-50 rounded-lg border border-indigo-200 px-2 py-1.5 text-center">
                <p className="text-xs text-indigo-500">Süre</p>
                <p className="text-sm font-bold text-indigo-800">
                  {formatDuration(activeSession.duration_minutes)}
                </p>
              </div>
              <div className="bg-indigo-50 rounded-lg border border-indigo-200 px-2 py-1.5 text-center">
                <p className="text-xs text-indigo-500">Ücret</p>
                <p className="text-sm font-bold text-indigo-800">
                  {formatMoney(activeSession.amount_due)}
                </p>
              </div>
            </div>
          )}

          {/* Exit: payment input */}
          {gateMode === 'exit' && (
            <input
              type="number"
              min="0"
              step="1"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="Alınan ücret (₺)"
              className="w-full border border-indigo-300 rounded-lg px-3 py-2 text-sm font-mono text-center font-bold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
          )}

          {/* Subscriber note */}
          {gateMode === 'subscriber' && candidate?.subscription && (
            <div className="bg-green-50 rounded-lg border border-green-200 px-2.5 py-2">
              <p className="text-xs font-semibold text-green-800">
                ✓ Abone — {candidate.subscription.days_remaining} gün kaldı
              </p>
            </div>
          )}

          {/* Too early warning */}
          {gateMode === 'too_early' && activeSession && (
            <div className="bg-amber-50 rounded-lg border border-amber-200 px-2.5 py-2">
              <p className="text-xs font-semibold text-amber-800">
                ⚠{' '}
                {Math.round(
                  (Date.now() -
                    parseServerInstant(activeSession.entrance_time).getTime()) /
                    1_000,
                )}{' '}
                sn önce giriş yaptı
              </p>
            </div>
          )}

          {/* Primary confirm button */}
          {(gateMode === 'entrance' || gateMode === 'exit') && (
            <button
              type="button"
              onClick={() =>
                gateMode === 'entrance' ? confirmEntrance.mutate() : confirmExit.mutate()
              }
              disabled={
                (gateMode === 'entrance'
                  ? confirmEntrance.isPending
                  : confirmExit.isPending) ||
                barrierLocked ||
                (gateMode === 'exit' && !amountPaid)
              }
              className={[
                'w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2',
                'transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
                gateMode === 'entrance'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white',
              ].join(' ')}
            >
              {(gateMode === 'entrance'
                ? confirmEntrance.isPending
                : confirmExit.isPending) ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Kaydediliyor…
                </>
              ) : barrierLocked ? (
                <>
                  <Lock size={15} /> Bariyer Açık — Bekle
                </>
              ) : gateMode === 'entrance' ? (
                <>
                  <LogIn size={15} /> Giriş + Bariyer
                </>
              ) : (
                <>
                  <LogOut size={15} /> Ödeme + Bariyer
                </>
              )}
            </button>
          )}

          {/* Dismiss for subscriber / too_early */}
          {(gateMode === 'subscriber' || gateMode === 'too_early') && (
            <button
              type="button"
              onClick={() => clearCandidate.mutate()}
              className="w-full py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center gap-1.5"
            >
              <X size={14} /> Sıfırla
            </button>
          )}

          {/* Dismiss for entrance / exit */}
          {(gateMode === 'entrance' || gateMode === 'exit') && (
            <button
              type="button"
              onClick={() => clearCandidate.mutate()}
              className="w-full py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-1"
            >
              <X size={12} /> İptal / Sıfırla
            </button>
          )}

          {/* Inline plate correction (when a wrong plate was detected) */}
          {(gateMode === 'entrance' || gateMode === 'exit') && (
            <CorrectionForm
              onSubmit={handleCorrectPlate}
              loading={manualEntrance.isPending}
              compact
            />
          )}

          {/* Manual barrier / entry panel (always available) */}
          <ManualEntryPanel
            onManualBarrier={() => manualBarrier.mutate()}
            onManualEntrance={handleCorrectPlate}
            barrierLocked={barrierLocked}
            manualBarrierPending={manualBarrier.isPending}
            manualEntrancePending={manualEntrance.isPending}
          />
        </div>
      </div>
    )
  }

  // ── Full render (tab layout — natural height, parent scrolls) ───────────────
  return (
    <div className="bg-white">
      {/* Camera feed */}
      <CameraFeed gate={gate} />

      {/* Barrier phase (only when open/closing) */}
      {barrier.phase !== 'idle' && (
        <div className="px-4 pt-3">
          <BarrierPhaseBar phase={barrier.phase} countdown={barrier.countdown} />
        </div>
      )}

      {/* Error banner */}
      {barrier.error && (
        <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          ⚠ {barrier.error}
        </div>
      )}

      {/* ── Action content ── */}
      <div className="p-4 space-y-3">

        {/* Status row — always visible */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${liveDot}`} />
            <span className="text-sm font-semibold text-slate-700 truncate">
              {gateMode === 'waiting'    && 'Araç bekleniyor…'}
              {gateMode === 'looking_up' && 'Sorgulanıyor…'}
              {gateMode === 'entrance'   && 'Yeni giriş tespit edildi'}
              {gateMode === 'exit'       && 'Çıkış tespit edildi'}
              {gateMode === 'too_early'  && 'Uyarı — çok erken'}
              {gateMode === 'subscriber' && 'Abone araç'}
            </span>
          </div>
          <StatusPill mode={gateMode} />
        </div>

        {/* Plate query spinner — inline, no big box */}
        {gateMode === 'looking_up' && candidate && (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
            <Loader2 size={16} className="animate-spin text-slate-400 shrink-0" />
            <span className="font-mono font-bold text-xl tracking-wider text-slate-800">
              {candidate.plate}
            </span>
          </div>
        )}

        {/* Active state cards */}
        {gateMode === 'subscriber' && (
          <SubscriberCard
            candidate={candidate!}
            onDismiss={() => clearCandidate.mutate()}
          />
        )}
        {gateMode === 'entrance' && (
          <EntranceCard
            candidate={candidate!}
            loading={confirmEntrance.isPending}
            barrierLocked={barrierLocked}
            onConfirm={() => confirmEntrance.mutate()}
            onDismiss={() => clearCandidate.mutate()}
            onCorrectPlate={handleCorrectPlate}
            correctionPending={manualEntrance.isPending}
          />
        )}
        {gateMode === 'too_early' && (
          <TooEarlyCard
            candidate={candidate!}
            session={activeSession!}
            onDismiss={() => clearCandidate.mutate()}
          />
        )}
        {gateMode === 'exit' && (
          <ExitCard
            candidate={candidate!}
            session={activeSession!}
            amountPaid={amountPaid}
            onAmountChange={setAmountPaid}
            loading={confirmExit.isPending}
            barrierLocked={barrierLocked}
            onConfirm={() => confirmExit.mutate()}
            onDismiss={() => clearCandidate.mutate()}
            onCorrectPlate={handleCorrectPlate}
            correctionPending={manualEntrance.isPending}
          />
        )}

        {/* Manual controls — always visible, form expands into scrollable area */}
        <ManualEntryPanel
          onManualBarrier={() => manualBarrier.mutate()}
          onManualEntrance={handleCorrectPlate}
          barrierLocked={barrierLocked}
          manualBarrierPending={manualBarrier.isPending}
          manualEntrancePending={manualEntrance.isPending}
        />
      </div>
    </div>
  )
}

// ── Manual entry / barrier panel ───────────────────────────────────────────────

function ManualEntryPanel({
  onManualBarrier,
  onManualEntrance,
  barrierLocked,
  manualBarrierPending,
  manualEntrancePending,
}: {
  onManualBarrier: () => void
  onManualEntrance: (plate: string) => Promise<void>
  barrierLocked: boolean
  manualBarrierPending: boolean
  manualEntrancePending: boolean
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [plate, setPlate] = useState('')
  const { clean, isValid } = validateTrPlate(plate)

  return (
    <div className="border-t border-slate-200 pt-3 space-y-1.5">
      <button
        type="button"
        onClick={onManualBarrier}
        disabled={manualBarrierPending}
        className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold uppercase tracking-wide bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300/80 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {manualBarrierPending ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <DoorOpen size={13} />
        )}
        Bariyeri Manuel Aç
      </button>

      <button
        type="button"
        onClick={() => {
          setFormOpen((o) => !o)
          if (formOpen) setPlate('')
        }}
        className="w-full flex items-center justify-center gap-2 rounded-lg py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-600 border border-slate-300 transition-colors"
      >
        <PlusCircle size={13} />
        {formOpen ? 'Manuel girişi kapat' : 'Plakayı manuel gir'}
      </button>

      {formOpen && (
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2">
          <input
            type="text"
            value={plate}
            onChange={(e) =>
              setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
            }
            placeholder="34ABC123"
            className="w-full rounded-md border border-slate-300 px-2.5 py-2 text-sm font-mono tracking-wide outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                await onManualEntrance(clean)
                setFormOpen(false)
                setPlate('')
              } catch {
                // Errors surfaced via toast
              }
            }}
            disabled={!isValid || manualEntrancePending || barrierLocked}
            className="w-full rounded-md bg-slate-800 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {manualEntrancePending ? 'Kaydediliyor…' : 'Manuel Giriş + Bariyer Aç'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Camera feed ────────────────────────────────────────────────────────────────

function CameraFeed({ gate, compact = false }: { gate: ParkingGate; compact?: boolean }) {
  const [visible, setVisible] = useState(true)
  const [streamError, setStreamError] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  const streamUrl = `/api/gates/${gate.id}/camera-stream`

  const handleRetry = () => {
    setStreamError(false)
    setRetryKey((k) => k + 1)
  }

  // ── Compact variant ────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="bg-slate-900">
        {streamError ? (
          <div className="flex flex-col items-center justify-center gap-2 py-5 px-4 text-center min-h-[96px]">
            <CameraOff size={20} className="text-slate-600" />
            <p className="text-xs text-slate-500">Kamera açılamadı</p>
            <button
              type="button"
              onClick={handleRetry}
              className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              Tekrar dene
            </button>
          </div>
        ) : (
          <img
            key={retryKey}
            src={streamUrl}
            alt="Canlı kamera"
            className="w-full object-contain max-h-[148px]"
            onError={() => setStreamError(true)}
          />
        )}
      </div>
    )
  }

  // ── Full variant ───────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-900">
      {/* Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800">
        <div className="flex items-center gap-2">
          {visible && !streamError && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          )}
          <Camera size={13} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
            Canlı Kamera
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setVisible((v) => !v)
            if (!visible) handleRetry()
          }}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          {visible ? (
            <>
              <CameraOff size={12} /> Gizle
            </>
          ) : (
            <>
              <Camera size={12} /> Göster
            </>
          )}
        </button>
      </div>

      {visible && (
        <>
          <div className="relative bg-black min-h-[100px] flex items-center justify-center">
            {streamError ? (
              <div className="flex flex-col items-center gap-2 py-5 px-4 text-center">
                <CameraOff size={24} className="text-slate-600" />
                <p className="text-sm font-medium text-slate-400">Kamera akışı açılamadı</p>
                <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                  USB kameralar kamera döngüsü tarafından kullanılıyor olabilir. RTSP / IP
                  kameralar eş zamanlı bağlantıyı destekler.
                </p>
                <button
                  type="button"
                  onClick={handleRetry}
                  className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  Tekrar dene
                </button>
              </div>
            ) : (
              <img
                key={retryKey}
                src={streamUrl}
                alt="Canlı kamera görüntüsü"
                className="w-full max-h-48 object-contain"
                onError={() => setStreamError(true)}
              />
            )}
          </div>
          {!streamError && (
            <div className="px-3 py-1.5 bg-slate-800/60 border-t border-slate-700">
              <p className="text-xs text-slate-500">
                Plaka yanlışsa{' '}
                <strong className="text-slate-400">Plakayı Düzelt</strong> bölümünü kullanın
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Plate correction form ──────────────────────────────────────────────────────

function CorrectionForm({
  onSubmit,
  loading,
  compact = false,
}: {
  onSubmit: (plate: string) => Promise<void>
  loading: boolean
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [plate, setPlate] = useState('')
  const { clean, isValid } = validateTrPlate(plate)

  const handleClose = () => {
    setOpen(false)
    setPlate('')
  }

  return (
    <div className={compact ? '' : 'w-full border-t border-dashed border-slate-200 pt-4'}>
      <button
        type="button"
        onClick={() => (open ? handleClose() : setOpen(true))}
        className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors py-1"
      >
        <AlertTriangle size={11} />
        {open ? 'Düzeltmeyi kapat' : 'Plaka yanlış mı? Düzelt ve bariyeri aç'}
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <p className="text-xs text-slate-500 text-center leading-relaxed">
            Doğru plakayı girin. Giriş/çıkış otomatik belirlenir ve bariyer açılır.
          </p>
          <input
            type="text"
            value={plate}
            onChange={(e) =>
              setPlate(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
            }
            placeholder="34ABC123"
            autoFocus
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono tracking-wide outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={async () => {
              try {
                await onSubmit(clean)
                handleClose()
              } catch {
                // Errors surfaced via toast in parent mutation
              }
            }}
            disabled={!isValid || loading}
            className="w-full py-2 rounded-lg bg-slate-800 text-white text-xs font-bold hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" /> Kaydediliyor…
              </>
            ) : (
              'Doğru Plakayı İşle + Bariyer Aç'
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Format helper ──────────────────────────────────────────────────────────────

function formatDetectedAt(value: string) {
  const dt = parseServerInstant(value)
  if (Number.isNaN(dt.getTime())) return 'az önce'
  const diffSec = Math.max(0, Math.round((Date.now() - dt.getTime()) / 1_000))
  if (diffSec < 5) return 'az önce'
  if (diffSec < 60) return `${diffSec} sn önce`
  const min = Math.round(diffSec / 60)
  if (min < 60) return `${min} dk önce`
  return `${Math.round(min / 60)} sa önce`
}

// ── Status pill ────────────────────────────────────────────────────────────────

function StatusPill({ mode }: { mode: GateMode }) {
  const config: Record<GateMode, { label: string; dot: string; text: string }> = {
    waiting:    { label: 'Bekliyor',     dot: 'bg-slate-400',                text: 'text-slate-500' },
    looking_up: { label: 'Sorgulanıyor', dot: 'bg-amber-400 animate-pulse',  text: 'text-amber-600' },
    entrance:   { label: 'Giriş',        dot: 'bg-emerald-500 animate-pulse',text: 'text-emerald-700' },
    too_early:  { label: 'Uyarı',        dot: 'bg-amber-400 animate-pulse',  text: 'text-amber-600' },
    exit:       { label: 'Çıkış',        dot: 'bg-indigo-500 animate-pulse', text: 'text-indigo-700' },
    subscriber: { label: 'Abone',        dot: 'bg-green-500 animate-pulse',  text: 'text-green-700' },
  }
  const { label, dot, text } = config[mode]
  return (
    <div className={`flex items-center gap-1.5 text-xs font-semibold ${text}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </div>
  )
}

// ── Barrier phase banner ───────────────────────────────────────────────────────

function BarrierPhaseBar({
  phase,
  countdown,
  compact = false,
}: {
  phase: BarrierPhase
  countdown: number
  compact?: boolean
}) {
  if (phase === 'idle') return null
  const isOpen = phase === 'open'
  const progress = isOpen ? (countdown / BARRIER_OPEN_DISPLAY_SEC) * 100 : 0

  if (compact) {
    return (
      <div
        className={`flex items-center justify-between px-3 py-1.5 border-b ${
          isOpen
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-slate-100 border-slate-200'
        }`}
      >
        <div className="flex items-center gap-1.5">
          {isOpen ? (
            <LockOpen size={12} className="text-emerald-600" />
          ) : (
            <Lock size={12} className="text-slate-500" />
          )}
          <span className={`text-xs font-bold ${isOpen ? 'text-emerald-700' : 'text-slate-600'}`}>
            {isOpen ? 'Bariyer Açıldı' : 'Bariyer Kapandı'}
          </span>
        </div>
        {isOpen && (
          <span className="text-xs font-mono font-semibold text-emerald-600">{countdown}s</span>
        )}
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl border-2 px-4 py-3 ${
        isOpen ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-slate-100'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isOpen ? (
            <LockOpen size={16} className="text-emerald-600" />
          ) : (
            <Lock size={16} className="text-slate-500" />
          )}
          <span className={`text-sm font-bold ${isOpen ? 'text-emerald-700' : 'text-slate-600'}`}>
            {isOpen ? 'Bariyer Açıldı' : 'Bariyer Kapandı'}
          </span>
        </div>
        {isOpen && (
          <span className="text-xs font-mono font-semibold text-emerald-600">{countdown} sn</span>
        )}
      </div>
      {isOpen && (
        <>
          <div className="w-full bg-emerald-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-emerald-600 mt-1.5">
            Araç geçişi bekleniyor — yeni işlem kilitli
          </p>
        </>
      )}
    </div>
  )
}

// ── Card components ────────────────────────────────────────────────────────────

function WaitingCard({ barrierPhase }: { barrierPhase?: BarrierPhase }) {
  const isLocked = barrierPhase && barrierPhase !== 'idle'
  return (
    <div
      className={[
        'border-2 rounded-xl flex flex-col items-center justify-center py-5 px-4 gap-2',
        isLocked ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white border-slate-200',
      ].join(' ')}
    >
      <Camera size={28} className={isLocked ? 'text-emerald-300' : 'text-slate-300'} />
      <p className={`text-sm font-medium ${isLocked ? 'text-emerald-600' : 'text-slate-500'}`}>
        {isLocked ? 'Araç geçiyor…' : 'Araç bekleniyor…'}
      </p>
      <p className="text-slate-400 text-xs text-center max-w-xs">
        {isLocked
          ? 'Bariyer açık. Araç geçişi tamamlandıktan sonra yeni plaka işlenecek.'
          : 'Kamera aktif. Plaka algılandığında bu kart otomatik güncellenir.'}
      </p>
    </div>
  )
}

function LookingUpCard({ candidate }: { candidate: GateCandidate }) {
  return (
    <div className="bg-white border-2 border-slate-200 rounded-xl flex flex-col items-center justify-center py-5 px-4 gap-2">
      <Loader2 size={24} className="text-slate-400 animate-spin" />
      <p className="text-slate-500 text-sm font-medium">Plaka sorgulanıyor…</p>
      <p className="font-mono font-bold text-2xl tracking-widest text-slate-800">
        {candidate.plate}
      </p>
    </div>
  )
}

function EntranceCard({
  candidate,
  loading,
  barrierLocked,
  onConfirm,
  onDismiss,
  onCorrectPlate,
  correctionPending,
}: {
  candidate: GateCandidate
  loading: boolean
  barrierLocked: boolean
  onConfirm: () => void
  onDismiss: () => void
  onCorrectPlate: (plate: string) => Promise<void>
  correctionPending?: boolean
}) {
  return (
    <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl flex flex-col items-center py-4 px-4 gap-3 shadow-sm">
      <div className="flex items-center justify-between w-full">
        <Badge icon={<LogIn size={13} />} label="YENİ GİRİŞ" color="emerald" />
        <ConfidenceBadge pct={Math.round(candidate.confidence * 100)} />
      </div>
      <PlateDisplay plate={candidate.plate} rawOcr={candidate.raw_ocr} dark={false} />
      <button
        onClick={onConfirm}
        disabled={loading || barrierLocked}
        className="w-full py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Kaydediliyor…
          </>
        ) : barrierLocked ? (
          <>
            <Lock size={16} /> Bariyer Açık — Bekleniyor…
          </>
        ) : (
          <>
            <LogIn size={16} /> Giriş Kaydet &amp; Bariyeri Aç
          </>
        )}
      </button>
      <CorrectionForm onSubmit={onCorrectPlate} loading={!!correctionPending} />
      <DismissButton onClick={onDismiss} />
    </div>
  )
}

function TooEarlyCard({
  candidate,
  session,
  onDismiss,
}: {
  candidate: GateCandidate
  session: PriceSummary
  onDismiss: () => void
}) {
  const [remaining, setRemaining] = useState(Math.ceil(TOO_EARLY_AUTO_CLEAR_MS / 1_000))
  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1_000)
    return () => clearInterval(id)
  }, [])
  const entranceSec = Math.round(
    (Date.now() - parseServerInstant(session.entrance_time).getTime()) / 1_000,
  )
  return (
    <div className="bg-amber-50 border-2 border-amber-400 rounded-xl flex flex-col items-center py-4 px-4 gap-3 shadow-sm">
      <Badge icon={<AlertTriangle size={13} />} label="UYARI" color="amber" />
      <PlateDisplay plate={candidate.plate} rawOcr={candidate.raw_ocr} dark={false} />
      <div className="bg-amber-100 border border-amber-300 rounded-xl px-4 py-2.5 text-center w-full">
        <p className="text-amber-800 font-semibold text-sm">
          Bu araç {entranceSec} saniye önce giriş yaptı
        </p>
        <p className="text-amber-600 text-xs mt-0.5">
          Otomatik temizlenecek — {remaining} saniye
        </p>
      </div>
      <DismissButton onClick={onDismiss} label="Şimdi Temizle" />
    </div>
  )
}

function ExitCard({
  candidate,
  session,
  amountPaid,
  onAmountChange,
  loading,
  barrierLocked,
  onConfirm,
  onDismiss,
  onCorrectPlate,
  correctionPending,
}: {
  candidate: GateCandidate
  session: PriceSummary
  amountPaid: string
  onAmountChange: (v: string) => void
  loading: boolean
  barrierLocked: boolean
  onConfirm: () => void
  onDismiss: () => void
  onCorrectPlate: (plate: string) => Promise<void>
  correctionPending?: boolean
}) {
  return (
    <div className="bg-indigo-50 border-2 border-indigo-400 rounded-xl flex flex-col items-center py-4 px-4 gap-3 shadow-sm">
      <div className="flex items-center justify-between w-full">
        <Badge icon={<LogOut size={13} />} label="ÇIKIŞ" color="indigo" />
        <ConfidenceBadge pct={Math.round(candidate.confidence * 100)} />
      </div>
      <PlateDisplay plate={candidate.plate} rawOcr={candidate.raw_ocr} dark={false} />
      <div className="w-full grid grid-cols-2 gap-2">
        <InfoBox label="Park Süresi" value={formatDuration(session.duration_minutes)} />
        <InfoBox label="Hesaplanan Ücret" value={formatMoney(session.amount_due)} accent />
      </div>
      <div className="w-full">
        <label className="block text-indigo-700 text-xs font-semibold mb-1 tracking-wide uppercase">
          Alınan Ücret (₺)
        </label>
        <input
          type="number"
          min="0"
          step="1"
          value={amountPaid}
          onChange={(e) => onAmountChange(e.target.value)}
          className="w-full bg-white border-2 border-indigo-300 text-slate-900 text-xl font-bold text-center font-mono rounded-xl px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 placeholder-slate-300"
          placeholder="0"
        />
      </div>
      <button
        onClick={onConfirm}
        disabled={loading || !amountPaid || barrierLocked}
        className="w-full py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Kaydediliyor…
          </>
        ) : barrierLocked ? (
          <>
            <Lock size={16} /> Bariyer Açık — Bekleniyor…
          </>
        ) : (
          <>
            <LogOut size={16} /> Ödemeyi Al &amp; Bariyeri Aç
          </>
        )}
      </button>
      <CorrectionForm onSubmit={onCorrectPlate} loading={!!correctionPending} />
      <DismissButton onClick={onDismiss} />
    </div>
  )
}

// ── Subscriber card ────────────────────────────────────────────────────────────

function SubscriberCard({
  candidate,
  onDismiss,
}: {
  candidate: GateCandidate
  onDismiss: () => void
}) {
  const [remaining, setRemaining] = useState(Math.ceil(SUBSCRIBER_AUTO_CLEAR_MS / 1_000))
  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1_000)
    return () => clearInterval(id)
  }, [])
  const barrierOk = candidate.barrier_triggered
  const sub = candidate.subscription
  const planLabel: Record<string, string> = {
    WEEKLY: 'Haftalık',
    MONTHLY: 'Aylık',
    YEARLY: 'Yıllık',
  }
  return (
    <div
      className={[
        'border-2 rounded-xl flex flex-col items-center py-4 px-4 gap-3 shadow-sm',
        barrierOk ? 'bg-green-50 border-green-500' : 'bg-amber-50 border-amber-400',
      ].join(' ')}
    >
      <Badge
        icon={<BadgeCheck size={14} />}
        label={barrierOk ? 'ABONE — OTOMATİK GİRİŞ' : 'ABONE — BARİYER HATASI'}
        color={barrierOk ? 'green' : 'amber'}
      />
      <PlateDisplay plate={candidate.plate} rawOcr={candidate.raw_ocr} dark={false} />
      {sub && (
        <div
          className={[
            'w-full rounded-xl border px-4 py-2.5 text-center',
            barrierOk ? 'bg-green-100 border-green-300' : 'bg-amber-100 border-amber-300',
          ].join(' ')}
        >
          <p className={`font-semibold text-sm ${barrierOk ? 'text-green-800' : 'text-amber-800'}`}>
            {planLabel[sub.plan_type] ?? sub.plan_type} Abone
          </p>
          <p className={`text-xs mt-0.5 ${barrierOk ? 'text-green-600' : 'text-amber-600'}`}>
            {sub.days_remaining} gün geçerli · {sub.end_date} tarihine kadar
          </p>
        </div>
      )}
      {barrierOk ? (
        <div className="w-full bg-green-100 border border-green-300 rounded-xl px-4 py-2.5 text-center">
          <p className="text-green-800 font-bold text-sm">✓ BARİYER OTOMATİK AÇILDI</p>
          <p className="text-green-600 text-xs mt-0.5 font-mono">Ücret: ₺0,00</p>
        </div>
      ) : (
        <div className="w-full bg-amber-100 border border-amber-300 rounded-xl px-4 py-2.5 text-center">
          <p className="text-amber-800 font-bold text-sm">⚠ BARİYER AÇILAMADI — MANUEL AÇIN</p>
          <p className="text-amber-600 text-xs mt-0.5">Seans kaydedildi · Ücret: ₺0,00</p>
        </div>
      )}
      <DismissButton onClick={onDismiss} label={`Tamam — Sıfırla (${remaining}s)`} />
    </div>
  )
}

// ── Shared small components ────────────────────────────────────────────────────

function Badge({
  icon,
  label,
  color,
}: {
  icon: ReactNode
  label: string
  color: 'emerald' | 'amber' | 'indigo' | 'green'
}) {
  const styles = {
    emerald: 'text-emerald-700 bg-emerald-100 border-emerald-300',
    amber:   'text-amber-700   bg-amber-100   border-amber-300',
    indigo:  'text-indigo-700  bg-indigo-100  border-indigo-300',
    green:   'text-green-700   bg-green-100   border-green-400',
  }
  return (
    <div
      className={`flex items-center gap-1.5 rounded-full px-3 py-1 border text-xs font-bold tracking-widest uppercase ${styles[color]}`}
    >
      {icon}
      {label}
    </div>
  )
}

function PlateDisplay({
  plate,
  rawOcr,
  dark,
}: {
  plate: string
  rawOcr: string
  dark: boolean
}) {
  return (
    <div className="text-center">
      <p
        className={`font-mono font-black text-3xl tracking-[0.18em] leading-none ${
          dark ? 'text-white' : 'text-slate-900'
        }`}
      >
        {plate}
      </p>
      {rawOcr !== plate && (
        <p className="text-slate-400 text-xs mt-1 font-mono">Ham OCR: {rawOcr}</p>
      )}
    </div>
  )
}

function ConfidenceBadge({ pct }: { pct: number }) {
  const color =
    pct >= 95
      ? 'text-emerald-700 bg-emerald-100 border-emerald-300'
      : pct >= 90
      ? 'text-lime-700 bg-lime-100 border-lime-300'
      : 'text-amber-700 bg-amber-100 border-amber-300'
  return (
    <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full border font-mono ${color}`}>
      %{pct} güven
    </span>
  )
}

function InfoBox({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="bg-white border border-indigo-200 rounded-xl px-3 py-2 text-center">
      <p className="text-indigo-500 text-xs font-medium">{label}</p>
      <p className={`text-base font-bold ${accent ? 'text-indigo-700' : 'text-slate-800'}`}>
        {value}
      </p>
    </div>
  )
}

function DismissButton({
  onClick,
  label = 'İptal / Sıfırla',
}: {
  onClick: () => void
  label?: string
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-500 hover:text-slate-700 border border-slate-200 transition-colors"
    >
      <X size={13} />
      {label}
    </button>
  )
}
