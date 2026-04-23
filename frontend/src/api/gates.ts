import client from '@/api/client'
import type { GateBarrierHealth, ParkingGate } from '@/types/api'

export type GatePayload = {
  label: string
  camera_source: string
  barrier_driver: string
  barrier_port?: string | null
  barrier_relay_channel?: number
  barrier_ip_url?: string | null
  barrier_open_duration_sec?: number
  barrier_timeout_sec?: number
  sort_order?: number
  is_active?: boolean
}

export const gatesApi = {
  list: () => client.get<ParkingGate[]>('/gates').then((r) => r.data),

  get: (id: number) => client.get<ParkingGate>(`/gates/${id}`).then((r) => r.data),

  create: (data: GatePayload) =>
    client.post<ParkingGate>('/gates', data).then((r) => r.data),

  update: (id: number, data: Partial<GatePayload>) =>
    client.put<ParkingGate>(`/gates/${id}`, data).then((r) => r.data),

  remove: (id: number) => client.delete(`/gates/${id}`),

  barrierHealth: (id: number) =>
    client.get<GateBarrierHealth>(`/gates/${id}/barrier-health`).then((r) => r.data),

  testBarrier: (id: number) =>
    client.post<{ success: boolean; notes: string | null }>(`/gates/${id}/test-barrier`).then(
      (r) => r.data,
    ),

  cameraPreviewUrl: (source: string) =>
    `${client.defaults.baseURL}/gates/camera-preview?source=${encodeURIComponent(source)}`,
}
