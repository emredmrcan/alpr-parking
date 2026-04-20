import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  MonitorPlay,
  Camera,
  Loader2,
  LogIn,
  LogOut,
  AlertTriangle,
  X,
  ShieldCheck,
} from 'lucide-react'
import { candidateApi } from '@/api/candidate'
import { sessionsApi } from '@/api/sessions'
import { formatMoney, formatDuration } from '@/utils/format'
import type { GateCandidate, PriceSummary } from '@/types/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const TOO_EARLY_THRESHOLD_SEC = 30
const TOO_EARLY_AUTO_CLEAR_MS = 6_000

type GateMode = 'waiting' | 'looking_up' | 'entrance' | 'too_early' | 'exit'

// ── Main component ─────────────────────────────────────────────────────────────

export default function GateView() {
  const qc = useQueryClient()
  const [amountPaid, setAmountPaid] = useState('')

  // Tick every second so the too_early → exit transition happens on time
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000)
    return () => clearInterval(id)
  }, [])

  // ── Poll for current ALPR candidate ────────────────────────────────────────
  const { data: candidate } = useQuery<GateCandidate | null>({
    queryKey: ['gate-candidate'],
    queryFn: candidateApi.get,
    refetchInterval: 1_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  })

  // ── Look up active session for detected plate ───────────────────────────────
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

  // ── Determine gate mode ─────────────────────────────────────────────────────
  const gateMode = useMemo<GateMode>(() => {
    if (!candidate) return 'waiting'
    if (sessionLoading) return 'looking_up'
    if (!activeSession) return 'entrance'
    const elapsedSec =
      (Date.now() - new Date(activeSession.entrance_time).getTime()) / 1_000
    if (elapsedSec < TOO_EARLY_THRESHOLD_SEC) return 'too_early'
    return 'exit'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate, activeSession, sessionLoading, tick])

  // Pre-fill payment amount when session data arrives
  useEffect(() => {
    if (activeSession) {
      setAmountPaid(parseFloat(String(activeSession.amount_due)).toString())
    }
  }, [activeSession?.session_id])

  // ── Shared clear candidate ──────────────────────────────────────────────────
  const clearCandidate = useMutation({
    mutationFn: candidateApi.clear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gate-candidate'] })
      qc.invalidateQueries({ queryKey: ['gate-session'] })
    },
  })

  // ── Entrance: create session then clear ─────────────────────────────────────
  const confirmEntrance = useMutation({
    mutationFn: async () => {
      if (!candidate) throw new Error('No candidate')
      await sessionsApi.create({
        plate_number: candidate.plate,
        raw_ocr_text: candidate.raw_ocr,
        entered_manually: false,
      })
      await candidateApi.clear()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gate-candidate'] })
      qc.invalidateQueries({ queryKey: ['gate-session'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })

  // ── Exit: confirm payment then clear ──────────────────────────────────────
  const confirmExit = useMutation({
    mutationFn: async () => {
      if (!activeSession) throw new Error('No active session')
      await sessionsApi.confirmExit(activeSession.session_id, {
        amount_paid: parseFloat(amountPaid) || 0,
      })
      await candidateApi.clear()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gate-candidate'] })
      qc.invalidateQueries({ queryKey: ['gate-session'] })
      qc.invalidateQueries({ queryKey: ['sessions'] })
      setAmountPaid('')
    },
  })

  // ── Auto-clear on too_early ─────────────────────────────────────────────────
  const autoClearRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (gateMode !== 'too_early') return
    autoClearRef.current = setTimeout(
      () => clearCandidate.mutate(),
      TOO_EARLY_AUTO_CLEAR_MS,
    )
    return () => {
      if (autoClearRef.current) clearTimeout(autoClearRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateMode, candidate?.plate])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <MonitorPlay size={20} className="text-slate-500" />
            Bariyer Ekranı
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Plaka otomatik algılandığında kart güncellenir · Eşik: %70
          </p>
        </div>
        <StatusPill mode={gateMode} />
      </div>

      {/* Detection card — centred, full width up to a max */}
      <div className="flex justify-center">
        <div className="w-full max-w-lg">
          {gateMode === 'waiting' && <WaitingCard />}
          {gateMode === 'looking_up' && <LookingUpCard candidate={candidate!} />}
          {gateMode === 'entrance' && (
            <EntranceCard
              candidate={candidate!}
              loading={confirmEntrance.isPending}
              onConfirm={() => confirmEntrance.mutate()}
              onDismiss={() => clearCandidate.mutate()}
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
              onConfirm={() => confirmExit.mutate()}
              onDismiss={() => clearCandidate.mutate()}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Status pill (top-right) ────────────────────────────────────────────────────

function StatusPill({ mode }: { mode: GateMode }) {
  const config: Record<GateMode, { label: string; dot: string; text: string }> = {
    waiting:    { label: 'Bekliyor',   dot: 'bg-slate-400',   text: 'text-slate-500' },
    looking_up: { label: 'Sorgulanıyor', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-600' },
    entrance:   { label: 'Giriş',     dot: 'bg-emerald-500 animate-pulse', text: 'text-emerald-700' },
    too_early:  { label: 'Uyarı',     dot: 'bg-amber-400 animate-pulse',   text: 'text-amber-600' },
    exit:       { label: 'Çıkış',     dot: 'bg-indigo-500 animate-pulse',  text: 'text-indigo-700' },
  }
  const { label, dot, text } = config[mode]
  return (
    <div className={`flex items-center gap-2 text-sm font-medium ${text}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      {label}
    </div>
  )
}

// ── Card components ────────────────────────────────────────────────────────────

function WaitingCard() {
  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl flex flex-col items-center justify-center py-16 px-8 gap-4">
      <Camera size={44} className="text-slate-300" />
      <p className="text-slate-500 text-lg font-medium">Araç bekleniyor…</p>
      <p className="text-slate-400 text-sm text-center max-w-xs">
        Kamera aktif. Plaka algılandığında bu kart otomatik güncellenir.
      </p>
    </div>
  )
}

function LookingUpCard({ candidate }: { candidate: GateCandidate }) {
  return (
    <div className="bg-white border-2 border-slate-200 rounded-2xl flex flex-col items-center justify-center py-16 px-8 gap-4">
      <Loader2 size={36} className="text-slate-400 animate-spin" />
      <p className="text-slate-500 text-lg font-medium">Plaka sorgulanıyor…</p>
      <p className="font-mono font-bold text-2xl tracking-widest text-slate-800">
        {candidate.plate}
      </p>
    </div>
  )
}

function EntranceCard({
  candidate,
  loading,
  onConfirm,
  onDismiss,
}: {
  candidate: GateCandidate
  loading: boolean
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl flex flex-col items-center py-10 px-8 gap-6 shadow-sm">
      <Badge icon={<LogIn size={13} />} label="YENİ GİRİŞ" color="emerald" />

      <PlateDisplay plate={candidate.plate} rawOcr={candidate.raw_ocr} dark={false} />

      <ConfidenceBadge pct={Math.round(candidate.confidence * 100)} />

      <button
        onClick={onConfirm}
        disabled={loading}
        className="
          w-full py-3.5 rounded-xl text-base font-bold
          bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700
          text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center gap-2
        "
      >
        {loading
          ? <><Loader2 size={18} className="animate-spin" /> Kaydediliyor…</>
          : <><LogIn size={18} /> Giriş Kaydet &amp; Bariyeri Aç</>
        }
      </button>

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
    (Date.now() - new Date(session.entrance_time).getTime()) / 1_000,
  )

  return (
    <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl flex flex-col items-center py-10 px-8 gap-6 shadow-sm">
      <Badge icon={<AlertTriangle size={13} />} label="UYARI" color="amber" />

      <PlateDisplay plate={candidate.plate} rawOcr={candidate.raw_ocr} dark={false} />

      <div className="bg-amber-100 border border-amber-300 rounded-xl px-6 py-4 text-center w-full">
        <p className="text-amber-800 font-semibold">
          Bu araç {entranceSec} saniye önce giriş yaptı
        </p>
        <p className="text-amber-600 text-sm mt-1">
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
  onConfirm,
  onDismiss,
}: {
  candidate: GateCandidate
  session: PriceSummary
  amountPaid: string
  onAmountChange: (v: string) => void
  loading: boolean
  onConfirm: () => void
  onDismiss: () => void
}) {
  return (
    <div className="bg-indigo-50 border-2 border-indigo-400 rounded-2xl flex flex-col items-center py-10 px-8 gap-6 shadow-sm">
      <Badge icon={<LogOut size={13} />} label="ÇIKIŞ" color="indigo" />

      <PlateDisplay plate={candidate.plate} rawOcr={candidate.raw_ocr} dark={false} />

      <ConfidenceBadge pct={Math.round(candidate.confidence * 100)} />

      {/* Session info */}
      <div className="w-full grid grid-cols-2 gap-3">
        <InfoBox label="Park Süresi" value={formatDuration(session.duration_minutes)} />
        <InfoBox label="Hesaplanan Ücret" value={formatMoney(session.amount_due)} accent />
      </div>

      {/* Payment input */}
      <div className="w-full">
        <label className="block text-indigo-700 text-xs font-semibold mb-2 tracking-wide uppercase">
          Alınan Ücret (₺)
        </label>
        <input
          type="number"
          min="0"
          step="1"
          value={amountPaid}
          onChange={(e) => onAmountChange(e.target.value)}
          className="
            w-full bg-white border-2 border-indigo-300
            text-slate-900 text-2xl font-bold text-center font-mono
            rounded-xl px-4 py-3 outline-none
            focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200
            placeholder-slate-300
          "
          placeholder="0"
        />
      </div>

      <button
        onClick={onConfirm}
        disabled={loading || !amountPaid}
        className="
          w-full py-3.5 rounded-xl text-base font-bold
          bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700
          text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center gap-2
        "
      >
        {loading
          ? <><Loader2 size={18} className="animate-spin" /> Kaydediliyor…</>
          : <><LogOut size={18} /> Ödemeyi Al &amp; Bariyeri Aç</>
        }
      </button>

      <DismissButton onClick={onDismiss} />
    </div>
  )
}

// ── Shared small components ────────────────────────────────────────────────────

function Badge({
  icon,
  label,
  color,
}: {
  icon: React.ReactNode
  label: string
  color: 'emerald' | 'amber' | 'indigo'
}) {
  const styles = {
    emerald: 'text-emerald-700 bg-emerald-100 border-emerald-300',
    amber:   'text-amber-700   bg-amber-100   border-amber-300',
    indigo:  'text-indigo-700  bg-indigo-100  border-indigo-300',
  }
  return (
    <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 border text-xs font-bold tracking-widest uppercase ${styles[color]}`}>
      {icon}
      {label}
    </div>
  )
}

function PlateDisplay({ plate, rawOcr, dark }: { plate: string; rawOcr: string; dark: boolean }) {
  return (
    <div className="text-center">
      <p className={`font-mono font-black text-5xl tracking-[0.2em] leading-none ${dark ? 'text-white' : 'text-slate-900'}`}>
        {plate}
      </p>
      {rawOcr !== plate && (
        <p className="text-slate-400 text-xs mt-2 font-mono">Ham OCR: {rawOcr}</p>
      )}
    </div>
  )
}

function ConfidenceBadge({ pct }: { pct: number }) {
  const color =
    pct >= 95 ? 'text-emerald-700 bg-emerald-100 border-emerald-300' :
    pct >= 90 ? 'text-lime-700   bg-lime-100   border-lime-300' :
                'text-amber-700  bg-amber-100  border-amber-300'
  return (
    <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full border font-mono ${color}`}>
      %{pct} güven
    </span>
  )
}

function InfoBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white border border-indigo-200 rounded-xl px-4 py-3 text-center">
      <p className="text-indigo-500 text-xs font-medium mb-1">{label}</p>
      <p className={`text-lg font-bold ${accent ? 'text-indigo-700' : 'text-slate-800'}`}>
        {value}
      </p>
    </div>
  )
}

function DismissButton({ onClick, label = 'İptal / Sıfırla' }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="
        flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm
        bg-white hover:bg-slate-50 active:bg-slate-100
        text-slate-500 hover:text-slate-700 border border-slate-200
        transition-colors
      "
    >
      <X size={13} />
      {label}
    </button>
  )
}

import React from 'react'
