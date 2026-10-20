// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Let the speaker clean up a recording by ear: background noise, low rumble and tone.
 * Scope: Shows the cleanup suggested for this recording (with a one-click "Use suggested"), sliders
 *   for noise reduction, treble and low end, a rumble-filter switch, and before-and-after playback
 *   (the cleaned version is made by the server on demand and cached per setting). The original
 *   recording is never changed; the chosen cleanup is applied to copies.
 * Does NOT belong: Suggesting or applying the cleanup (the server) or where the choice is kept (the
 *   wizards).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Square, Wand2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { describeError } from '@/api/client';
import { previewCleanup } from '@/api/queries';
import type { Cleanup } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { Switch } from '@/components/ui/Field';
import { Slider } from '@/components/ui/Slider';
import { describeCleanup, isActive, NO_CLEANUP, sameCleanup } from './cleanup';
import { useClipPlayer } from './useClipPlayer';
import { blobId, readAsDataUrl, useDataUrl } from './useDataUrl';

interface CleanupPanelProps {
  recording: Blob;
  suggested: Cleanup | null;
  value: Cleanup;
  onChange: (cleanup: Cleanup) => void;
}

const percent = (value: number) => (value > 0 ? `${Math.round(value * 100)}%` : 'Off');
function decibels(value: number): string {
  if (value === 0) return 'Unchanged';
  return value > 0 ? `+${value} dB` : `${value} dB`;
}

function Setting({
  label,
  value,
  children,
}: Readonly<{ label: string; value: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-[13px] text-muted tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  );
}

function Suggestion({
  suggested,
  value,
  onChange,
}: Readonly<Pick<CleanupPanelProps, 'suggested' | 'value' | 'onChange'>>) {
  if (!suggested) {
    return (
      <p className="text-[13px] leading-snug text-muted">
        This recording needs no cleanup. If you hear something you’d like to fix, adjust it below.
      </p>
    );
  }
  const applied = sameCleanup(value, suggested);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[13px] leading-snug text-muted">
        Suggested for this recording: {describeCleanup(suggested)}.
      </p>
      <Button
        size="sm"
        variant="secondary"
        icon={<Wand2 size={14} />}
        disabled={applied}
        onClick={() => onChange(suggested)}
      >
        {applied ? 'Using the suggestion' : 'Use suggested'}
      </Button>
    </div>
  );
}

export function CleanupPanel({
  recording,
  suggested,
  value,
  onChange,
}: Readonly<CleanupPanelProps>) {
  const player = useClipPlayer();
  const client = useQueryClient();
  const original = useDataUrl(recording);
  const cleaned = useMutation({
    mutationFn: (cleanup: Cleanup) =>
      client.query({
        queryKey: ['cleanup-preview', blobId(recording), cleanup],
        queryFn: async () => readAsDataUrl(await previewCleanup(recording, cleanup)),
        staleTime: Infinity,
      }),
    onSuccess: (src) => player.toggle(src),
  });
  const set = (change: Partial<Cleanup>) => onChange({ ...value, ...change });
  const playingOriginal = original !== undefined && player.playing === original;
  const playingCleaned = player.playing !== null && !playingOriginal;

  return (
    <section
      aria-label="Clean up the recording"
      className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-line p-4"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold">Clean up the recording</h3>
        <p className="text-[13px] leading-snug text-muted">
          Your recording is kept as it is; the voice is made from a cleaned-up copy.
        </p>
      </div>
      <Suggestion suggested={suggested} value={value} onChange={onChange} />
      <Setting label="Background noise reduction" value={percent(value.noiseReduction)}>
        <Slider
          label="Background noise reduction"
          min={0}
          max={1}
          step={0.05}
          value={value.noiseReduction}
          valueText={percent}
          onChange={(noiseReduction) => set({ noiseReduction })}
        />
      </Setting>
      <Switch
        checked={value.lowCut}
        onCheckedChange={(lowCut) => set({ lowCut })}
        label="Filter out low rumble"
        description="Removes rumble below 80 Hz, like traffic, air conditioning or bumps on the desk."
      />
      <Setting label="Treble" value={decibels(value.trebleDb)}>
        <Slider
          label="Treble"
          min={-9}
          max={0}
          step={0.5}
          value={value.trebleDb}
          valueText={decibels}
          onChange={(trebleDb) => set({ trebleDb })}
        />
      </Setting>
      <Setting label="Low end" value={decibels(value.bassDb)}>
        <Slider
          label="Low end"
          min={0}
          max={6}
          step={0.5}
          value={value.bassDb}
          valueText={decibels}
          onChange={(bassDb) => set({ bassDb })}
        />
      </Setting>
      {cleaned.isError ? <Banner tone="error">{describeError(cleaned.error)}</Banner> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!original}
          icon={
            playingOriginal ? (
              <Square size={13} fill="currentColor" />
            ) : (
              <Play size={13} fill="currentColor" />
            )
          }
          onClick={() => original && player.toggle(original)}
        >
          {playingOriginal ? 'Stop' : 'Play original'}
        </Button>
        <Button
          size="sm"
          disabled={!isActive(value)}
          loading={cleaned.isPending}
          icon={
            playingCleaned ? (
              <Square size={13} fill="currentColor" />
            ) : (
              <Play size={13} fill="currentColor" />
            )
          }
          onClick={() =>
            playingCleaned ? player.toggle(player.playing as string) : cleaned.mutate(value)
          }
        >
          {playingCleaned ? 'Stop' : 'Play cleaned up'}
        </Button>
        {isActive(value) ? (
          <Button size="sm" variant="ghost" onClick={() => onChange(NO_CLEANUP)}>
            Turn cleanup off
          </Button>
        ) : null}
      </div>
    </section>
  );
}
