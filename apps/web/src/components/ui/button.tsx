import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export const buttonVariants = cva(
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 motion-reduce:duration-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        default:
          'bg-accent text-accent-foreground hover:bg-accent-hover active:bg-accent-pressed disabled:hover:bg-accent disabled:active:bg-accent',
        outline:
          'border border-border bg-card text-foreground hover:bg-hover hover:border-foreground/40 active:bg-hover disabled:hover:bg-card disabled:hover:border-border disabled:active:bg-card',
        ghost:
          'bg-transparent text-muted hover:bg-hover hover:text-foreground active:bg-hover disabled:hover:bg-transparent disabled:hover:text-muted disabled:active:bg-transparent',
        danger:
          'border border-danger bg-transparent text-danger hover:bg-danger-soft active:bg-danger-soft disabled:hover:bg-transparent disabled:hover:border-danger disabled:active:bg-transparent',
        dangerSolid:
          'border border-transparent bg-danger-solid text-white hover:bg-danger-solid-hover active:bg-danger-solid-pressed disabled:hover:bg-danger-solid disabled:active:bg-danger-solid',
      },
      size: {
        default: '',
        /** Square, icon-only: at least 44 × 44 px (R-31-08). */
        icon: 'size-11 shrink-0 px-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export function Button({
  className,
  variant,
  size,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
