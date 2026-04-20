import type { ReactNode } from 'react'
import TopNav from './TopNav'
import Sidebar from './Sidebar'

interface ShellProps {
  children: ReactNode
}

export default function Shell({ children }: ShellProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
