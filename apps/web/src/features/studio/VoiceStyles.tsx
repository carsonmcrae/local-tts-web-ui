// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Show and improve how a studio voice reads different kinds of sentences.
 * Scope: Lists the speaking styles a studio voice has (questions, dialogue, lively lines,
 *   narration); for a voice saved before styles existed, offers to build them from its kept takes,
 *   shows the job's progress and refreshes the voice when it's done.
 * Does NOT belong: Building styles (the server) or the rest of the profile card.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Wand2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { describeError } from '@/api/client';
import { isJobActive, keys, useJob } from '@/api/queries';
import { useBuildStyles } from '@/api/studioQueries';
import type { VoiceProfile } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { JobProgress } from '@/features/jobs/JobProgress';

const LABELS: Readonly<Record<string, string>> = {
  narration: 'narration',
  question: 'questions',
  lively: 'lively lines',
  dialogue: 'dialogue',
};

export function VoiceStyles({ profile }: Readonly<{ profile: VoiceProfile }>) {
  const build = useBuildStyles();
  const job = useJob(build.data?.id);
  const client = useQueryClient();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const finished = job.data;
    if (finished?.status !== 'succeeded' || handled.current === finished.id) return;
    handled.current = finished.id;
    void client.invalidateQueries({ queryKey: keys.profiles });
    void client.invalidateQueries({ queryKey: keys.voices });
  }, [job.data, client]);

  if (profile.kind !== 'studio') return null;
  const running = isJobActive(job.data);
  const styles = profile.styles ?? [];
  return (
    <div className="flex flex-col gap-2">
      {styles.length > 0 ? (
        <p className="text-xs leading-relaxed text-muted">
          Reads {styles.map((style) => LABELS[style] ?? style).join(', ')} in your own style, learnt
          from the matching passages you recorded.
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-muted">
          This voice reads every sentence the same way. Improve its expression to teach it how you
          ask questions, talk in dialogue and sound lively, from the takes it kept.
        </p>
      )}
      {running && job.data ? <JobProgress job={job.data} label="Improving expression" /> : null}
      {!running ? (
        <div>
          <Button
            size="sm"
            icon={<Wand2 size={14} />}
            loading={build.isPending}
            onClick={() => build.mutate(profile.id)}
          >
            {styles.length > 0 ? 'Rebuild expression' : 'Improve expression'}
          </Button>
        </div>
      ) : null}
      {job.data?.status === 'failed' ? <Banner tone="error">{job.data.message}</Banner> : null}
      {build.isError ? <Banner tone="error">{describeError(build.error)}</Banner> : null}
    </div>
  );
}
