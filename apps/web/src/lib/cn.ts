// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Compose Tailwind class names with conflict resolution.
 * Scope: `cn(...)` = clsx + tailwind-merge, used by every component that accepts `className`.
 * Does NOT belong: Styling decisions.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
