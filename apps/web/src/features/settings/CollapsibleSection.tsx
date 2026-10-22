// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A Settings section that starts collapsed, for settings most people never need.
 * Scope: The section card with a status badge, a full-width toggle (a name and a one-line summary;
 *   44 px tall) and the content, rendered only while open; `useSectionOpen` opens it when the page
 *   was reached through a link to the section's #hash.
 * Does NOT belong: What any section contains (SpeechApiSection, LanSection).
 */
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useId, useState } from 'react';
import { useLocation } from 'react-router';
import { Section } from '@/components/ui/Layout';

/** Open when the page was opened with a link to this section, such as an in-use sign. */
export function useSectionOpen(id: string) {
  const { hash } = useLocation();
  return useState(hash === `#${id}`);
}

interface CollapsibleSectionProps {
  id: string;
  title: string;
  description: string;
  badge: ReactNode;
  toggleLabel: string;
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function CollapsibleSection({
  id,
  title,
  description,
  badge,
  toggleLabel,
  summary,
  open,
  onOpenChange,
  children,
}: Readonly<CollapsibleSectionProps>) {
  const regionId = useId();
  return (
    <Section id={id} title={title} description={description} actions={badge}>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={open ? regionId : undefined}
        className="group flex min-h-11 w-full items-start gap-2 rounded-[var(--radius-md)] py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <ChevronRight
          size={18}
          aria-hidden="true"
          className="mt-px shrink-0 text-muted transition-transform group-aria-expanded:rotate-90"
        />
        <span className="flex flex-col">
          <span className="text-sm font-medium">{toggleLabel}</span>
          <span className="text-[13px] text-muted">{summary}</span>
        </span>
      </button>
      {open ? (
        <div id={regionId} className="mt-4 flex flex-col gap-6 border-t border-line pt-4">
          {children}
        </div>
      ) : null}
    </Section>
  );
}
