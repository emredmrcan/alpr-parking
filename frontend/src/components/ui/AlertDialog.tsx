import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'

interface AlertDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  confirming?: boolean
  onConfirm: () => void
}

export default function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirming = false,
  onConfirm,
}: AlertDialogProps) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      width="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {cancelLabel ?? t('common.dismiss')}
          </Button>
          <Button variant="destructive" loading={confirming} onClick={onConfirm}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
    </Modal>
  )
}
