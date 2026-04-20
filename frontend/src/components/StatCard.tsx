import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: ReactNode
  icon?: ReactNode
  sub?: string
}

export default function StatCard({ label, value, icon, sub }: StatCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {label}
        </span>
        {icon && (
          <span className="text-slate-400">{icon}</span>
        )}
      </div>
      <div className="text-[28px] font-bold text-slate-900 leading-none">{value}</div>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}
