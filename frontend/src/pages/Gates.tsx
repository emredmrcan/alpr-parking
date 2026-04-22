import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, DoorOpen, Pencil, Plus, Trash2, Activity } from 'lucide-react'
import { toast } from 'sonner'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { gatesApi, type GatePayload } from '@/api/gates'
import type { GateBarrierHealth, ParkingGate } from '@/types/api'

const DRIVER_OPTIONS = [
  { value: 'dummy', label: 'Yok (sadece kayıt — test)' },
  { value: 'relay', label: 'USB röle (COM port)' },
  { value: 'ip', label: 'Ağ üzerinden (URL)' },
] as const

function barrierSummary(g: ParkingGate): string {
  if (g.barrier_driver === 'relay') {
    return `Röle · ${g.barrier_port ?? '—'} · kanal ${g.barrier_relay_channel}`
  }
  if (g.barrier_driver === 'ip') {
    return `IP · ${g.barrier_ip_url ?? '—'}`
  }
  return 'Simülasyon (dummy)'
}

export default function Gates() {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ParkingGate | null>(null)

  const { data: gates = [], isLoading } = useQuery({
    queryKey: ['gates'],
    queryFn: gatesApi.list,
  })

  const { mutate: removeGate, isPending: removing, variables: removingId } = useMutation({
    mutationFn: gatesApi.remove,
    onSuccess: () => {
      toast.success('Kapı silindi.')
      qc.invalidateQueries({ queryKey: ['gates'] })
    },
    onError: () => toast.error('Silinemedi.'),
  })

  const { mutate: testBarrier, isPending: testing, variables: testingId } = useMutation({
    mutationFn: (id: number) => gatesApi.testBarrier(id),
    onSuccess: (res) => {
      if (res.success) toast.success('Bariyer komutu gönderildi.')
      else toast.error(res.notes || 'Bariyer yanıt vermedi.')
    },
    onError: () => toast.error('Test başarısız.'),
  })

  const { mutate: checkHealth, isPending: healthing, variables: healthId } = useMutation({
    mutationFn: (id: number) => gatesApi.barrierHealth(id),
    onSuccess: (h: GateBarrierHealth) => {
      toast.message(
        h.connected ? 'Bariyer bağlantısı tamam' : 'Bariyer bağlantısı yok / kapalı',
        { description: `${h.driver} · ${h.barrier_driver}` },
      )
    },
    onError: () => toast.error('Durum okunamadı.'),
  })

  const openAdd = () => {
    setEditTarget(null)
    setModalOpen(true)
  }

  const openEdit = (g: ParkingGate) => {
    setEditTarget(g)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditTarget(null)
  }

  const sorted = useMemo(
    () => [...gates].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [gates],
  )

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Kapı ayarları</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            Her kart <strong>bir kamera + bir bariyer</strong> demektir (ör. giriş ve çıkış).
            Plaka okunduğunda doğru bariyerin açılması için önce burada kapıları tanımlayın.
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={16} />} onClick={openAdd}>
          Yeni kapı ekle
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">Yükleniyor…</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-slate-700 font-medium">Henüz kapı yok</p>
          <p className="text-sm text-slate-500 mt-1">
            &quot;Yeni kapı ekle&quot; ile giriş veya çıkış için kamera + bariyer çiftini ekleyin.
          </p>
          <Button className="mt-4" variant="primary" onClick={openAdd}>
            İlk kapıyı ekle
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {sorted.map((g) => (
            <div
              key={g.id}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm flex flex-col gap-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{g.label}</h2>
                  <span
                    className={[
                      'inline-block mt-1 text-xs font-medium px-2 py-0.5 rounded',
                      g.is_active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600',
                    ].join(' ')}
                  >
                    {g.is_active ? 'Aktif' : 'Kapalı'}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex gap-2 text-slate-700">
                  <Camera size={16} className="shrink-0 text-slate-400 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Kamera
                    </div>
                    <div className="font-mono text-xs break-all">{g.camera_source}</div>
                  </div>
                </div>
                <div className="flex gap-2 text-slate-700">
                  <DoorOpen size={16} className="shrink-0 text-slate-400 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Bariyer
                    </div>
                    <div>{barrierSummary(g)}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-auto pt-2 border-t border-slate-100">
                <Link
                  to={`/gate?gate_id=${g.id}`}
                  className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                >
                  Bariyer ekranı
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={healthing && healthId === g.id}
                  iconLeft={<Activity size={14} />}
                  onClick={() => checkHealth(g.id)}
                >
                  Bağlantı
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={testing && testingId === g.id}
                  onClick={() => testBarrier(g.id)}
                >
                  Bariyeri dene
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  iconLeft={<Pencil size={14} />}
                  onClick={() => openEdit(g)}
                >
                  Düzenle
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  loading={removing && removingId === g.id}
                  iconLeft={<Trash2 size={14} />}
                  onClick={() => {
                    if (
                      window.confirm(
                        `"${g.label}" kapısını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
                      )
                    ) {
                      removeGate(g.id)
                    }
                  }}
                >
                  Sil
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <GateModal
        open={modalOpen}
        onClose={closeModal}
        editTarget={editTarget}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['gates'] })
          closeModal()
        }}
      />
    </div>
  )
}

function GateModal({
  open,
  onClose,
  editTarget,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editTarget: ParkingGate | null
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const isEdit = Boolean(editTarget)

  const [label, setLabel] = useState('')
  const [cameraSource, setCameraSource] = useState('0')
  const [driver, setDriver] = useState<string>('dummy')
  const [port, setPort] = useState('')
  const [channel, setChannel] = useState(1)
  const [ipUrl, setIpUrl] = useState('')
  const [pulse, setPulse] = useState(1.5)
  const [ipTimeout, setIpTimeout] = useState(3)
  const [sortOrder, setSortOrder] = useState(0)
  const [active, setActive] = useState(true)

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      setLabel(editTarget.label)
      setCameraSource(editTarget.camera_source)
      setDriver(editTarget.barrier_driver)
      setPort(editTarget.barrier_port ?? '')
      setChannel(editTarget.barrier_relay_channel)
      setIpUrl(editTarget.barrier_ip_url ?? '')
      setPulse(editTarget.barrier_open_duration_sec)
      setIpTimeout(editTarget.barrier_timeout_sec)
      setSortOrder(editTarget.sort_order)
      setActive(editTarget.is_active)
    } else {
      setLabel('')
      setCameraSource('0')
      setDriver('dummy')
      setPort('')
      setChannel(1)
      setIpUrl('')
      setPulse(1.5)
      setIpTimeout(3)
      setSortOrder(0)
      setActive(true)
    }
  }, [open, editTarget])

  const { mutate: save, isPending } = useMutation({
    mutationFn: async (payload: GatePayload) => {
      if (isEdit && editTarget) {
        return gatesApi.update(editTarget.id, payload)
      }
      return gatesApi.create(payload)
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Kapı güncellendi.' : 'Kapı eklendi.')
      qc.invalidateQueries({ queryKey: ['gates'] })
      onSaved()
    },
    onError: () => toast.error(isEdit ? 'Güncellenemedi.' : 'Eklenemedi.'),
  })

  const handleSave = () => {
    const tLabel = label.trim()
    if (!tLabel) {
      toast.error('Kapı adı gerekli.')
      return
    }
    if (driver === 'relay' && !port.trim()) {
      toast.error('Relay için COM port gerekli.')
      return
    }
    if (driver === 'ip' && !ipUrl.trim()) {
      toast.error('IP bariyer için URL gerekli.')
      return
    }

    const payload: GatePayload = {
      label: tLabel,
      camera_source: cameraSource.trim(),
      barrier_driver: driver,
      barrier_relay_channel: channel,
      barrier_open_duration_sec: pulse,
      barrier_timeout_sec: ipTimeout,
      sort_order: sortOrder,
      is_active: active,
    }
    if (driver === 'relay') payload.barrier_port = port.trim()
    else payload.barrier_port = null

    if (driver === 'ip') payload.barrier_ip_url = ipUrl.trim()
    else payload.barrier_ip_url = null

    save(payload)
  }

  const footer = (
    <>
      <Button variant="ghost" onClick={onClose}>
        Vazgeç
      </Button>
      <Button variant="primary" loading={isPending} onClick={handleSave}>
        Kaydet
      </Button>
    </>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Kapıyı düzenle' : 'Yeni kapı (kamera + bariyer)'}
      width="max-w-xl"
      footer={footer}
    >
      <div className="space-y-4">
        <Input
          label="Kapı adı"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Örn: Giriş — ön bariyer"
          hint="Sahadaki görevli için kısa ve net bir isim seçin."
        />
        <Input
          label="Kamera kaynağı"
          value={cameraSource}
          onChange={(e) => setCameraSource(e.target.value)}
          placeholder="0 veya 1 (USB) ya da RTSP adresi"
          hint="USB kamera için çoğu zaman 0 yeterlidir. IP kamera için tam adresi yapıştırın."
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">Bariyer tipi</label>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
          >
            {DRIVER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {driver === 'relay' && (
          <>
            <Input
              label="COM port"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="COM3 veya /dev/ttyUSB0"
            />
            <Input
              label="Röle kanalı (1–8)"
              type="number"
              min={1}
              max={8}
              value={channel}
              onChange={(e) => setChannel(Number(e.target.value))}
            />
            <Input
              label="Pulse süresi (saniye)"
              type="number"
              step="0.1"
              min={0.1}
              max={30}
              value={pulse}
              onChange={(e) => setPulse(Number(e.target.value))}
              hint="Bariyere ne kadar süre &quot;açık&quot; sinyal gideceği."
            />
          </>
        )}

        {driver === 'ip' && (
          <>
            <Input
              label="Bariyer URL"
              value={ipUrl}
              onChange={(e) => setIpUrl(e.target.value)}
              placeholder="http://192.168.1.50/relay/on"
            />
            <Input
              label="HTTP zaman aşımı (saniye)"
              type="number"
              step="0.5"
              min={1}
              max={60}
              value={ipTimeout}
              onChange={(e) => setIpTimeout(Number(e.target.value))}
            />
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Sıra"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            hint="Listede önce gösterilsin (küçük sayı önce)."
          />
          <div className="flex flex-col gap-1.5 justify-end">
            <label className="text-sm font-medium text-slate-700">Durum</label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-slate-300"
              />
              Aktif
            </label>
          </div>
        </div>
      </div>
    </Modal>
  )
}
