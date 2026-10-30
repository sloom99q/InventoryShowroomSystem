import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink hover:brightness-110',
        secondary: 'bg-surface text-ink border border-line hover:bg-hover',
        ghost: 'text-ink-2 hover:text-ink hover:bg-raised',
        danger: 'bg-surface text-danger border border-danger/40 hover:bg-danger/10',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

type Props = ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { loading?: boolean }

export function Button({ className, variant, size, loading, disabled, children, type = 'button', ...props }: Props) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
