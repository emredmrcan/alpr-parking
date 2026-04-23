import { NavLink } from 'react-router-dom'
import {
  BadgeCheck,
  Car,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  MonitorPlay,
  PlusCircle,
  SlidersHorizontal,
} from 'lucide-react'

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Genel Bakış', exact: true },
  { to: '/new-session', icon: PlusCircle, label: 'Yeni Seans' },
  { to: '/active', icon: Car, label: 'Aktif Araçlar' },
  { to: '/sessions', icon: ClipboardList, label: 'Tüm Seanslar' },
  { to: '/pricing', icon: CircleDollarSign, label: 'Tarife' },
  { to: '/subscriptions', icon: BadgeCheck, label: 'Abonelikler' },
  { to: '/gates', icon: SlidersHorizontal, label: 'Kapı ayarları' },
  { to: '/gate', icon: MonitorPlay, label: 'Bariyer Ekranı' },
]

export default function Sidebar() {
  return (
    <aside className="w-60 shrink-0 h-full bg-slate-50 border-r border-slate-200 flex flex-col py-4">
      <nav className="flex flex-col gap-0.5 px-2">
        {NAV.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors duration-100',
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={16} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-4 py-3 border-t border-slate-200 mx-2">
        <p className="text-xs text-slate-400">ALPR Otopark v1.0</p>
      </div>
    </aside>
  )
}
