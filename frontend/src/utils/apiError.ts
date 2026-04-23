/** Normalize FastAPI `detail` (string or validation list) for operator toasts. */
export function userFacingApiDetail(error: unknown): string | null {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const parts: string[] = []
    for (const item of detail) {
      if (typeof item === 'object' && item !== null && 'msg' in item) {
        parts.push(String((item as { msg: unknown }).msg))
      }
    }
    return parts.length ? parts.join(' ') : null
  }
  return null
}
