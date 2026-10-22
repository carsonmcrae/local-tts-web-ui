// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The sound library: browse by category, search by keyword, preview, and pick a sound.
 * Scope: A dialog (a bottom sheet on phones) listing the bundled sounds with their length and
 *   whether they loop, category chips and a search box, a preview button per sound (one at a time,
 *   stopped when the dialog closes), a "Use" button that hands the sound to the caller (to add an
 *   effect or replace one), loading and error states, and a link to the credits beside the files.
 * Does NOT belong: Placing the effect (SoundPanel) or playing audio (session.ts).
 */
import { Play, Square } from 'lucide-react';
import { useId, useState } from 'react';
import { describeError } from '@/api/client';
import type { SfxSound } from '@/api/types';
import { Button, IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Badge, Banner, Skeleton } from '@/components/ui/Feedback';
import { Input } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/format';
import { useSoundLibrary } from './queries';
import { useSfx } from './SfxProvider';

const CHIP =
  'flex h-8 cursor-pointer items-center rounded-full border px-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent';

interface SoundLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  busy: boolean;
  onPick: (sound: SfxSound) => void;
  /** Why the last pick failed, for a caller with nowhere else to show it. */
  error?: unknown;
}

/** Sounds whose name, description or keywords contain every word of `query`. */
function matches(sound: SfxSound, query: string): boolean {
  const haystack = [sound.name, sound.description, ...sound.keywords].join(' ').toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

function SoundRow({
  sound,
  busy,
  onPick,
}: Readonly<{ sound: SfxSound; busy: boolean; onPick: () => void }>) {
  const { sfx, state } = useSfx();
  const previewing = state.previewId === sound.id;
  return (
    <li className="flex items-center gap-2 rounded-[var(--radius-md)] px-1 py-1 hover:bg-surface-2">
      <IconButton
        size="sm"
        label={previewing ? `Stop the preview of ${sound.name}` : `Preview ${sound.name}`}
        icon={previewing ? <Square size={14} fill="currentColor" /> : <Play size={15} />}
        active={previewing}
        onClick={() => sfx.preview(previewing ? null : sound.id)}
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          {sound.name}
          {sound.loop ? <Badge>Loops</Badge> : null}
        </p>
        <p className="truncate text-xs text-muted">
          {sound.description} · {formatClock(sound.durationSeconds)}
        </p>
      </div>
      <Button size="sm" disabled={busy} onClick={onPick}>
        Use
      </Button>
    </li>
  );
}

export function SoundLibraryDialog({
  open,
  onOpenChange,
  title,
  description,
  busy,
  onPick,
  error,
}: Readonly<SoundLibraryDialogProps>) {
  const library = useSoundLibrary(open);
  const { sfx } = useSfx();
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const chips = useId();
  const sounds = library.data?.sounds ?? [];
  const categories = (library.data?.categories ?? []).filter((entry) =>
    sounds.some((sound) => sound.category === entry.id),
  );
  const shown = sounds.filter(
    (sound) => (category === 'all' || sound.category === category) && matches(sound, query),
  );
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The dialog only ever asks to close: a preview stops with it.
        sfx.preview(null);
        onOpenChange(next);
      }}
      title={title}
      description={description}
      size="lg"
      footer={
        <p className="text-[13px] text-muted sm:mr-auto">
          Every sound was made for TTSNative and is free to use.{' '}
          <a
            href="/sfx/CREDITS.md"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            How they were made
          </a>
        </p>
      }
    >
      {library.isPending ? <Skeleton className="h-32" /> : null}
      {library.isError ? <Banner tone="error">{describeError(library.error)}</Banner> : null}
      {error ? <Banner tone="error">{describeError(error)}</Banner> : null}
      {library.data ? (
        <>
          <Input
            type="search"
            aria-label="Search sounds"
            placeholder="Search sounds (rain, door, bell…)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="mb-3"
          />
          <fieldset className="mb-3 flex flex-wrap gap-2">
            <legend className="sr-only">Category</legend>
            {[{ id: 'all', label: 'All' }, ...categories].map((entry) => (
              <label
                key={entry.id}
                className={cn(
                  CHIP,
                  entry.id === category
                    ? 'border-accent bg-accent-soft font-medium text-accent-text'
                    : 'border-line text-muted hover:bg-surface-2 hover:text-text',
                )}
              >
                <input
                  type="radio"
                  name={chips}
                  className="sr-only"
                  checked={entry.id === category}
                  onChange={() => setCategory(entry.id)}
                />
                {entry.label}
              </label>
            ))}
          </fieldset>
          {shown.length === 0 ? (
            <p className="px-1 py-4 text-sm text-muted">No sounds match that search.</p>
          ) : (
            <ul className="flex max-h-[50dvh] flex-col gap-0.5 overflow-y-auto">
              {shown.map((sound) => (
                <SoundRow key={sound.id} sound={sound} busy={busy} onPick={() => onPick(sound)} />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </Dialog>
  );
}
