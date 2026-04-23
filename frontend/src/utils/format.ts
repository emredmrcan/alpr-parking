import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'

/** Same options as the header clock (TopNav) — Turkish 24h with seconds. */
const TR_CLOCK: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

const TR_DATE: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}

const TR_DATE_TIME: Intl.DateTimeFormatOptions = {
  ...TR_DATE,
  ...TR_CLOCK,
}

/**
 * Parse datetimes from the API. SQLite returns naive UTC values; JSON often has
 * no timezone suffix, and ECMAScript treats those as *local* wall time — which
 * shifts entrance times vs the real clock. If there is no explicit offset, we
 * treat the instant as UTC (matches `datetime.now(timezone.utc)` on the server).
 */
export function parseServerInstant(iso: string): Date {
  const s = iso.trim()
  if (!s) return new Date(NaN)
  if (/[zZ]|[+-]\d{2}:\d{2}\s*$/.test(s)) {
    return new Date(s)
  }
  return new Date(`${s}Z`)
}

/** Live client clock — use for TopNav so it matches formatted server instants. */
export function formatClientClock(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('tr-TR', TR_CLOCK).format(date)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', TR_DATE).format(parseServerInstant(iso))
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', TR_DATE_TIME).format(parseServerInstant(iso))
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', TR_CLOCK).format(parseServerInstant(iso))
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(parseServerInstant(iso), { addSuffix: true, locale: tr })
}

/** Whole-minute breakdown (no “Az önce geldi”). Used for completed rows and averages. */
export function formatMinutesBlock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} dk`
  if (m === 0) return `${h} sa`
  return `${h} sa ${m} dk`
}

/**
 * Live park duration (aktif araç tablosu). Sub-minute → “Az önce geldi”.
 * Tamamlanan / liste satırları için `formatRecordedDuration` kullanın.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'Az önce geldi'
  return formatMinutesBlock(minutes)
}

/**
 * Kayıtlı seans süresi (Tüm seanslar, Son tamamlanan, detay çekmecesi).
 * Çıkış zamanı varsa 1 dk altını saniye ile gösterir; “Az önce geldi” kullanılmaz.
 */
export function formatRecordedDuration(
  durationMinutes: number | null,
  entranceIso: string,
  exitIso: string | null,
): string {
  if (!exitIso) {
    if (durationMinutes == null) return '—'
    if (durationMinutes < 1) return '< 1 dk'
    return formatMinutesBlock(durationMinutes)
  }
  const ms = parseServerInstant(exitIso).getTime() - parseServerInstant(entranceIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) {
    if (durationMinutes == null) return '—'
    if (durationMinutes < 1) return '< 1 dk'
    return formatMinutesBlock(durationMinutes)
  }
  if (ms < 60_000) {
    const sec = Math.max(0, Math.round(ms / 1000))
    return `${sec} sn`
  }
  if (durationMinutes != null && durationMinutes >= 1) {
    return formatMinutesBlock(durationMinutes)
  }
  const approxMin = Math.max(1, Math.round(ms / 60_000))
  return formatMinutesBlock(approxMin)
}

/** Bugünkü ortalama gibi istatistikler (ondalık dakika → yuvarla). */
export function formatStatMinutes(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded < 1) return '< 1 dk'
  return formatMinutesBlock(rounded)
}

export function formatMoney(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '—'
  return `₺${num.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function parseMoney(amount: string | null | undefined): number {
  if (!amount) return 0
  return parseFloat(amount)
}

export function getDurationMinutes(entranceIso: string): number {
  const entrance = parseServerInstant(entranceIso)
  const now = new Date()
  return Math.floor((now.getTime() - entrance.getTime()) / 60_000)
}

export function validateTrPlate(text: string): { isValid: boolean; clean: string } {
  let clean = text.replace(/[^A-Z0-9]/g, '').toUpperCase()
  for (const noise of ['TRI', 'TRF', 'TR']) {
    clean = clean.replace(noise, '')
  }
  if (clean.length < 5) return { isValid: false, clean }

  const provinceStr = clean.slice(0, 2)
  if (!/^\d{2}$/.test(provinceStr)) return { isValid: false, clean }
  const province = parseInt(provinceStr, 10)
  if (province < 1 || province > 81) return { isValid: false, clean }

  const patterns = [
    /^[0-8][0-9][A-PR-VYZ][0-9]{4,5}$/,
    /^[0-8][0-9][A-PR-VYZ]{2}[0-9]{3,4}$/,
    /^[0-8][0-9][A-PR-VYZ]{3}[0-9]{2,3}$/,
  ]
  return { isValid: patterns.some((p) => p.test(clean)), clean }
}
