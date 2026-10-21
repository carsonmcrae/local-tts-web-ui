// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Fine-tune a studio voice on the takes it kept, and compare before keeping the result.
 * Scope: Explains and starts the fine-tune (a background job with progress), plays each comparison
 *   sentence as the voice reads it now and fine-tuned, keeps or discards the result, and removes a
 *   kept fine-tune; refreshes the voice whenever that changes.
 * Does NOT belong: Training (the server and the cloning engine) or the rest of the profile card.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Check, Play, Sparkles, Square, Undo2, X } from 'lucide-react';
import { describeError } from '@/api/client';
import { isJobActive, keys, useJob } from '@/api/queries';
import {
  tuningSampleUrl,
  useStartTuning,
  useTuningDecision,
  type TuningArm,
} from '@/api/studioQueries';
import type { VoiceProfile } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { JobProgress } from '@/features/jobs/JobProgress';
import { useJobSucceeded } from '@/features/jobs/useJobSucceeded';
import { useClipPlayer } from './useClipPlayer';

const ARMS: readonly { arm: TuningArm; label: string }[] = [
  { arm: 'current', label: 'Now' },
  { arm: 'tuned', label: 'Fine-tuned' },
];

type Candidate = NonNullable<VoiceProfile['tuning']>;
type Decide = ReturnType<typeof useTuningDecision>;

export function VoiceTuning({ profile }: Readonly<{ profile: VoiceProfile }>) {
  const start = useStartTuning();
  const decide = useTuningDecision();
  const job = useJob(start.data?.id);
  const client = useQueryClient();

  useJobSucceeded(job.data, () => {
    void client.invalidateQueries({ queryKey: keys.profiles });
  });

  if (!profile.canTune && !profile.fineTuned) return null;
  const running = isJobActive(job.data);
  const candidate = profile.tuning;
  const failure = start.error ?? decide.error;
  return (
    <div className="flex flex-col gap-2">
      {running && job.data ? <JobProgress job={job.data} label="Fine-tuning" /> : null}
      {!running && candidate ? (
        <Comparison profile={profile} candidate={candidate} decide={decide} />
      ) : null}
      {!running && !candidate ? (
        <>
          <p className="text-xs leading-relaxed text-muted">
            {profile.fineTuned
              ? 'Fine-tuned on this computer from the takes it kept, so it reads more like you.'
              : 'Experimental: fine-tune the voice on the takes it kept so it reads more like you. It takes a few minutes on an NVIDIA graphics card, and you compare the result before keeping it.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {profile.canTune ? (
              <Button
                size="sm"
                icon={<Sparkles size={14} />}
                loading={start.isPending}
                onClick={() => start.mutate(profile.id)}
              >
                {profile.fineTuned ? 'Fine-tune again' : 'Fine-tune this voice'}
              </Button>
            ) : null}
            {profile.fineTuned ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<Undo2 size={14} />}
                loading={decide.isPending}
                onClick={() => decide.mutate({ id: profile.id, decision: 'remove' })}
              >
                Remove fine-tune
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {job.data?.status === 'failed' ? <Banner tone="error">{job.data.message}</Banner> : null}
      {failure ? <Banner tone="error">{describeError(failure)}</Banner> : null}
    </div>
  );
}

function Comparison({
  profile,
  candidate,
  decide,
}: Readonly<{ profile: VoiceProfile; candidate: Candidate; decide: Decide }>) {
  const player = useClipPlayer();
  const percent = Math.max(Math.round(candidate.gain * 100), 1);
  const choosing = decide.isPending ? decide.variables.decision : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-muted">
        The fine-tune came {percent}% closer to how you read passages it didn’t train on. Listen to
        each sentence as the voice reads it now and fine-tuned, then keep it or discard it.
      </p>
      <ul className="flex flex-col gap-1.5">
        {candidate.texts.map((text, index) => (
          <li key={text} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13px]" title={text}>
              {text}
            </span>
            {ARMS.map(({ arm, label }) => {
              const src = tuningSampleUrl(profile.id, arm, index);
              const playing = player.playing === src;
              return (
                <Button
                  key={arm}
                  size="sm"
                  variant="ghost"
                  aria-label={`${playing ? 'Stop' : 'Play'} sentence ${index + 1}, ${label.toLowerCase()}`}
                  icon={
                    playing ? (
                      <Square size={12} fill="currentColor" />
                    ) : (
                      <Play size={12} fill="currentColor" />
                    )
                  }
                  onClick={() => player.toggle(src)}
                >
                  {label}
                </Button>
              );
            })}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          icon={<Check size={14} />}
          loading={choosing === 'keep'}
          disabled={choosing !== null}
          onClick={() => decide.mutate({ id: profile.id, decision: 'keep' })}
        >
          Keep fine-tune
        </Button>
        <Button
          size="sm"
          icon={<X size={14} />}
          loading={choosing === 'discard'}
          disabled={choosing !== null}
          onClick={() => decide.mutate({ id: profile.id, decision: 'discard' })}
        >
          Discard
        </Button>
      </div>
    </div>
  );
}
