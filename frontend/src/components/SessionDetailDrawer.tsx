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
  if (!session) return null

  const diff =
    session.amount_due && session.amount_paid
      ? parseFloat(session.amount_paid) - parseFloat(session.amount_due)
      : null

  return (
    <Drawer open={!!session} onClose={onClose} title="Seans Detayı">
      <Section title="Araç Bilgisi">
        <Row label="Plaka" value={
          <span className="font-mono font-bold tracking-widest text-base">
            {session.plate_number}
          </span>
        } />
        <Row label="Ham OCR" value={session.raw_ocr_text ?? '—'} />
        <Row label="Manuel Giriş" value={session.entered_manually ? 'Evet' : 'Hayır'} />
        <Row label="Durum" value={<StatusBadge status={session.status} />} />
      </Section>

      <Section title="Süre Bilgisi">
        <Row label="Giriş" value={formatDateTime(session.entrance_time)} />
        <Row
          label="Çıkış"
          value={session.exit_time ? formatDateTime(session.exit_time) : '—'}
        />
        <Row
          label="Süre"
          value={formatRecordedDuration(
            session.duration_minutes,
            session.entrance_time,
            session.exit_time,
          )}
        />
      </Section>

      <Section title="Ödeme Bilgisi">
        <Row label="Hesaplanan Ücret" value={formatMoney(session.amount_due)} />
        <Row label="Ödenen Ücret" value={formatMoney(session.amount_paid)} />
        {diff !== null && diff !== 0 && (
          <Row
            label="Fark"
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
        <Section title="Notlar">
          <div className="py-3 text-sm text-slate-700 whitespace-pre-wrap">
            {session.notes}
          </div>
        </Section>
      )}

      {/* Images */}
      {(session.image_path || session.exit_image_path) && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Görüntüler
          </h3>
          <div className="space-y-3">
            {session.image_path && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Giriş Fotoğrafı</p>
                <img
                  src={`/${session.image_path}`}
                  alt="Giriş"
                  className="w-full rounded-md border border-slate-200 object-contain max-h-48 bg-slate-50"
                />
              </div>
            )}
            {session.exit_image_path && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Çıkış Fotoğrafı</p>
                <img
                  src={`/${session.exit_image_path}`}
                  alt="Çıkış"
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
