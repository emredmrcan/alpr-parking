import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Shell from '@/components/layout/Shell'
import Dashboard from '@/pages/Dashboard'
import NewSession from '@/pages/NewSession'
import ActiveSessions from '@/pages/ActiveSessions'
import AllSessions from '@/pages/AllSessions'
import Pricing from '@/pages/Pricing'
import GateView from '@/pages/GateView'

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new-session" element={<NewSession />} />
          <Route path="/active" element={<ActiveSessions />} />
          <Route path="/sessions" element={<AllSessions />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/gate" element={<GateView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  )
}
