import type {
  Subscription,
  SubscriptionCheckResult,
  SubscriptionCreate,
  SubscriptionUpdate,
} from '@/types/api'
import client from './client'

export const subscriptionsApi = {
  list: async (params?: { plate?: string; active?: boolean }): Promise<Subscription[]> => {
    const res = await client.get<Subscription[]>('/subscriptions', { params })
    return res.data
  },

  get: async (id: number): Promise<Subscription> => {
    const res = await client.get<Subscription>(`/subscriptions/${id}`)
    return res.data
  },

  create: async (data: SubscriptionCreate): Promise<Subscription> => {
    const res = await client.post<Subscription>('/subscriptions', data)
    return res.data
  },

  update: async (id: number, data: SubscriptionUpdate): Promise<Subscription> => {
    const res = await client.put<Subscription>(`/subscriptions/${id}`, data)
    return res.data
  },

  remove: async (id: number): Promise<void> => {
    await client.delete(`/subscriptions/${id}`)
  },

  check: async (plate: string): Promise<SubscriptionCheckResult> => {
    const res = await client.get<SubscriptionCheckResult>(`/subscriptions/check/${encodeURIComponent(plate)}`)
    return res.data
  },
}
