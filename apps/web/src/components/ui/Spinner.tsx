// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Small loading indicators.
 * Scope: An inline spinner and an indeterminate bar; both respect reduced-motion via global CSS.
 * Does NOT belong: Page-level loading layouts (use Skeleton/EmptyState).
 */
import { cn } from '@/lib/cn';

export function Spinner({ size = 16, className }: Readonly<{ size?: number; className?: string }>) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cn('animate-spin text-current', className)}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IndeterminateBar({ className }: Readonly<{ className?: string }>) {
  return (
    <div
      className={cn('h-1 w-full overflow-hidden rounded-full bg-surface-3', className)}
      aria-hidden="true"
    >
      <div
        className="h-full w-2/5 rounded-full bg-accent"
        style={{ animation: 'ltts-indeterminate 1.2s ease-in-out infinite' }}
      />
    </div>
  );
}
