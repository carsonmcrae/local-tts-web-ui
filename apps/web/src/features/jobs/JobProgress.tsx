// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Progress of a running background job, with a Cancel button.
 * Scope: Progress bar, the job's latest message (announced politely) and cancellation; shared by engine
 *   installs and studio voice builds.
 * Does NOT belong: Starting jobs or reacting to their result.
 */
import { useCancelJob } from '@/api/queries';
import type { JobOut } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/Feedback';

export function JobProgress({ job, label }: Readonly<{ job: JobOut; label: string }>) {
  const cancel = useCancelJob();
  return (
    <div className="flex flex-col gap-2">
      <ProgressBar value={job.progress} label={label} />
      <div className="flex items-center justify-between gap-3 text-[13px] text-muted">
        <span aria-live="polite" className="truncate">
          {job.message}
        </span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => cancel.mutate(job.id)}
          loading={cancel.isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
