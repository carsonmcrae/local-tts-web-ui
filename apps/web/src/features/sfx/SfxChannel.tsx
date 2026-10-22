// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The sound-effects channel of the audio mixer.
 * Scope: Turn effects on or off for this narration, see what they are doing, set their volume (the
 *   same switch and level as the Sounds panel, which keeps the arrangement itself), and read why a
 *   sound couldn't play.
 * Does NOT belong: The mixer panel (MixerMenu), the arrangement (SoundPanel) or when effects play
 *   (session.ts).
 */
import { useId } from 'react';
import { SwitchControl } from '@/components/ui/Field';
import { VolumeControl } from '@/features/mixer/VolumeControl';
import { usePlayer } from '@/features/player/PlayerProvider';
import type { SfxState } from './session';
import { useSfx } from './SfxProvider';

function statusText(state: SfxState, narrating: boolean): string {
  if (!state.enabled)
    return 'Off. Turn them on to play beside this narration; the next narration starts without them.';
  if (state.loadingKey !== null) return 'Loading a sound…';
  return narrating ? 'Playing beside the narration.' : 'They start when the narration plays.';
}

export function SfxChannel() {
  const { sfx, state } = useSfx();
  const player = usePlayer().state;
  const statusId = useId();
  const narrating = player.status === 'playing' || player.status === 'loading';
  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-3.5">
      <VolumeControl
        name="Sound effects"
        label="Effects volume"
        value={state.volume}
        onChange={(value) => sfx.setVolume(value)}
        action={
          <SwitchControl
            checked={state.enabled}
            onCheckedChange={(enabled) => sfx.setEnabled(enabled)}
            label="Sound effects"
            describedBy={statusId}
          />
        }
      />
      <p id={statusId} className="text-[13px] leading-snug text-muted">
        {statusText(state, narrating)}
      </p>
      {state.notice ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {state.notice.message}
        </p>
      ) : null}
    </div>
  );
}
