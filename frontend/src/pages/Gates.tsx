import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, CheckCircle2, DoorOpen, LogIn, LogOut, Pencil, Plus, ScanLine, Trash2, Activity, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Trans, useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import AlertDialog from '@/components/ui/AlertDialog'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { gatesApi, type GatePayload } from '@/api/gates'
import { camerasApi } from '@/api/cameras'
import { userFacingApiDetail } from '@/utils/apiError'
import type { CameraDiscoveryItem, GateBarrierHealth, ParkingGate } from '@/types/api'

const DRIVER_OPTIONS = [
  { value: 'dummy', labelKey: 'gates.driverDummy' },
  { value: 'relay', labelKey: 'gates.driverRelay' },
  { value: 'ip', labelKey: 'gates.driverIp' },
] as const

function barrierSummary(g: ParkingGate): string {
  if (g.barrier_driver === 'relay') {
    return i18n.t('gates.summaryRelay', { port: g.barrier_port ?? '—', channel: g.barrier_relay_channel })
  }
  if (g.barrier_driver === 'ip') {
    return i18n.t('gates.summaryIp', { url: g.barrier_ip_url ?? '—' })
  }
  return i18n.t('gates.summaryDummy')
}

export default function Gates() {
  const { t } = useTranslation()
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
      toast.success(t('gates.deleted'))
      qc.invalidateQueries({ queryKey: ['gates'] })
    },
    onError: () => toast.error(t('subs.deleteFailed')),
  })

  const { mutate: testBarrier, isPending: testing, variables: testingId } = useMutation({
    mutationFn: (id: number) => gatesApi.testBarrier(id),
    onSuccess: (res) => {
      if (res.success) toast.success(t('gates.testSent'))
      else toast.error(res.notes || t('gates.testNoResponse'))
    },
    onError: () => toast.error(t('gates.testFailed')),
  })

  const { mutate: checkHealth, isPending: healthing, variables: healthId } = useMutation({
    mutationFn: (id: number) => gatesApi.barrierHealth(id),
    onSuccess: (h: GateBarrierHealth) => {
      toast.message(
        h.connected ? t('gates.connected') : t('gates.disconnected'),
        { description: `${h.driver} · ${h.barrier_driver}` },
      )
    },
    onError: () => toast.error(t('gates.healthFailed')),
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
          <h1 className="text-xl font-bold text-slate-900">{t('gates.title')}</h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            <Trans i18nKey="gates.intro" components={{ strong: <strong /> }} />
          </p>
        </div>
        <Button variant="primary" iconLeft={<Plus size={16} />} onClick={openAdd}>
          {t('gates.add')}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-slate-700 font-medium">{t('gates.none')}</p>
          <p className="text-sm text-slate-500 mt-1">
            {t('gates.noneHint')}
          </p>
          <Button className="mt-4" variant="primary" onClick={openAdd}>
            {t('gates.addFirst')}
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
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span
                      className={[
                        'inline-block text-xs font-medium px-2 py-0.5 rounded',
                        g.is_active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600',
                      ].join(' ')}
                    >
                      {g.is_active ? t('common.active') : t('gates.off')}
                    </span>
                    {g.gate_type === 'entrance' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <LogIn size={10} /> {t('gates.entrance')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                        <LogOut size={10} /> {t('gates.exit')}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  to={`/gate?gate_id=${g.id}`}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  title={t('gates.goToScreen')}
                  aria-label={t('gates.goToScreen')}
                >
                  <ExternalLink size={14} />
                </Link>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex gap-2 text-slate-700">
                  <Camera size={16} className="shrink-0 text-slate-400 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      {t('gates.camera')}
                    </div>
                    <div className="font-mono text-xs break-all">{g.camera_source}</div>
                  </div>
                </div>
                <div className="flex gap-2 text-slate-700">
                  <DoorOpen size={16} className="shrink-0 text-slate-400 mt-0.5" />
                  <div>
                    <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                      {t('gates.barrier')}
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
                    {t('gates.testBarrier')}
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
                    {t('gates.testCamera')}
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
                    {t('gates.connection')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconLeft={<Pencil size={14} />}
                    onClick={() => openEdit(g)}
                  >
                    {t('common.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={removing && removingId === g.id}
                    iconLeft={<Trash2 size={14} />}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setDeleteTarget(g)}
                  >
                    {t('common.delete')}
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
        allGates={gates}
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
        title={previewGate ? t('gates.cameraTestTitle', { label: previewGate.label }) : t('gates.cameraTest')}
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
            {t('common.close')}
          </Button>
        }
      >
        {previewGate && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {t('gates.source')} <span className="font-mono text-xs">{previewGate.camera_source}</span>
            </p>
            <div className="rounded-md border border-slate-200 bg-black/90 p-2">
              <img
                src={`${gatesApi.cameraPreviewUrl(previewGate.camera_source)}&_t=${previewTick}`}
                alt={t('gates.testAlt')}
                className="w-full h-80 object-contain rounded"
                onLoad={() => {
                  setPreviewLoading(false)
                  setPreviewError(null)
                }}
                onError={() => {
                  setPreviewLoading(false)
                  setPreviewError(t('gates.previewFailed'))
                }}
              />
            </div>
            <div className="text-xs">
              {previewLoading ? (
                <span className="text-slate-500">{t('gates.previewLoading')}</span>
              ) : previewError ? (
                <span className="text-rose-600">{previewError}</span>
              ) : (
                <span className="text-emerald-600">{t('gates.previewOk')}</span>
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
        title={t('gates.deleteTitle')}
        description={
          deleteTarget
            ? t('gates.deleteDesc', { label: deleteTarget.label })
            : ''
        }
        confirmLabel={t('subs.deleteConfirm')}
        cancelLabel={t('common.cancel')}
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

/** Returns true when the string looks like a bare IPv4 address (no protocol). */
function isBareIpAddress(value: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(value.trim())
}

function GateModal({
  open,
  onClose,
  editTarget,
  allGates,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  editTarget: ParkingGate | null
  allGates: ParkingGate[]
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isEdit = Boolean(editTarget)

  const [label, setLabel] = useState('')
  const [cameraSource, setCameraSource] = useState('0')
  const [gateType, setGateType] = useState<'entrance' | 'exit'>('entrance')
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
        toast.message(t('gates.noUsb'), {
          description: t('gates.noUsbHint'),
        })
      }
    },
    onError: () => toast.error(t('gates.scanFailed')),
  })

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      setLabel(editTarget.label)
      setCameraSource(editTarget.camera_source)
      setGateType(editTarget.gate_type)
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
      setGateType('entrance')
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
      toast.success(isEdit ? t('gates.updated') : t('gates.added'))
      qc.invalidateQueries({ queryKey: ['gates'] })
      onSaved()
    },
    onError: (err: unknown) => {
      const msg = userFacingApiDetail(err)
      toast.error(msg ?? (isEdit ? t('gates.updateFailed') : t('gates.addFailed')))
    },
  })

  const handleSave = () => {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      toast.error(t('gates.nameRequired'))
      return
    }
    if (driver === 'relay' && !port.trim()) {
      toast.error(t('gates.comRequired'))
      return
    }
    if (driver === 'ip' && !ipUrl.trim()) {
      toast.error(t('gates.urlRequired'))
      return
    }

    // Client-side uniqueness check — gives instant feedback before the API call
    const trimmedSource = cameraSource.trim()
    const conflict = allGates.find(
      (g) => g.camera_source === trimmedSource && g.id !== editTarget?.id,
    )
    if (conflict) {
      toast.error(t('gates.sourceConflict', { label: conflict.label }))
      return
    }

    const payload: GatePayload = {
      label: trimmedLabel,
      camera_source: cameraSource.trim(),
      gate_type: gateType,
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
        {t('common.dismiss')}
      </Button>
      <Button variant="primary" loading={isPending} onClick={handleSave}>
        {t('common.save')}
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
      title={isEdit ? t('gates.modalEdit') : t('gates.modalNew')}
      width="max-w-xl"
      footer={footer}
    >
      <div className="space-y-4">
        <Input
          label={t('gates.gateName')}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('gates.gateNamePlaceholder')}
          hint={t('gates.gateNameHint')}
        />
        <Input
          label={t('gates.cameraSource')}
          value={cameraSource}
          onChange={(e) => {
            setCameraSource(e.target.value)
            if (cameraPreviewOpen) {
              setPreviewTick(0)
              setPreviewLoading(true)
              setPreviewError(null)
            }
          }}
          placeholder={t('gates.cameraSourcePlaceholder')}
          hint={t('gates.cameraSourceHint')}
        />
        {isBareIpAddress(cameraSource) && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1.5">
            <p className="font-semibold">{t('gates.bareIpTitle')}</p>
            <p>
              {t('gates.bareIpBody')}
            </p>
            <ul className="space-y-1 pl-2 font-mono">
              <li className="cursor-pointer hover:text-amber-900 underline decoration-dotted"
                onClick={() => setCameraSource(`rtsp://${cameraSource.trim()}:554/stream`)}>
                rtsp://{cameraSource.trim()}:554/stream
              </li>
              <li className="cursor-pointer hover:text-amber-900 underline decoration-dotted"
                onClick={() => setCameraSource(`rtsp://admin:admin@${cameraSource.trim()}:554/stream`)}>
                rtsp://admin:admin@{cameraSource.trim()}:554/stream
              </li>
              <li className="cursor-pointer hover:text-amber-900 underline decoration-dotted"
                onClick={() => setCameraSource(`rtsp://admin:admin@${cameraSource.trim()}:554/Streaming/Channels/101`)}>
                rtsp://admin:admin@{cameraSource.trim()}:554/Streaming/Channels/101 <span className="font-sans not-italic">(Hikvision)</span>
              </li>
              <li className="cursor-pointer hover:text-amber-900 underline decoration-dotted"
                onClick={() => setCameraSource(`rtsp://admin:admin@${cameraSource.trim()}:554/cam/realmonitor?channel=1&subtype=0`)}>
                rtsp://admin:admin@{cameraSource.trim()}:554/cam/realmonitor?channel=1&amp;subtype=0 <span className="font-sans not-italic">(Dahua)</span>
              </li>
            </ul>
            <p className="text-amber-700">
              {t('gates.bareIpClick')}
            </p>
          </div>
        )}

        {/* USB Camera Discovery */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-slate-700">{t('gates.usbScan')}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('gates.usbScanDesc')}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<ScanLine size={14} />}
              loading={isDiscovering}
              onClick={() => runDiscover()}
            >
              {isDiscovering ? t('gates.scanning') : t('gates.scan')}
            </Button>
          </div>

          {isDiscovering && (
            <p className="text-xs text-slate-500 animate-pulse">
              {t('gates.scanningWait')}
            </p>
          )}

          {!isDiscovering && discoverResults !== null && (
            <>
              {discoverResults.filter((r) => r.available).length === 0 ? (
                <p className="text-xs text-slate-500">
                  {t('gates.noUsbLong')}
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
                              {t('gates.useIndex')}
                            </Button>
                          )}
                          {isSelected && (
                            <p className="text-xs text-blue-600 font-medium text-center">
                              {t('gates.selected')}
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
                    toast.error(t('gates.sourceFirst'))
                    return
                  }
                  setCameraPreviewOpen(true)
                  setPreviewTick(0)
                  setPreviewLoading(true)
                  setPreviewError(null)
                }}
              >
                {t('gates.testCamera')}
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
                {t('gates.closeCamera')}
              </Button>
            )}
            <span className="text-xs text-slate-500">
              {t('gates.liveFrame')}
            </span>
          </div>
          {cameraPreviewOpen && (
            <div className="rounded-md border border-slate-200 bg-black/90 p-2">
              <img
                src={cameraPreviewUrl}
                alt={t('gates.previewAlt')}
                className="w-full h-56 object-contain rounded"
                onLoad={() => {
                  setPreviewLoading(false)
                  setPreviewError(null)
                }}
                onError={() => {
                  setPreviewLoading(false)
                  setPreviewError(t('gates.previewFailedShort'))
                }}
              />
              <div className="mt-2 text-xs">
                {previewLoading ? (
                  <span className="text-slate-300">{t('gates.previewLoading')}</span>
                ) : previewError ? (
                  <span className="text-rose-400">{previewError}</span>
                ) : (
                  <span className="text-emerald-400">{t('gates.previewOk')}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Gate type (entrance / exit) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">{t('gates.gateType')}</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'entrance', labelKey: 'gates.entranceGate', descKey: 'gates.entranceDesc', icon: <LogIn size={16} /> },
                { value: 'exit',     labelKey: 'gates.exitGate', descKey: 'gates.exitDesc', icon: <LogOut size={16} /> },
              ] as const
            ).map((opt) => {
              const selected = gateType === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGateType(opt.value)}
                  className={[
                    'flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-3 text-center transition-colors',
                    selected
                      ? opt.value === 'entrance'
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 bg-white hover:border-slate-300',
                  ].join(' ')}
                >
                  <span className={selected ? (opt.value === 'entrance' ? 'text-emerald-600' : 'text-indigo-600') : 'text-slate-400'}>
                    {opt.icon}
                  </span>
                  <span className={`text-xs font-bold ${selected ? (opt.value === 'entrance' ? 'text-emerald-800' : 'text-indigo-800') : 'text-slate-700'}`}>
                    {t(opt.labelKey)}
                  </span>
                  <span className="text-[10px] text-slate-400 leading-tight">{t(opt.descKey)}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700">{t('gates.barrierType')}</label>
          <select
            className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900"
            value={driver}
            onChange={(e) => setDriver(e.target.value)}
          >
            {DRIVER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {driver === 'relay' && (
          <>
            <Input
              label={t('gates.comPort')}
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder={t('gates.comPlaceholder')}
            />
            <Input
              label={t('gates.relayChannel')}
              type="number"
              min={1}
              max={8}
              value={channel}
              onChange={(e) => setChannel(Number(e.target.value))}
            />
            <Input
              label={t('gates.pulse')}
              type="number"
              step="0.1"
              min={0.1}
              max={30}
              value={pulse}
              onChange={(e) => setPulse(Number(e.target.value))}
              hint={t('gates.pulseHint')}
            />
          </>
        )}

        {driver === 'ip' && (
          <>
            <Input
              label={t('gates.barrierUrl')}
              value={ipUrl}
              onChange={(e) => setIpUrl(e.target.value)}
              placeholder="http://192.168.1.50/relay/on"
            />
            <Input
              label={t('gates.httpTimeout')}
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
            label={t('gates.order')}
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            hint={t('gates.orderHint')}
          />
          <div className="flex flex-col gap-1.5 justify-end">
            <label className="text-sm font-medium text-slate-700">{t('common.status')}</label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="rounded border-slate-300"
              />
              {t('common.active')}
            </label>
          </div>
        </div>
      </div>
    </Modal>
  )
}
