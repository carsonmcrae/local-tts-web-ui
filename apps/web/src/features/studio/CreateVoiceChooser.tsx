// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Choose how to create a voice: quick (one short recording) or studio (a guided session).
 * Scope: Two options with what each takes and gives; the choice opens the matching wizard.
 * Does NOT belong: The wizards themselves.
 */
import { Mic, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog } from '@/components/ui/Dialog';

export type CreationRoute = 'quick' | 'studio';

function Option({
  icon,
  title,
  meta,
  children,
  onChoose,
}: Readonly<{
  icon: ReactNode;
  title: string;
  meta: string;
  children: ReactNode;
  onChoose: () => void;
}>) {
  return (
    <button
      type="button"
      onClick={onChoose}
      className="flex w-full gap-3 rounded-[var(--radius-lg)] border border-line p-4 text-left transition-colors hover:border-accent hover:bg-surface-2 focus-visible:border-accent"
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent-text">
        {icon}
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-[13px] text-subtle">{meta}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-muted">{children}</span>
      </span>
    </button>
  );
}

export function CreateVoiceChooser({
  open,
  onOpenChange,
  onChoose,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (route: CreationRoute) => void;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Create a voice" size="md">
      <div className="flex flex-col gap-3">
        <Option
          icon={<Mic size={17} />}
          title="Quick voice"
          meta="About 2 minutes"
          onChoose={() => onChoose('quick')}
        >
          Read one 20-second passage. Good for trying a voice; the result follows that one
          recording.
        </Option>
        <Option
          icon={<Sparkles size={17} />}
          title="Studio voice"
          meta="About 15–20 minutes · pause any time"
          onChoose={() => onChoose('studio')}
        >
          A guided session with a good microphone. Clean takes and your own speaking styles give the
          most faithful result; more passages on their own don’t.
        </Option>
      </div>
    </Dialog>
  );
}
