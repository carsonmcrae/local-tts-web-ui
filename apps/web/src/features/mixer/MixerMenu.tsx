// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The audio mixer in the player: one button that opens every sound level in one place.
 * Scope: Narration volume (saved on this device; disabled with an explanation where the device sets
 *   it), the background-music channel (on/off for this narration, volume, track, library) and room
 *   for further channels such as sound effects. The button is highlighted while music is on.
 * Does NOT belong: Applying levels (PlaybackController.setVolume, the music session) or the library
 *   dialog's contents (MusicLibrary).
 */
import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Popover } from '@/components/ui/Menu';
import { TRACKS } from '@/features/music/library';
import { MusicChannel } from '@/features/music/MusicChannel';
import { MusicLibrary } from '@/features/music/MusicLibrary';
import { useMusic } from '@/features/music/MusicProvider';
import { usePlayer } from '@/features/player/PlayerProvider';
import { cn } from '@/lib/cn';
import { narrationVolumeAdjustable, saveNarrationVolume } from './narration';
import { VolumeControl } from './VolumeControl';

const DEVICE_SETS_LEVEL = 'This device sets the narration level with its own volume buttons.';

export function MixerMenu() {
  const { controller, state: player } = usePlayer();
  const music = useMusic().state;
  const [open, setOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [adjustable] = useState(narrationVolumeAdjustable);
  const playing = music.enabled ? TRACKS.find((track) => track.id === music.trackId) : undefined;
  return (
    <>
      <Popover
        label="Audio mixer"
        align="end"
        className="w-80 max-w-[calc(100vw_-_1.5rem)]"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <button
            type="button"
            aria-label={
              playing ? `Audio mixer. Background music on: ${playing.title}` : 'Audio mixer'
            }
            title="Audio mixer"
            className={cn(
              'flex h-9 items-center rounded-[var(--radius-md)] px-2 hover:bg-surface-2 hover:text-text',
              playing ? 'text-accent-text' : 'text-muted',
            )}
          >
            <SlidersHorizontal size={17} />
          </button>
        }
      >
        <div className="flex flex-col gap-3.5 p-2">
          <p className="text-xs font-semibold tracking-wide text-subtle uppercase">Audio mixer</p>
          <VolumeControl
            name="Narration"
            label="Narration volume"
            value={Math.round(player.volume * 100)}
            onChange={(value) => {
              controller.setVolume(value / 100);
              saveNarrationVolume(value);
            }}
            unavailable={adjustable ? undefined : DEVICE_SETS_LEVEL}
          />
          <MusicChannel
            onBrowse={() => {
              setOpen(false);
              setLibraryOpen(true);
            }}
          />
          {/* Further channels (sound effects) go here: a VolumeControl with its own switch, as above. */}
        </div>
      </Popover>
      <MusicLibrary open={libraryOpen} onOpenChange={setLibraryOpen} />
    </>
  );
}
