// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Adjust one placed sound effect: when it sounds, how loud, and how long an ambience lasts.
 * Scope: A dialog with the sentence, a start-or-end choice, a delay of up to three seconds, a
 *   volume from silent to half again as loud as the sound's own level, and, for ambience, how many
 *   sentences it plays under (up to sixty). Saves through the API and closes; errors stay in view.
 * Does NOT belong: Choosing the sound (SoundLibraryDialog) or playing it (session.ts).
 */
import { useState } from 'react';
import { describeError } from '@/api/client';
import type { SfxEffect } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { OptionList } from '@/components/ui/Menu';
import { Slider } from '@/components/ui/Slider';
import { useUpdateSoundEffect } from './queries';

const MAX_DELAY_SECONDS = 3;
const MAX_AMBIENCE_SENTENCES = 60;

interface EffectDialogProps {
  documentId: string;
  effect: SfxEffect;
  soundName: string;
  onClose: () => void;
}

export function EffectDialog({
  documentId,
  effect,
  soundName,
  onClose,
}: Readonly<EffectDialogProps>) {
  const update = useUpdateSoundEffect(documentId);
  const ambience = effect.untilSegment !== null && effect.untilSegment !== undefined;
  const [when, setWhen] = useState<'start' | 'end'>(effect.position >= 1 ? 'end' : 'start');
  const [delay, setDelay] = useState(
    Math.max(0, Math.min(effect.offsetMs / 1000, MAX_DELAY_SECONDS)),
  );
  const [volume, setVolume] = useState(effect.volume);
  const [lasts, setLasts] = useState(
    ambience
      ? Math.min((effect.untilSegment as number) - effect.segmentIndex + 1, MAX_AMBIENCE_SENTENCES)
      : 1,
  );
  const save = () =>
    update.mutate(
      {
        id: effect.id,
        position: when === 'end' ? 1 : 0,
        offsetMs: Math.round(delay * 1000),
        volume,
        ...(ambience ? { untilSegment: effect.segmentIndex + lasts - 1 } : {}),
      },
      { onSuccess: onClose },
    );
  return (
    <Dialog
      open
      onOpenChange={() => onClose()}
      title={`Adjust “${soundName}”`}
      description={effect.text}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button variant="primary" loading={update.isPending} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <OptionList
          label="When it sounds"
          value={when}
          onSelect={setWhen}
          options={[
            { value: 'start', label: 'As the sentence starts' },
            { value: 'end', label: 'As the sentence ends' },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium" aria-hidden="true">
              Delay
            </span>
            <span className="text-xs text-muted tabular-nums" aria-hidden="true">
              {delay.toFixed(1)} s
            </span>
          </div>
          <Slider
            label="Delay"
            min={0}
            max={MAX_DELAY_SECONDS}
            step={0.1}
            value={delay}
            valueText={(value) => `${value.toFixed(1)} seconds`}
            onChange={setDelay}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium" aria-hidden="true">
              Volume
            </span>
            <span className="text-xs text-muted tabular-nums" aria-hidden="true">
              {volume}%
            </span>
          </div>
          <Slider
            label="Effect volume"
            min={0}
            max={150}
            value={volume}
            valueText={(value) => `${value}%`}
            onChange={setVolume}
          />
        </div>
        {ambience ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium" aria-hidden="true">
                Lasts
              </span>
              <span className="text-xs text-muted tabular-nums" aria-hidden="true">
                {lasts} sentence{lasts === 1 ? '' : 's'}
              </span>
            </div>
            <Slider
              label="How many sentences it lasts"
              min={1}
              max={MAX_AMBIENCE_SENTENCES}
              value={lasts}
              valueText={(value) => `${value} sentences`}
              onChange={setLasts}
            />
          </div>
        ) : null}
        {update.isError ? <Banner tone="error">{describeError(update.error)}</Banner> : null}
      </div>
    </Dialog>
  );
}
