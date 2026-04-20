import client from './client'
import type { PriceRule, PriceRulePayload } from '@/types/api'

export const pricingApi = {
  list: () => client.get<PriceRule[]>('/pricing').then((r) => r.data),

  create: (payload: PriceRulePayload) =>
    client.post<PriceRule>('/pricing', payload).then((r) => r.data),

  update: (id: number, payload: Partial<PriceRulePayload>) =>
    client.put<PriceRule>(`/pricing/${id}`, payload).then((r) => r.data),

  remove: (id: number) => client.delete(`/pricing/${id}`),
}
