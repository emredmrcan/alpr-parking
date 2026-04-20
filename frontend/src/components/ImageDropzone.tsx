import { useCallback, useRef, useState } from 'react'
import { Upload, X, ImageIcon } from 'lucide-react'
import Spinner from '@/components/ui/Spinner'

interface ImageDropzoneProps {
  onFile: (file: File) => void
  loading?: boolean
  preview?: string | null
  onClear?: () => void
  height?: string
  label?: string
}

export default function ImageDropzone({
  onFile,
  loading = false,
  preview,
  onClear,
  height = 'h-44',
  label,
}: ImageDropzoneProps) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith('image/')) onFile(file)
    },
    [onFile],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  if (preview) {
    return (
      <div className={`relative ${height} rounded-md overflow-hidden border border-slate-200`}>
        <img
          src={preview}
          alt="Önizleme"
          className="w-full h-full object-contain bg-slate-50"
        />
        {loading && (
          <div className="absolute inset-0 bg-slate-900/50 flex flex-col items-center justify-center gap-2">
            <Spinner size={28} className="text-white" />
            <span className="text-sm text-white font-medium">Plaka tanınıyor…</span>
          </div>
        )}
        {!loading && onClear && (
          <button
            onClick={onClear}
            aria-label="Görüntüyü kaldır"
            className="absolute top-2 right-2 p-1 bg-white rounded border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label ?? 'Görüntü yükle'}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={[
        `${height} flex flex-col items-center justify-center gap-3`,
        'rounded-md border-2 border-dashed cursor-pointer select-none',
        'transition-colors duration-150',
        dragging
          ? 'border-blue-600 bg-blue-50'
          : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/50',
      ].join(' ')}
    >
      <div className="p-2.5 rounded-full bg-slate-100">
        <ImageIcon size={22} className="text-slate-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-slate-700">
          Sürükleyip bırakın veya seçmek için tıklayın
        </p>
        <p className="text-xs text-slate-400 mt-0.5">JPEG, PNG, WebP · Maks. 20 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/bmp"
        onChange={handleChange}
        className="hidden"
        aria-hidden="true"
      />
    </div>
  )
}
