// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A link in running text to a web page outside TTSNative.
 * Scope: Opens the page in a new tab without giving it a handle on this one or this page's address
 *   (noopener, noreferrer), in the accent link style; `className` adds layout, such as room for an
 *   icon after the text. Short enough to sit inside a sentence, punctuation and all.
 * Does NOT belong: Links within the app (react-router `Link`) or buttons that look like links (Button).
 */
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function WebLink({
  href,
  className,
  children,
}: Readonly<{ href: string; className?: string; children: ReactNode }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('font-medium text-accent-text underline-offset-2 hover:underline', className)}
    >
      {children}
    </a>
  );
}
