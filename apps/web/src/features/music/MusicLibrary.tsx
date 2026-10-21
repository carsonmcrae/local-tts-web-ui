// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The background-music library: browse, preview and choose a track.
 * Scope: A dialog (a bottom sheet on phones) with category filters, one row per track (title,
 *   creator, category, length and licence), a preview button per track, the chosen track marked as
 *   a selected radio, load errors next to the track, and a link to the credits that ship with the
 *   music. Closing the library stops a preview.
 * Does NOT belong: Turning music on or the volume (MusicMenu), or playing audio (session.ts).
 */
import { Check, Play, Square } from 'lucide-react';
import { useId, useState } from 'react';
import { IconButton } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/format';
import type { MusicCategory, MusicTrack } from './library';
import { CATEGORIES, categoryLabel, TRACKS } from './library';
import { useMusic } from './MusicProvider';

type Filter = MusicCategory | 'all';

const CHIP =
  'flex h-8 cursor-pointer items-center rounded-full border px-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent';

function CategoryFilter({
  value,
  onChange,
}: Readonly<{ value: Filter; onChange: (value: Filter) => void }>) {
  const name = useId();
  const filters: readonly { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...CATEGORIES.filter((category) => TRACKS.some((track) => track.category === category.id)),
  ];
  return (
    <fieldset className="mb-4 flex flex-wrap gap-2">
      <legend className="sr-only">Category</legend>
      {filters.map((filter) => (
        <label
          key={filter.id}
          className={cn(
            CHIP,
            filter.id === value
              ? 'border-accent bg-accent-soft font-medium text-accent-text'
              : 'border-line text-muted hover:bg-surface-2 hover:text-text',
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={filter.id === value}
            onChange={() => onChange(filter.id)}
          />
          {filter.label}
        </label>
      ))}
    </fieldset>
  );
}

function TrackRow({ track, name }: Readonly<{ track: MusicTrack; name: string }>) {
  const { music, state } = useMusic();
  const selected = state.trackId === track.id;
  const previewing = state.previewId === track.id;
  const loading = state.loadingId === track.id;
  const error = state.error?.trackId === track.id ? state.error.message : null;
  const previewIcon = previewing ? <Square size={14} fill="currentColor" /> : <Play size={15} />;
  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-1.5">
        <IconButton
          label={previewing ? `Stop the preview of ${track.title}` : `Preview ${track.title}`}
          icon={loading ? <Spinner size={15} /> : previewIcon}
          size="sm"
          active={previewing}
          aria-busy={loading}
          onClick={() => music.preview(previewing ? null : track.id)}
        />
        <label
          className={cn(
            'flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-1.5 hover:bg-surface-2',
            'has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent',
            selected && 'bg-accent-soft',
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={selected}
            onChange={() => music.selectTrack(track.id)}
          />
          <span className="min-w-0 flex-1">
            <span
              className={cn('block truncate text-sm font-medium', selected && 'text-accent-text')}
            >
              {track.title}
            </span>{' '}
            <span className="block truncate text-xs text-muted">
              {track.creator} · {categoryLabel(track.category)} ·{' '}
              {formatClock(track.durationSeconds)}
            </span>
          </span>
          {selected ? (
            <Check size={16} className="shrink-0 text-accent-text" aria-hidden="true" />
          ) : null}
        </label>
      </div>
      {error ? (
        <p role="alert" className="ml-10 px-2.5 pb-1 text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function MusicLibrary({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const { music } = useMusic();
  const [filter, setFilter] = useState<Filter>('all');
  const name = useId();
  const shown = TRACKS.filter((track) => filter === 'all' || track.category === filter);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // The dialog only ever asks to close: a preview stops with it.
        music.preview(null);
        onOpenChange(next);
      }}
      title="Music library"
      description="Pick what plays quietly under the narration. Preview a track to hear it first."
      footer={
        <p className="text-[13px] text-muted sm:mr-auto">
          Every track is free to share and use.{' '}
          <a
            href="/music/CREDITS.md"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-accent-text underline-offset-2 hover:underline"
          >
            Credits and licences
          </a>
        </p>
      }
    >
      <CategoryFilter value={filter} onChange={setFilter} />
      <fieldset>
        <legend className="sr-only">Background track</legend>
        <ul className="flex flex-col gap-1">
          {shown.map((track) => (
            <TrackRow key={track.id} track={track} name={name} />
          ))}
        </ul>
      </fieldset>
    </Dialog>
  );
}
