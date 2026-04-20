import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> & {
  label?: string
  error?: string
  hint?: string
  prefix?: ReactNode
  suffix?: ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, prefix, suffix, className = '', id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-slate-700"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {prefix && (
            <span className="absolute left-3 text-slate-400 pointer-events-none text-sm">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={[
              'w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm',
              'text-slate-900 placeholder:text-slate-400',
              'transition-colors duration-100',
              'focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-0 focus:border-blue-600',
              'disabled:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-500',
              error ? 'border-red-400 focus:ring-red-400 focus:border-red-400' : '',
              prefix ? 'pl-9' : '',
              suffix ? 'pr-9' : '',
              className,
            ].join(' ')}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 text-slate-400 pointer-events-none text-sm">
              {suffix}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {!error && hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    )
  },
)

Input.displayName = 'Input'
export default Input
