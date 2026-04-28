import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, CheckCircle2, DoorOpen, Pencil, Plus, ScanLine, Trash2, Activity, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import AlertDialog from '@/components/ui/AlertDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { gatesApi, type GatePayload } from '@/api/gates'
import { camerasApi } from '@/api/cameras'
import type { CameraDiscoveryItem, GateBarrierHealth, ParkingGate } from '@/types/api'

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
  const [previewGate, setPreviewGate] = useState<ParkingGate | null>(null)
  const [previewTick, setPreviewTick] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ParkingGate | null>(null)

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

  useEffect(() => {
    if (!previewGate) return
    const id = setInterval(() => {
      setPreviewTick((v) => v + 1)
      setPreviewLoading(true)
    }, 1200)
    return () => clearInterval(id)
  }, [previewGate])

  const sorted = useMemo(
    () => [...gates].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [gates],
  )

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
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
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((g) => (
            <div
              key={g.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-3"
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
                <Link
                  to={`/gate?gate_id=${g.id}`}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  title="Bariyer ekranına git"
                  aria-label="Bariyer ekranına git"
                >
                  <ExternalLink size={14} />
                </Link>
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

              <div className="mt-auto pt-2.5 border-t border-slate-100 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={testing && testingId === g.id}
                    iconLeft={<DoorOpen size={14} />}
                    onClick={() => testBarrier(g.id)}
                  >
                    Bariyeri dene
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    iconLeft={<Camera size={14} />}
                    onClick={() => {
                      setPreviewGate(g)
                      setPreviewTick(0)
                      setPreviewLoading(true)
                      setPreviewError(null)
                    }}
                  >
                    Kamerayı dene
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={healthing && healthId === g.id}
                    iconLeft={<Activity size={14} />}
                    onClick={() => checkHealth(g.id)}
                  >
                    Bağlantı
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
                    variant="ghost"
                    loading={removing && removingId === g.id}
                    iconLeft={<Trash2 size={14} />}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setDeleteTarget(g)}
                  >
                    Sil
                  </Button>
                </div>
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
      <Modal
        open={Boolean(previewGate)}
        onClose={() => {
          setPreviewGate(null)
          setPreviewLoading(false)
          setPreviewError(null)
        }}
        title={previewGate ? `Kamera testi — ${previewGate.label}` : 'Kamera testi'}
        width="max-w-2xl"
        footer={
          <Button
            variant="ghost"
            onClick={() => {
              setPreviewGate(null)
              setPreviewLoading(false)
              setPreviewError(null)
            }}
          >
            Kapat
          </Button>
        }
      >
        {previewGate && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Kaynak: <span className="font-mono text-xs">{previewGate.camera_source}</span>
            </p>
            <div className="rounded-md border border-slate-200 bg-black/90 p-2">
              <img
                src={`${gatesApi.cameraPreviewUrl(previewGate.camera_source)}&_t=${previewTick}`}
                alt="Kamera testi"
                className="w-full h-80 object-contain rounded"
                onLoad={() => {
                  setPreviewLoading(false)
                  setPreviewError(null)
                }}
                onError={() => {
                  setPreviewLoading(false)
                  setPreviewError('Kamera görüntüsü alınamadı. Kamera kaynağını kontrol edin.')
                }}
              />
            </div>
            <div className="text-xs">
              {previewLoading ? (
                <span className="text-slate-500">Kamera görüntüsü yükleniyor…</span>
              ) : previewError ? (
                <span className="text-rose-600">{previewError}</span>
              ) : (
                <span className="text-emerald-600">Kamera görüntüsü alındı.</span>
              )}
            </div>
          </div>
        )}
      </Modal>
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title="Kapıyı sil"
        description={
          deleteTarget
            ? `"${deleteTarget.label}" kapısını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`
            : ''
        }
        confirmLabel="Evet, sil"
        cancelLabel="İptal"
        confirming={removing}
        onConfirm={() => {
          if (!deleteTarget) return
          removeGate(deleteTarget.id, {
            onSettled: () => setDeleteTarget(null),
          })
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
  const [cameraPreviewOpen, setCameraPreviewOpen] = useState(false)
  const [previewTick, setPreviewTick] = useState(0)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [discoverResults, setDiscoverResults] = useState<CameraDiscoveryItem[] | null>(null)

  const { mutate: runDiscover, isPending: isDiscovering } = useMutation({
    mutationFn: camerasApi.discover,
    onSuccess: (results) => {
      setDiscoverResults(results)
      const found = results.filter((r) => r.available).length
      if (found === 0) {
        toast.message('Bağlı USB kamera bulunamadı.', {
          description: 'Kameranın bağlı ve sürücüsünün yüklü olduğunu kontrol edin.',
        })
      }
    },
    onError: () => toast.error('Kamera taraması başarısız oldu.'),
  })

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
      setCameraPreviewOpen(false)
      setPreviewTick(0)
      setPreviewLoading(false)
      setPreviewError(null)
      setDiscoverResults(null)
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
      setCameraPreviewOpen(false)
      setPreviewTick(0)
      setPreviewLoading(false)
      setPreviewError(null)
      setDiscoverResults(null)
    }
  }, [open, editTarget])

  useEffect(() => {
    if (!cameraPreviewOpen) return
    const id = setInterval(() => {
      setPreviewTick((v) => v + 1)
      setPreviewLoading(true)
    }, 1200)
    return () => clearInterval(id)
  }, [cameraPreviewOpen])

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

  const cameraPreviewUrl = cameraPreviewOpen
    ? `${gatesApi.cameraPreviewUrl(cameraSource.trim())}&_t=${previewTick}`
    : ''

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
          onChange={(e) => {
            setCameraSource(e.target.value)
            if (cameraPreviewOpen) {
              setPreviewTick(0)
              setPreviewLoading(true)
              setPreviewError(null)
            }
          }}
          placeholder="0 veya 1 (USB) ya da RTSP adresi"
          hint="USB kamera için çoğu zaman 0 yeterlidir. IP kamera için tam adresi yapıştırın."
        />

        {/* USB Camera Discovery */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-700">USB kamera tarama</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Bağlı USB kameraları otomatik olarak tespit eder ve önizleme gösterir.
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<ScanLine size={14} />}
              loading={isDiscovering}
              onClick={() => runDiscover()}
            >
              {isDiscovering ? 'Taranıyor…' : 'Tara'}
            </Button>
          </div>

          {isDiscovering && (
            <p className="text-xs text-slate-500 animate-pulse">
              USB kameralar taranıyor, lütfen bekleyin…
            </p>
          )}

          {!isDiscovering && discoverResults !== null && (
            <>
              {discoverResults.filter((r) => r.available).length === 0 ? (
                <p className="text-xs text-slate-500">
                  Bağlı USB kamera bulunamadı. Kameranın takılı olduğunu ve sürücüsünün
                  yüklü olduğunu kontrol edin.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {discoverResults
                    .filter((r) => r.available)
                    .map((cam) => {
                      const isSelected = cameraSource.trim() === String(cam.index)
                      return (
                        <div
                          key={cam.index}
                          className={[
                            'rounded border p-2 flex flex-col gap-1.5 cursor-pointer transition-colors',
                            isSelected
                              ? 'border-blue-400 bg-blue-50'
                              : 'border-slate-200 bg-white hover:border-slate-300',
                          ].join(' ')}
                          onClick={() => {
                            setCameraSource(String(cam.index))
                            if (cameraPreviewOpen) {
                              setPreviewTick(0)
                              setPreviewLoading(true)
                              setPreviewError(null)
                            }
                          }}
                        >
                          {cam.thumbnail_b64 ? (
                            <img
                              src={`data:image/jpeg;base64,${cam.thumbnail_b64}`}
                              alt={`USB #${cam.index}`}
                              className="w-full rounded object-cover aspect-video bg-black"
                            />
                          ) : (
                            <div className="w-full aspect-video rounded bg-slate-200 flex items-center justify-center">
                              <Camera size={20} className="text-slate-400" />
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-1">
                            <div>
                              <p className="text-xs font-semibold text-slate-800">
                                USB #{cam.index}
                              </p>
                              {cam.resolution && (
                                <p className="text-xs text-slate-500">{cam.resolution}</p>
                              )}
                            </div>
                            {isSelected && (
                              <CheckCircle2 size={16} className="text-blue-500 shrink-0" />
                            )}
                          </div>
                          {!isSelected && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="w-full text-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                setCameraSource(String(cam.index))
                                if (cameraPreviewOpen) {
                                  setPreviewTick(0)
                                  setPreviewLoading(true)
                                  setPreviewError(null)
                                }
                              }}
                            >
                              Bu indeksi kullan
                            </Button>
                          )}
                          {isSelected && (
                            <p className="text-xs text-blue-600 font-medium text-center">
                              Seçildi ✓
                            </p>
                          )}
                        </div>
                      )
                    })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {!cameraPreviewOpen ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={!cameraSource.trim()}
                onClick={() => {
                  if (!cameraSource.trim()) {
                    toast.error('Önce kamera kaynağı girin.')
                    return
                  }
                  setCameraPreviewOpen(true)
                  setPreviewTick(0)
                  setPreviewLoading(true)
                  setPreviewError(null)
                }}
              >
                Kamerayı dene
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCameraPreviewOpen(false)
                  setPreviewLoading(false)
                  setPreviewError(null)
                }}
              >
                Kamerayı kapat
              </Button>
            )}
            <span className="text-xs text-slate-500">
              Seçilen kaynaktan canlı kare gösterilir.
            </span>
          </div>
          {cameraPreviewOpen && (
            <div className="rounded-md border border-slate-200 bg-black/90 p-2">
              <img
                src={cameraPreviewUrl}
                alt="Kamera önizleme"
                className="w-full h-56 object-contain rounded"
                onLoad={() => {
                  setPreviewLoading(false)
                  setPreviewError(null)
                }}
                onError={() => {
                  setPreviewLoading(false)
                  setPreviewError('Kamera görüntüsü alınamadı. Kaynağı kontrol edin.')
                }}
              />
              <div className="mt-2 text-xs">
                {previewLoading ? (
                  <span className="text-slate-300">Kamera görüntüsü yükleniyor…</span>
                ) : previewError ? (
                  <span className="text-rose-400">{previewError}</span>
                ) : (
                  <span className="text-emerald-400">Kamera görüntüsü alındı.</span>
                )}
              </div>
            </div>
          )}
        </div>

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
