import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Button } from './button'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

/** Native <dialog>: focus trapping, Esc and top-layer for free. */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-surface p-0 text-ink shadow-2xl shadow-black/50 open:flex open:flex-col',
        { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' }[size],
      )}
    >
      {open && (
        <>
          <header className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
            <div>
              <h2 className="text-[16px] font-semibold">{title}</h2>
              {description && <div className="mt-0.5 text-[13px] text-ink-2">{description}</div>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line-soft px-5 py-3">{footer}</footer>}
        </>
      )}
    </dialog>
  )
}

export function ConfirmDialog({ open, onClose, onConfirm, title, children, confirmLabel, loading, danger = true }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  children: ReactNode
  confirmLabel: string
  loading?: boolean
  danger?: boolean
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-[13.5px] text-ink-2">{children}</div>
    </Dialog>
  )
}
