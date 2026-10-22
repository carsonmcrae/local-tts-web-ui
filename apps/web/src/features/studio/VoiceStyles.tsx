// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Show and improve how a studio voice reads different kinds of sentences.
 * Scope: Lists the speaking styles a studio voice has (questions, dialogue, lively lines,
 *   narration); for a voice that kept its takes (and so can learn them), offers to build or rebuild
 *   them, shows the job's progress and refreshes the voice when it's done, and switches back to the
 *   expression it had before the last rebuild (and forward again) when that didn't sound better.
 * Does NOT belong: Building styles (the server) or the rest of the profile card.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Undo2, Wand2 } from 'lucide-react';
import { describeError } from '@/api/client';
import { isJobActive, keys, useJob } from '@/api/queries';
import { useBuildStyles, useRestoreStyles } from '@/api/studioQueries';
import type { VoiceProfile } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { JobProgress } from '@/features/jobs/JobProgress';
import { useJobSucceeded } from '@/features/jobs/useJobSucceeded';

const LABELS: Readonly<Record<string, string>> = {
  narration: 'narration',
  question: 'questions',
  lively: 'lively lines',
  dialogue: 'dialogue',
};

/** Build (or rebuild) the styles from the kept takes, and go back to the previous expression. */
function ExpressionActions({
  profile,
  rebuild,
  building,
  restoring,
  onBuild,
  onRestore,
}: Readonly<{
  profile: VoiceProfile;
  /** The voice has styles already. */
  rebuild: boolean;
  building: boolean;
  restoring: boolean;
  onBuild: () => void;
  onRestore: () => void;
}>) {
  return (
    <div className="flex flex-wrap gap-2">
      {profile.canRefine ? (
        <Button size="sm" icon={<Wand2 size={14} />} loading={building} onClick={onBuild}>
          {rebuild ? 'Rebuild expression' : 'Improve expression'}
        </Button>
      ) : null}
      {profile.hasPreviousStyles ? (
        <Button
          size="sm"
          variant="ghost"
          icon={<Undo2 size={14} />}
          loading={restoring}
          onClick={onRestore}
        >
          Switch to the previous expression
        </Button>
      ) : null}
    </div>
  );
}

export function VoiceStyles({ profile }: Readonly<{ profile: VoiceProfile }>) {
  const build = useBuildStyles();
  const restore = useRestoreStyles();
  const job = useJob(build.data?.id);
  const client = useQueryClient();

  useJobSucceeded(job.data, () => {
    void client.invalidateQueries({ queryKey: keys.profiles });
    void client.invalidateQueries({ queryKey: keys.voices });
  });

  const styles = profile.styles ?? [];
  if (profile.kind !== 'studio' || (!profile.canRefine && styles.length === 0)) return null;
  const running = isJobActive(job.data);
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
      {!running && (profile.canRefine || profile.hasPreviousStyles) ? (
        <ExpressionActions
          profile={profile}
          rebuild={styles.length > 0}
          building={build.isPending}
          restoring={restore.isPending}
          onBuild={() => build.mutate(profile.id)}
          onRestore={() => restore.mutate(profile.id)}
        />
      ) : null}
      {job.data?.status === 'failed' ? <Banner tone="error">{job.data.message}</Banner> : null}
      {build.isError ? <Banner tone="error">{describeError(build.error)}</Banner> : null}
      {restore.isError ? <Banner tone="error">{describeError(restore.error)}</Banner> : null}
    </div>
  );
}
