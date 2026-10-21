// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The player's background-music control: a button that opens a small panel.
 * Scope: Turn music on or off for this narration, see the chosen track and what the music is doing,
 *   set the music volume (separate from the narration's), open the library, and read why a track
 *   couldn't play. The button is highlighted while music is on.
 * Does NOT belong: The library (MusicLibrary) or when music plays (session.ts).
 */
import { ListMusic, Music } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Field';
import { Popover } from '@/components/ui/Menu';
import { Slider } from '@/components/ui/Slider';
import { usePlayer } from '@/features/player/PlayerProvider';
import { cn } from '@/lib/cn';
import { formatClock } from '@/lib/format';
import { categoryLabel, TRACKS } from './library';
import { MusicLibrary } from './MusicLibrary';
import { useMusic } from './MusicProvider';
import type { MusicState } from './session';

function statusText(state: MusicState, narrating: boolean, title: string): string {
  if (!state.enabled) return 'Plays quietly under this narration. Off again for the next one.';
  if (state.loadingId === state.trackId) return `Loading “${title}”…`;
  return narrating ? 'Playing under the narration.' : 'Starts when the narration plays.';
}

export function MusicMenu() {
  const { music, state } = useMusic();
  const player = usePlayer().state;
  const [open, setOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const track = TRACKS.find((entry) => entry.id === state.trackId);
  // A build without any tracks has nothing to offer.
  if (!track) return null;
  const { title } = track;
  const narrating = player.status === 'playing' || player.status === 'loading';
  return (
    <>
      <Popover
        label="Background music"
        align="end"
        className="w-72"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            aria-label={
              state.enabled ? `Background music on: ${title}. Change` : 'Background music'
            }
            title="Background music"
            className={cn(
              'flex h-9 items-center rounded-[var(--radius-md)] px-2 hover:bg-surface-2 hover:text-text',
              state.enabled ? 'text-accent-text' : 'text-muted',
            )}
          >
            <Music size={17} />
          </button>
        }
      >
        <div className="flex flex-col gap-4 p-2">
          <Switch
            checked={state.enabled}
            onCheckedChange={(enabled) => music.setEnabled(enabled)}
            label="Background music"
            description={statusText(state, narrating, title)}
          />
          <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{title}</p>
              <p className="text-xs text-muted">
                {categoryLabel(track.category)} · {formatClock(track.durationSeconds)}
              </p>
            </div>
            <Button
              size="sm"
              icon={<ListMusic size={15} />}
              onClick={() => {
                setOpen(false);
                setLibraryOpen(true);
              }}
            >
              Browse
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium" aria-hidden="true">
                Music volume
              </span>
              <span className="text-xs text-muted tabular-nums" aria-hidden="true">
                {state.volume}%
              </span>
            </div>
            <Slider
              label="Music volume"
              min={0}
              max={100}
              value={state.volume}
              valueText={(value) => `${value}%`}
              onChange={(value) => music.setVolume(value)}
            />
          </div>
          {state.error ? (
            <p role="alert" className="text-[13px] font-medium text-danger">
              {state.error.message}
            </p>
          ) : null}
        </div>
      </Popover>
      <MusicLibrary open={libraryOpen} onOpenChange={setLibraryOpen} />
    </>
  );
}
