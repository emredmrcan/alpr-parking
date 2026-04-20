import { forwardRef, type TextareaHTMLAttributes } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={3}
          className={[
            'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm',
            'text-slate-900 placeholder:text-slate-400 resize-none',
            'transition-colors duration-100',
            'focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600',
            'disabled:bg-slate-50 disabled:cursor-not-allowed',
            error ? 'border-red-400 focus:ring-red-400' : '',
            className,
          ].join(' ')}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {!error && hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    )
  },
)

Textarea.displayName = 'Textarea'
export default Textarea
