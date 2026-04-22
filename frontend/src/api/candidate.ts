import type { GateCandidate } from '@/types/api'
import client from './client'

export const candidateApi = {
  get: async (gateId: number): Promise<GateCandidate | null> => {
    const res = await client.get<GateCandidate | null>('/candidate', {
      params: { gate_id: gateId },
    })
    return res.data ?? null
  },

  clear: async (gateId: number): Promise<void> => {
    await client.delete('/candidate', { params: { gate_id: gateId } })
  },
}
