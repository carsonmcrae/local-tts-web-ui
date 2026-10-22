// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Run something once when a background job succeeds.
 * Scope: Calls ``onSucceeded`` the first time a job is seen in the ``succeeded`` state (never twice
 *   for the same job, even as polling re-renders), always with the latest callback.
 * Does NOT belong: Polling the job (``useJob``) or showing its progress (JobProgress).
 */
import { useEffect, useRef } from 'react';
import type { JobOut } from '@/api/types';

export function useJobSucceeded(job: JobOut | undefined, onSucceeded: () => void): void {
  const handled = useRef<string | null>(null);
  const callback = useRef(onSucceeded);
  useEffect(() => {
    callback.current = onSucceeded;
  });
  useEffect(() => {
    if (job?.status !== 'succeeded' || handled.current === job.id) return;
    handled.current = job.id;
    callback.current();
  }, [job]);
}
