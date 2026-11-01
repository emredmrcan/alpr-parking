import { useTranslation } from 'react-i18next'

interface StatusBadgeProps {
  status: 'ACTIVE' | 'PAID'
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation()
  if (status === 'ACTIVE') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
        {t('status.active')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      {t('status.paid')}
    </span>
  )
}
