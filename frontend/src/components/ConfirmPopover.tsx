import { useRef, useEffect, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@/components/ui/Button'

interface ConfirmPopoverProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  message?: string
  confirmLabel?: string
  loading?: boolean
  placement?: 'top' | 'bottom'
  children: ReactNode
}

export default function ConfirmPopover({
  open,
  onConfirm,
  onCancel,
  message,
  confirmLabel,
  loading = false,
  placement = 'bottom',
  children,
}: ConfirmPopoverProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCancel()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open, onCancel])

  return (
    <div ref={ref} className="relative inline-block">
      {children}
      {open && (
        <div
          className={[
            'absolute right-0 z-30 w-56 bg-white border border-slate-200 rounded-md shadow-md p-3',
            placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
          ].join(' ')}
        >
          <p className="text-sm text-slate-700 mb-3">{message ?? t('common.confirmPrompt')}</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={onCancel} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel ?? t('common.delete')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
