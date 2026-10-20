// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Build the studio voice from the session's takes.
 * Scope: An install prompt while the cloning engine is missing; otherwise the session's tone
 *   correction, if any, and starting the build job (or
 *   following one already running), its progress with cancel, failure and cancel messages, and moving
 *   on to the results when a build finishes.
 * Does NOT belong: Choosing a result (CandidatePicker) or recording.
 */
import { useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { describeError } from '@/api/client';
import { isJobActive, keys, useBuildVoice, useEngines, useJob } from '@/api/queries';
import type { VoiceSession } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { EnginePanel } from '@/features/engines/EngineSetup';
import { JobProgress } from '@/features/jobs/JobProgress';
import { describeCleanup } from '../cleanup';

export function BuildStep({
  session,
  onBuilt,
}: Readonly<{ session: VoiceSession; onBuilt: () => void }>) {
  const engines = useEngines();
  const build = useBuildVoice();
  const job = useJob(build.data?.id ?? session.buildJobId);
  const client = useQueryClient();
  const handled = useRef<string | null>(null);
  const engine = engines.data?.find((item) => item.supportsCloning);
  const usable = session.takes.filter((take) => take.quality.ok).length;

  useEffect(() => {
    const finished = job.data;
    if (finished?.status !== 'succeeded' || handled.current === finished.id) return;
    handled.current = finished.id;
    void client.invalidateQueries({ queryKey: keys.session(session.id) }).then(onBuilt);
  }, [job.data, client, session.id, onBuilt]);

  if (engine && engine.status !== 'ready') {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="info" title="Install the voice-cloning engine to build your voice">
          Your recordings are saved. Install the engine, then build.
        </Banner>
        <EnginePanel engine={engine} />
      </div>
    );
  }
  const running = isJobActive(job.data);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-muted">
        The app measures all {usable} usable takes, averages your voice across them, then builds and
        tests a few voices from your best takes. This takes a minute or two with a GPU, longer on a
        CPU. Reading with other custom voices pauses while it runs.
      </p>
      {session.cleanup ? (
        <p className="text-sm leading-relaxed text-muted">
          Cleanup is on: the voice is built from copies of your takes with{' '}
          {describeCleanup(session.cleanup)}. Your recordings are kept as recorded.
        </p>
      ) : null}
      {running && job.data ? (
        <JobProgress job={job.data} label="Building your voice" />
      ) : (
        <div>
          <Button
            variant="primary"
            icon={<Sparkles size={15} />}
            loading={build.isPending}
            onClick={() => build.mutate({ sessionId: session.id })}
          >
            {session.candidates.length > 0 ? 'Build again' : 'Build my voice'}
          </Button>
        </div>
      )}
      {job.data?.status === 'failed' ? (
        <Banner tone="error" title="The build didn’t finish">
          {job.data.message}
        </Banner>
      ) : null}
      {job.data?.status === 'canceled' ? (
        <Banner tone="info">Build canceled. Your recordings are kept.</Banner>
      ) : null}
      {build.isError ? <Banner tone="error">{describeError(build.error)}</Banner> : null}
      {session.candidates.length > 0 && !running ? (
        <Banner tone="success" title="Your voice is built">
          Continue to listen to the results and choose one.
        </Banner>
      ) : null}
    </div>
  );
}
