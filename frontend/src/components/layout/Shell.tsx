import { useState, useEffect, type ReactNode } from 'react'
import TopNav from './TopNav'
import Sidebar from './Sidebar'

interface ShellProps {
  children: ReactNode
}

export default function Shell({ children }: ShellProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar-collapsed') === 'true'
    } catch {
      return false
    }
  })

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem('sidebar-collapsed', String(next))
      } catch { /* ignore */ }
      return next
    })
  }

  useEffect(() => {
    try {
      localStorage.setItem('sidebar-collapsed', String(collapsed))
    } catch { /* ignore */ }
  }, [collapsed])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
