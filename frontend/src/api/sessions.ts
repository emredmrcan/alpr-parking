import client from './client'
import type {
  ExitConfirmPayload,
  PriceSummary,
  SessionActionResult,
  SessionDeletePayload,
  Session,
  SessionCreatePayload,
  SessionListResponse,
  TodayStats,
} from '@/types/api'

export const sessionsApi = {
  list: (params?: {
    status?: string
    plate?: string
    limit?: number
    offset?: number
    include_deleted?: boolean
  }) =>
    client
      .get<SessionListResponse>('/sessions', { params })
      .then((r) => r.data),

  get: (id: number) =>
    client.get<Session>(`/sessions/${id}`).then((r) => r.data),

  getByPlate: (plate: string) =>
    client.get<PriceSummary>(`/sessions/plate/${plate}`).then((r) => r.data),

  create: (payload: SessionCreatePayload) =>
    client.post<SessionActionResult>('/sessions', payload).then((r) => r.data),

  confirmExit: (id: number, payload: ExitConfirmPayload) =>
    client
      .post<SessionActionResult>(`/sessions/${id}/exit`, payload)
      .then((r) => r.data),

  softDelete: (id: number, payload?: SessionDeletePayload) =>
    client.delete<Session>(`/sessions/${id}`, { data: payload }).then((r) => r.data),

  todayStats: () =>
    client.get<TodayStats>('/stats/today').then((r) => r.data),
}
