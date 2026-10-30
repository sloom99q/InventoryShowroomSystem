import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { cn } from '@/lib/cn'

const control =
  'w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors hover:border-[#41474e] focus:border-accent focus:outline-none aria-invalid:border-danger disabled:opacity-60'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, 'h-9', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-20 py-2', className)} {...props} />
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(control, 'h-9 appearance-none bg-[url(/chevron.svg)] bg-[length:14px] bg-[position:right_10px_center] bg-no-repeat pe-8', className)} {...props}>
      {children}
    </select>
  )
}

type FieldProps = {
  label: string
  hint?: ReactNode
  error?: string
  className?: string
  children: (id: string, describedBy?: string) => ReactNode
}

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId()
  const descId = hint || error ? `${id}-desc` : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children(id, descId)}
      {error ? (
        <p id={descId} className="text-[12.5px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <div id={descId} className="text-[12.5px] text-ink-3">
          {hint}
        </div>
      ) : null}
    </div>
  )
}
