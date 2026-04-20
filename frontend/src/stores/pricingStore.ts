import { create } from 'zustand'
import type { PriceRule } from '@/types/api'

interface PricingStore {
  rules: PriceRule[]
  setRules: (rules: PriceRule[]) => void
  computeFee: (minutes: number) => number
}

export const usePricingStore = create<PricingStore>((set, get) => ({
  rules: [],

  setRules: (rules) => set({ rules }),

  computeFee: (minutes) => {
    const { rules } = get()
    if (!rules.length) return 0
    const sorted = [...rules].sort((a, b) => a.duration_from_min - b.duration_from_min)
    for (const rule of sorted) {
      const inRange =
        minutes >= rule.duration_from_min &&
        (rule.duration_to_min === null || minutes < rule.duration_to_min)
      if (inRange) return parseFloat(rule.price)
    }
    return parseFloat(sorted[sorted.length - 1].price)
  },
}))
