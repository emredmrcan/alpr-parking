import { useEffect, useRef, useState } from 'react'
import { CheckCircle, AlertTriangle } from 'lucide-react'
import { validateTrPlate } from '@/utils/format'

interface PlateInputProps {
  value: string
  onChange: (val: string) => void
  confidence?: number | null
  disabled?: boolean
  autoFocus?: boolean
  size?: 'md' | 'lg'
}

export default function PlateInput({
  value,
  onChange,
  confidence,
  disabled,
  autoFocus,
  size = 'lg',
}: PlateInputProps) {
  const { isValid, clean } = validateTrPlate(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    onChange(raw)
  }

  const heightClass = size === 'lg' ? 'h-14 text-2xl' : 'h-10 text-base'

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          disabled={disabled}
          maxLength={9}
          placeholder="34ABC1234"
          aria-label="Plaka numarası"
          className={[
            'plate-input flex-1 rounded-md border bg-white px-4',
            'font-bold tracking-widest uppercase',
            heightClass,
            'focus:outline-none focus:ring-2 focus:ring-offset-0',
            isValid && value.length >= 5
              ? 'border-green-400 focus:ring-green-400'
              : value.length >= 5
              ? 'border-amber-400 focus:ring-amber-400'
              : 'border-slate-200 focus:ring-blue-600',
            'disabled:bg-slate-50 disabled:cursor-not-allowed',
            'transition-colors duration-150',
          ].join(' ')}
        />

        {value.length >= 5 && (
          <div className="shrink-0">
            {isValid ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                <CheckCircle size={16} />
                Geçerli plaka
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-medium text-amber-600">
                <AlertTriangle size={16} />
                Format tanınmıyor
              </span>
            )}
          </div>
        )}
      </div>

      {confidence !== null && confidence !== undefined && (
        <p className="text-xs text-slate-500">
          OCR güveni:{' '}
          <span className="font-medium text-slate-700">
            {Math.round(confidence * 100)}%
          </span>
        </p>
      )}
    </div>
  )
}
