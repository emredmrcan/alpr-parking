import { format, formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'

export function formatDate(iso: string): string {
  return format(new Date(iso), 'dd.MM.yyyy', { locale: tr })
}

export function formatDateTime(iso: string): string {
  return format(new Date(iso), 'dd.MM.yyyy HH:mm', { locale: tr })
}

export function formatTime(iso: string): string {
  return format(new Date(iso), 'HH:mm', { locale: tr })
}

export function formatRelative(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: tr })
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'Az önce geldi'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} dk`
  if (m === 0) return `${h} sa`
  return `${h} sa ${m} dk`
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
  const entrance = new Date(entranceIso)
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
