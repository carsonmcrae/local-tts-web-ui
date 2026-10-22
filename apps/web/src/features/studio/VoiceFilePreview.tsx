// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Show what a .ttsvoice file holds before it is imported.
 * Scope: The voice's name, description and creator (as the file states them, shown as plain text),
 *   its kind and speaking styles, its size, when it was made and by which app version, and a clear
 *   note that it is a copy of a real person's voice. The server checks the file completely first.
 * Does NOT belong: Choosing the file, consent or the import itself (VoiceSharing).
 */
import { UserRound } from 'lucide-react';
import type { components } from '@/api/schema.gen';
import { Banner } from '@/components/ui/Feedback';

export type VoicePreview = components['schemas']['VoicePreview'];

const STYLE_NAMES: Readonly<Record<string, string>> = {
  narration: 'narration',
  question: 'questions',
  lively: 'lively lines',
  dialogue: 'dialogue',
  calm: 'calm lines',
};

function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString();
}

export function VoiceFilePreview({ preview }: Readonly<{ preview: VoicePreview }>) {
  const made = day(preview.createdAt);
  const shared = day(preview.exportedAt);
  const facts = [
    preview.kind === 'studio' ? 'Studio voice' : 'Quick voice',
    `${(preview.sizeBytes / 1_000_000).toFixed(1)} MB`,
    made ? `made ${made}` : null,
    shared ? `shared ${shared}` : null,
    preview.appVersion ? `TTSNative ${preview.appVersion}` : null,
  ].filter(Boolean);
  return (
    <section
      aria-label="Voice file"
      className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-4 text-sm"
    >
      <div className="flex items-start gap-3">
        <UserRound size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0">
          <p className="font-medium break-words">{preview.name}</p>
          {preview.creator ? <p className="text-muted">By {preview.creator}</p> : null}
          {preview.description ? (
            <p className="mt-1 break-words text-muted">{preview.description}</p>
          ) : null}
          <p className="mt-1 text-[13px] text-muted">{facts.join(' · ')}</p>
          {preview.styles.length > 0 ? (
            <p className="text-[13px] text-muted">
              Speaking styles:{' '}
              {preview.styles.map((style) => STYLE_NAMES[style] ?? style).join(', ')}
            </p>
          ) : null}
        </div>
      </div>
      <Banner tone="warning" title="This is a copy of a real person’s voice">
        Import it only if that person agreed to share it with you, and use it as they agreed.
      </Banner>
    </section>
  );
}
