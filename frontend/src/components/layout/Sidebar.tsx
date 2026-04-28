import { NavLink } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  BadgeCheck,
  Car,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  LayoutDashboard,
  MonitorPlay,
  SlidersHorizontal,
} from 'lucide-react'

type NavItem = { to: string; icon: LucideIcon; label: string; exact?: boolean }

const PRIMARY_NAV: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Genel Bakış', exact: true },
  { to: '/active', icon: Car, label: 'Aktif Araçlar' },
  { to: '/sessions', icon: ClipboardList, label: 'Tüm Seanslar' },
  { to: '/gate', icon: MonitorPlay, label: 'Bariyer Ekranı' },
]

const SETTINGS_NAV: NavItem[] = [
  { to: '/pricing', icon: CircleDollarSign, label: 'Tarife' },
  { to: '/subscriptions', icon: BadgeCheck, label: 'Abonelikler' },
  { to: '/gates', icon: SlidersHorizontal, label: 'Kapı ayarları' },
]

function NavLinks({ items, collapsed }: { items: NavItem[]; collapsed: boolean }) {
  return (
    <>
      {items.map(({ to, icon: Icon, label, exact }) => (
        <NavLink
          key={to}
          to={to}
          end={exact}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            [
              'flex items-center rounded-md text-sm font-medium transition-colors duration-100',
              collapsed ? 'justify-center px-0 py-2.5 w-10 mx-auto' : 'gap-3 px-3 py-2.5',
              isActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
            ].join(' ')
          }
        >
          {({ isActive }) => (
            <>
              <Icon size={16} className={isActive ? 'text-blue-600 shrink-0' : 'text-slate-400 shrink-0'} />
              {!collapsed && label}
            </>
          )}
        </NavLink>
      ))}
    </>
  )
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={[
        'shrink-0 h-full bg-slate-50 border-r border-slate-200 flex flex-col py-4',
        'transition-[width] duration-200 overflow-hidden',
        collapsed ? 'w-14' : 'w-60',
      ].join(' ')}
    >
      <nav className={['flex flex-col gap-0.5 shrink-0', collapsed ? 'px-1' : 'px-2'].join(' ')}>
        <NavLinks items={PRIMARY_NAV} collapsed={collapsed} />
      </nav>

      <div className="flex-1 min-h-3" aria-hidden />

      <div className={['pt-3 border-t border-slate-200', collapsed ? 'mx-1' : 'px-2 mx-2'].join(' ')}>
        {!collapsed && (
          <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Ayarlar
          </p>
        )}
        <div className={['flex flex-col gap-0.5', collapsed ? 'px-1' : ''].join(' ')}>
          <NavLinks items={SETTINGS_NAV} collapsed={collapsed} />
        </div>
      </div>

      {/* Toggle button */}
      <div className={['mt-2 border-t border-slate-200', collapsed ? 'mx-1 pt-2' : 'mx-2 pt-2'].join(' ')}>
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
          className={[
            'flex items-center rounded-md text-xs font-medium text-slate-500',
            'hover:bg-slate-100 hover:text-slate-700 transition-colors',
            collapsed ? 'justify-center w-10 mx-auto py-2' : 'gap-2 px-3 py-2 w-full',
          ].join(' ')}
        >
          {collapsed ? (
            <ChevronRight size={15} />
          ) : (
            <>
              <ChevronLeft size={15} />
              Daralt
            </>
          )}
        </button>
        {!collapsed && (
          <p className="px-3 pt-1 pb-1 text-xs text-slate-400">ALPR Otopark v1.0</p>
        )}
      </div>
    </aside>
  )
}
