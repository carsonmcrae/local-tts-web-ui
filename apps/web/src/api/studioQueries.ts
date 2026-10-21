// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: React Query hooks for what a finished custom voice can do beyond reading.
 * Scope: Building a studio voice's speaking styles from its kept takes (a background job).
 * Does NOT belong: Creating voices or sessions (queries.ts) or the HTTP client (client.ts).
 */
import { useMutation } from '@tanstack/react-query';
import { api } from './client';
import type { JobOut } from './types';

export function useBuildStyles() {
  return useMutation({
    mutationFn: (profileId: string) =>
      api<JobOut>(`/api/voice-profiles/${profileId}/styles`, { method: 'POST' }),
  });
}
