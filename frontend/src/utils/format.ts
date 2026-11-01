import { formatDistanceToNow } from 'date-fns'
import { enGB, tr } from 'date-fns/locale'
import i18n, { currentLang, intlLocale } from '@/i18n'

/** Same options as the header clock (TopNav) — 24h with seconds. */
const LOCAL_CLOCK: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}

const LOCAL_DATE: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
}

const LOCAL_DATE_TIME: Intl.DateTimeFormatOptions = {
  ...LOCAL_DATE,
  ...LOCAL_CLOCK,
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
  return new Intl.DateTimeFormat(intlLocale(), LOCAL_CLOCK).format(date)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(), LOCAL_DATE).format(parseServerInstant(iso))
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(), LOCAL_DATE_TIME).format(parseServerInstant(iso))
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(), LOCAL_CLOCK).format(parseServerInstant(iso))
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(parseServerInstant(iso), { addSuffix: true, locale: currentLang() === 'tr' ? tr : enGB })
}

/** Whole-minute breakdown (no “just arrived” label). Used for completed rows and averages. */
export function formatMinutesBlock(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return i18n.t('duration.min', { m })
  if (m === 0) return i18n.t('duration.hr', { h })
  return i18n.t('duration.hrMin', { h, m })
}

/**
 * Live park duration (active vehicles table). Sub-minute → “just arrived”.
 * Use `formatRecordedDuration` for completed / list rows.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return i18n.t('duration.justArrived')
  return formatMinutesBlock(minutes)
}

/**
 * Recorded session duration (All sessions, Recently completed, detail drawer).
 * With an exit time, durations under 1 min are shown in seconds; “just arrived” is never used.
 */
export function formatRecordedDuration(
  durationMinutes: number | null,
  entranceIso: string,
  exitIso: string | null,
): string {
  if (!exitIso) {
    if (durationMinutes == null) return '—'
    if (durationMinutes < 1) return i18n.t('duration.lessThanMin')
    return formatMinutesBlock(durationMinutes)
  }
  const ms = parseServerInstant(exitIso).getTime() - parseServerInstant(entranceIso).getTime()
  if (!Number.isFinite(ms) || ms < 0) {
    if (durationMinutes == null) return '—'
    if (durationMinutes < 1) return i18n.t('duration.lessThanMin')
    return formatMinutesBlock(durationMinutes)
  }
  if (ms < 60_000) {
    const sec = Math.max(0, Math.round(ms / 1000))
    return i18n.t('duration.sec', { s: sec })
  }
  if (durationMinutes != null && durationMinutes >= 1) {
    return formatMinutesBlock(durationMinutes)
  }
  const approxMin = Math.max(1, Math.round(ms / 60_000))
  return formatMinutesBlock(approxMin)
}

/** Stats such as today's average (fractional minutes → rounded). */
export function formatStatMinutes(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded < 1) return i18n.t('duration.lessThanMin')
  return formatMinutesBlock(rounded)
}

export function formatMoney(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '—'
  return `₺${num.toLocaleString(intlLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
