import { useTranslation } from 'react-i18next'
import Drawer from '@/components/ui/Drawer'
import StatusBadge from '@/components/StatusBadge'
import { formatDateTime, formatRecordedDuration, formatMoney } from '@/utils/format'
import type { Session } from '@/types/api'

interface Props {
  session: Session | null
  onClose: () => void
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500 shrink-0 mr-4">{label}</span>
      <span className="text-sm text-slate-900 font-medium text-right break-all">{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        {title}
      </h3>
      <div className="bg-white border border-slate-200 rounded-md px-4">
        {children}
      </div>
    </div>
  )
}

export default function SessionDetailDrawer({ session, onClose }: Props) {
  const { t } = useTranslation()
  if (!session) return null

  const diff =
    session.amount_due && session.amount_paid
      ? parseFloat(session.amount_paid) - parseFloat(session.amount_due)
      : null

  return (
    <Drawer open={!!session} onClose={onClose} title={t('sessionDetail.title')}>
      <Section title={t('sessionDetail.vehicle')}>
        <Row label={t('common.plate')} value={
          <span className="font-mono font-bold tracking-widest text-base">
            {session.plate_number}
          </span>
        } />
        <Row label={t('sessionDetail.rawOcr')} value={session.raw_ocr_text ?? '—'} />
        <Row label={t('sessionDetail.manual')} value={session.entered_manually ? t('common.yes') : t('common.no')} />
        <Row label={t('common.status')} value={<StatusBadge status={session.status} />} />
      </Section>

      <Section title={t('sessionDetail.timing')}>
        <Row label={t('common.entry')} value={formatDateTime(session.entrance_time)} />
        <Row
          label={t('common.exit')}
          value={session.exit_time ? formatDateTime(session.exit_time) : '—'}
        />
        <Row
          label={t('common.duration')}
          value={formatRecordedDuration(
            session.duration_minutes,
            session.entrance_time,
            session.exit_time,
          )}
        />
      </Section>

      <Section title={t('sessionDetail.payment')}>
        <Row label={t('sessionDetail.amountDue')} value={formatMoney(session.amount_due)} />
        <Row label={t('sessionDetail.amountPaid')} value={formatMoney(session.amount_paid)} />
        {diff !== null && diff !== 0 && (
          <Row
            label={t('common.difference')}
            value={
              <span className={diff > 0 ? 'text-green-600' : 'text-amber-600'}>
                {diff > 0 ? '+' : ''}
                {formatMoney(diff)}
              </span>
            }
          />
        )}
      </Section>

      {session.notes && (
        <Section title={t('common.notes')}>
          <div className="py-3 text-sm text-slate-700 whitespace-pre-wrap">
            {session.notes}
          </div>
        </Section>
      )}

      {/* Images */}
      {(session.image_path || session.exit_image_path) && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            {t('sessionDetail.images')}
          </h3>
          <div className="space-y-3">
            {session.image_path && (
              <div>
                <p className="text-xs text-slate-500 mb-1">{t('sessionDetail.entryPhoto')}</p>
                <img
                  src={`/${session.image_path}`}
                  alt={t('common.entry')}
                  className="w-full rounded-md border border-slate-200 object-contain max-h-48 bg-slate-50"
                />
              </div>
            )}
            {session.exit_image_path && (
              <div>
                <p className="text-xs text-slate-500 mb-1">{t('sessionDetail.exitPhoto')}</p>
                <img
                  src={`/${session.exit_image_path}`}
                  alt={t('common.exit')}
                  className="w-full rounded-md border border-slate-200 object-contain max-h-48 bg-slate-50"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  )
}
