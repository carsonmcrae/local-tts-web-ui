/**
 * Purpose: The app's buttons — text buttons, icon-only buttons and link-styled buttons.
 * Scope: Variants (primary, secondary, ghost, danger), sizes, loading state with an accessible busy
 *   label, and a required `label` for icon buttons so every control has an accessible name.
 * Does NOT belong: Navigation links (use react-router `Link` with `buttonClasses`).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover shadow-soft',
  secondary: 'bg-surface text-text border border-line-strong hover:bg-surface-2 shadow-soft',
  subtle: 'bg-surface-2 text-text hover:bg-surface-3',
  ghost: 'text-muted hover:bg-surface-2 hover:text-text',
  danger: 'bg-danger text-white hover:opacity-90 shadow-soft dark:text-[#1a1b1f]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[13px]',
  md: 'h-10 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2.5 px-5 text-[15px]',
};

export function buttonClasses(
  variant: Variant = 'secondary',
  size: Size = 'md',
  className?: string,
): string {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-md)] font-medium whitespace-nowrap',
    'transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    loading = false,
    icon,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 14 : 16} /> : icon}
      {children}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  label: string;
  icon: ReactNode;
  variant?: Variant;
  size?: Size;
  active?: boolean;
}

const ICON_SIZES: Record<Size, string> = { sm: 'size-8', md: 'size-10', lg: 'size-12' };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = 'ghost', size = 'md', active = false, className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        buttonClasses(variant, size),
        'px-0',
        ICON_SIZES[size],
        active && 'bg-accent-soft text-accent-text',
        className,
      )}
      {...rest}
    >
      {icon}
    </button>
  );
});
