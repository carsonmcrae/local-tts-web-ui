// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The background-music channel of the audio mixer.
 * Scope: Turn music on or off for this narration, see what it is doing, set its volume (separate
 *   from the narration's), see the chosen track and open the library, and read why a track couldn't
 *   play. Renders nothing in a build without tracks.
 * Does NOT belong: The mixer panel (MixerMenu), the library (MusicLibrary) or when music plays
 *   (session.ts).
 */
import { ListMusic } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { SwitchControl } from '@/components/ui/Field';
import { VolumeControl } from '@/features/mixer/VolumeControl';
import { usePlayer } from '@/features/player/PlayerProvider';
import { formatClock } from '@/lib/format';
import { categoryLabel, TRACKS } from './library';
import { useMusic } from './MusicProvider';
import type { MusicState } from './session';

function statusText(state: MusicState, narrating: boolean, title: string): string {
  if (!state.enabled)
    return 'Off. Turn it on to play it under this narration; it is off again for the next one.';
  if (state.loadingId === state.trackId) return `Loading “${title}”…`;
  return narrating ? 'Playing under the narration.' : 'Starts when the narration plays.';
}

export function MusicChannel({ onBrowse }: Readonly<{ onBrowse: () => void }>) {
  const { music, state } = useMusic();
  const player = usePlayer().state;
  const statusId = useId();
  const track = TRACKS.find((entry) => entry.id === state.trackId);
  if (!track) return null;
  const narrating = player.status === 'playing' || player.status === 'loading';
  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-3.5">
      <VolumeControl
        name="Background music"
        label="Music volume"
        value={state.volume}
        onChange={(value) => music.setVolume(value)}
        action={
          <SwitchControl
            checked={state.enabled}
            onCheckedChange={(enabled) => music.setEnabled(enabled)}
            label="Background music"
            describedBy={statusId}
          />
        }
      />
      <p id={statusId} className="text-[13px] leading-snug text-muted">
        {statusText(state, narrating, track.title)}
      </p>
      <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{track.title}</p>
          <p className="text-xs text-muted">
            {categoryLabel(track.category)} · {formatClock(track.durationSeconds)}
          </p>
        </div>
        <Button size="sm" icon={<ListMusic size={15} />} onClick={onBrowse}>
          Browse
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {state.error.message}
        </p>
      ) : null}
    </div>
  );
}
