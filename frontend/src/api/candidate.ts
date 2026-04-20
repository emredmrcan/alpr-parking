import type { GateCandidate } from '@/types/api'
import client from './client'

export const candidateApi = {
  get: async (): Promise<GateCandidate | null> => {
    const res = await client.get<GateCandidate | null>('/candidate')
    return res.data ?? null
  },

  clear: async (): Promise<void> => {
    await client.delete('/candidate')
  },
}
