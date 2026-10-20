// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Consistent status messaging: banners, empty states, badges and progress bars.
 * Scope: `Banner` (info/success/warning/error with optional action), `StatusRegion` (a polite live
 *   region on the native <output> element), `EmptyState` (icon, title, explanation, actions),
 *   `Badge`, `ProgressBar` (labelled, determinate, native <progress>) and `Skeleton`.
 * Does NOT belong: Toast notifications (Toast.tsx).
 */
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<Tone, { box: string; icon: ReactNode }> = {
  info: {
    box: 'border-line bg-surface-2 text-text',
    icon: <Info size={18} className="text-accent-text" />,
  },
  success: {
    box: 'border-success/30 bg-success-soft text-text',
    icon: <CheckCircle2 size={18} className="text-success" />,
  },
  warning: {
    box: 'border-warning/30 bg-warning-soft text-text',
    icon: <AlertTriangle size={18} className="text-warning" />,
  },
  error: {
    box: 'border-danger/30 bg-danger-soft text-text',
    icon: <XCircle size={18} className="text-danger" />,
  },
};

/**
 * A polite live region. `<output>` has the implicit `status` role; `aria-live` is also stated
 * because not every screen reader treats <output> as live on its own.
 */
export function StatusRegion({
  label,
  className,
  children,
}: Readonly<{ label?: string; className?: string; children: ReactNode }>) {
  return (
    <output aria-label={label} aria-live="polite" className={cn('block', className)}>
      {children}
    </output>
  );
}

interface BannerProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Banner({
  tone = 'info',
  title,
  children,
  action,
  className,
}: Readonly<BannerProps>) {
  const classes = cn(
    'flex gap-3 rounded-[var(--radius-lg)] border p-4 text-sm',
    TONES[tone].box,
    className,
  );
  const content = (
    <>
      <span className="mt-0.5 shrink-0">{TONES[tone].icon}</span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? (
          <div className={cn('leading-relaxed text-muted', title && 'mt-1')}>{children}</div>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </>
  );
  // Errors interrupt (role="alert"); everything else is announced politely.
  return tone === 'error' ? (
    <div role="alert" className={classes}>
      {content}
    </div>
  ) : (
    <StatusRegion className={classes}>{content}</StatusRegion>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  children,
  actions,
  className,
}: Readonly<EmptyStateProps>) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-text">
        {icon}
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children ? (
        <div className="mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</div>
      ) : null}
      {actions ? <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: Readonly<{
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
}>) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-line',
    accent: 'bg-accent-soft text-accent-text border-transparent',
    success: 'bg-success-soft text-success border-transparent',
    warning: 'bg-warning-soft text-warning border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] leading-4 font-medium whitespace-nowrap',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function ProgressBar({
  value,
  label,
  className,
}: Readonly<{ value: number; label: string; className?: string }>) {
  const percent = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  return (
    <progress
      aria-label={label}
      max={100}
      value={percent}
      className={cn(
        'block h-1.5 w-full appearance-none overflow-hidden rounded-full border-0 bg-surface-3',
        '[&::-webkit-progress-bar]:bg-surface-3',
        '[&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-accent [&::-webkit-progress-value]:transition-[width] [&::-webkit-progress-value]:duration-300',
        '[&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-accent',
        className,
      )}
    />
  );
}

/** Decorative placeholder; a <span> so it is valid inside an <output> loading region. */
export function Skeleton({ className }: Readonly<{ className?: string }>) {
  return (
    <span
      aria-hidden="true"
      className={cn('block animate-pulse rounded-[var(--radius-md)] bg-surface-2', className)}
    />
  );
}
