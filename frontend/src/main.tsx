import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'

import App from './App'
import './i18n'
import './index.css'
import { useTranslation } from 'react-i18next'

/** Remount the tree on language change so non-hook helpers (date/duration formatters) re-evaluate. */
function LocalizedApp() {
  const { i18n } = useTranslation()
  return <App key={i18n.resolvedLanguage} />
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <LocalizedApp />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: '14px',
          },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
)
