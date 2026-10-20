// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Choose the narration voice from the player without leaving the page.
 * Scope: Searchable popover listing custom voices first, then built-in voices grouped by language;
 *   unavailable voices (engine not installed) are shown disabled with the reason.
 * Does NOT belong: Voice previews and comparison (Voice Library page).
 */
import { AudioLines, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { VoiceInfo } from '@/api/types';
import { Badge } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { Popover } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';

interface VoicePickerProps {
  voices: VoiceInfo[];
  value: string;
  onChange: (voiceId: string) => void;
  compact?: boolean;
}

export function groupVoices(voices: VoiceInfo[], query: string): [string, VoiceInfo[]][] {
  const needle = query.trim().toLowerCase();
  const matches = voices.filter(
    (voice) =>
      !needle ||
      `${voice.name} ${voice.language} ${voice.engineId} ${voice.gender}`
        .toLowerCase()
        .includes(needle),
  );
  const groups = new Map<string, VoiceInfo[]>();
  for (const voice of matches) {
    const group = voice.category === 'custom' ? 'Your voices' : voice.language;
    groups.set(group, [...(groups.get(group) ?? []), voice]);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    if (a === 'Your voices') return -1;
    if (b === 'Your voices') return 1;
    if (a.startsWith('English')) return b.startsWith('English') ? a.localeCompare(b) : -1;
    if (b.startsWith('English')) return 1;
    return a.localeCompare(b);
  });
}

export function VoicePicker({
  voices,
  value,
  onChange,
  compact = false,
}: Readonly<VoicePickerProps>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = voices.find((voice) => voice.id === value);
  const groups = useMemo(() => groupVoices(voices, query), [voices, query]);

  return (
    <Popover
      label="Choose a voice"
      open={open}
      onOpenChange={setOpen}
      align="end"
      className="w-[min(22rem,calc(100vw-2rem))] p-0"
      trigger={
        <button
          type="button"
          className={cn(
            'flex h-9 min-w-0 items-center gap-2 rounded-[var(--radius-md)] px-2.5 text-sm text-muted hover:bg-surface-2 hover:text-text',
            compact && 'px-2',
          )}
          aria-label={`Voice: ${current?.name ?? 'none selected'}. Change voice`}
        >
          <AudioLines size={17} className="shrink-0" />
          {compact ? null : (
            <span className="max-w-32 truncate">{current?.name ?? 'Choose voice'}</span>
          )}
        </button>
      }
    >
      <div className="border-b border-line p-2">
        <div className="relative">
          <Search
            size={15}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
          />
          <Input
            aria-label="Search voices"
            placeholder="Search voices"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-8"
          />
        </div>
      </div>
      {/* A custom listbox: options are filtered by the search box, grouped by language and shown
          disabled with a reason, none of which a native <select> can render (S6819 suggests one). */}
      <div // NOSONAR(typescript:S6819): custom listbox, see the comment above
        className="max-h-80 scrollbar-thin overflow-y-auto p-1.5"
        role="listbox"
        aria-label="Voices"
      >
        {groups.length === 0 ? (
          <p className="p-3 text-sm text-muted">No voices match “{query}”.</p>
        ) : null}
        {groups.map(([group, items]) => (
          <fieldset key={group} className="mb-1 min-w-0">
            <legend className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-subtle uppercase">
              {group}
            </legend>
            {items.map((voice) => (
              <button
                key={voice.id}
                type="button"
                role="option"
                aria-selected={voice.id === value}
                disabled={!voice.available}
                onClick={() => {
                  onChange(voice.id);
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50',
                  voice.id === value && 'bg-accent-soft text-accent-text hover:bg-accent-soft',
                )}
              >
                <span className="min-w-0 flex-1 truncate font-medium">{voice.name}</span>
                <span className="text-xs text-subtle capitalize">
                  {voice.gender === 'unspecified' ? '' : voice.gender}
                </span>
                {voice.qualityGrade ? <Badge>{voice.qualityGrade}</Badge> : null}
                {voice.available ? null : (
                  <span className="text-xs text-subtle">Not installed</span>
                )}
              </button>
            ))}
          </fieldset>
        ))}
      </div>
    </Popover>
  );
}
