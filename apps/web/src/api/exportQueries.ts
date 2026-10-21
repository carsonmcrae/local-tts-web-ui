// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks for audiobook exports, a document's audiobook details and the
 *   optional Audiobookshelf connection.
 * Scope: Starting an export; listing recent exports (polled while one is running); what a stopped
 *   export has saved; pausing, cancelling, resuming and deleting one; sending a finished file to
 *   Audiobookshelf; reading and saving the author, narrator, description and cover; and reading,
 *   saving, testing and forgetting the Audiobookshelf settings (the API key is only ever sent).
 * Does NOT belong: Presentation, or the generic job polling (`useJob` in queries.ts).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { isJobActive, keys } from './queries';
import type {
  AudiobookDetails,
  AudiobookDetailsInput,
  ExportOut,
  ExportRequest,
  JobOut,
  ShelfLibrary,
  ShelfSettings,
  ShelfSettingsInput,
} from './types';

export const exportKeys = {
  all: ['exports'] as const,
  one: (id: string) => ['exports', id] as const,
  details: (documentId: string) => ['documents', documentId, 'details'] as const,
  shelf: ['integrations', 'audiobookshelf'] as const,
};

// Slower than a single job's poll: every row counts its saved sentences on the server.
const LIST_POLL_MS = 2000;

/** Recent exports, newest first, refreshed while any of them is running. */
export function useExports() {
  return useQuery({
    queryKey: exportKeys.all,
    queryFn: () => api<ExportOut[]>('/api/exports'),
    refetchInterval: (query) =>
      query.state.data?.some((item) => isJobActive(item.job)) ? LIST_POLL_MS : false,
  });
}

/** What one export has saved; read when it stops (a running export reports progress instead). */
export function useExportDetail(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: exportKeys.one(id ?? ''),
    queryFn: () => api<ExportOut>(`/api/exports/${id}`),
    enabled: Boolean(id) && enabled,
  });
}

/** Caches the job an export call answered with and refreshes the export list. */
function useExportMutation<Input>(run: (input: Input) => Promise<JobOut>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (job) => {
      client.setQueryData(keys.job(job.id), job);
      void client.invalidateQueries({ queryKey: exportKeys.all });
    },
  });
}

export function useStartExport() {
  return useExportMutation((request: ExportRequest) =>
    api<JobOut>('/api/exports', { method: 'POST', json: request }),
  );
}

/** Pause keeps the saved sentences, cancel discards them, resume carries on under the same job. */
export function useExportAction(action: 'pause' | 'cancel' | 'resume') {
  return useExportMutation((exportId: string) =>
    api<JobOut>(`/api/exports/${exportId}/${action}`, { method: 'POST' }),
  );
}

export function useDeleteExport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (exportId: string) => api<void>(`/api/exports/${exportId}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: exportKeys.all }),
  });
}

/** Starts the upload of a finished single-file export; answers with the upload's own job. */
export function useSendToShelf() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (exportId: string) =>
      api<JobOut>(`/api/exports/${exportId}/audiobookshelf`, { method: 'POST' }),
    onSuccess: (job) => client.setQueryData(keys.job(job.id), job),
  });
}

// -- audiobook details -------------------------------------------------------

export function useAudiobookDetails(documentId: string, enabled = true) {
  return useQuery({
    queryKey: exportKeys.details(documentId),
    queryFn: () => api<AudiobookDetails>(`/api/documents/${documentId}/details`),
    enabled,
  });
}

/** A details change whose answer replaces the cached details. */
function useDetailsMutation<Input>(documentId: string, run: (input: Input) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => client.invalidateQueries({ queryKey: exportKeys.details(documentId) }),
  });
}

export function useSaveDetails(documentId: string) {
  return useDetailsMutation(documentId, (details: AudiobookDetailsInput) =>
    api<AudiobookDetails>(`/api/documents/${documentId}/details`, { method: 'PUT', json: details }),
  );
}

/** Uploads a JPEG or PNG as the raw request body (the server checks its first bytes). */
export function useUploadCover(documentId: string) {
  return useDetailsMutation(documentId, (image: Blob) =>
    api<AudiobookDetails>(`/api/documents/${documentId}/cover`, { method: 'PUT', body: image }),
  );
}

export function useRemoveCover(documentId: string) {
  return useDetailsMutation<void>(documentId, () =>
    api<void>(`/api/documents/${documentId}/cover`, { method: 'DELETE' }),
  );
}

// -- Audiobookshelf ----------------------------------------------------------

export function useShelfSettings(enabled = true) {
  return useQuery({
    queryKey: exportKeys.shelf,
    queryFn: () => api<ShelfSettings>('/api/integrations/audiobookshelf'),
    enabled,
  });
}

/** Whether a finished export can be sent: an address, a key, a library and a folder are saved. */
export function isShelfReady(settings: ShelfSettings | undefined): boolean {
  return Boolean(
    settings?.configured && settings.hasKey && settings.libraryId && settings.folderId,
  );
}

export function useSaveShelf() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ShelfSettingsInput) =>
      api<ShelfSettings>('/api/integrations/audiobookshelf', { method: 'PUT', json: input }),
    onSuccess: (settings) => client.setQueryData(exportKeys.shelf, settings),
  });
}

export function useForgetShelf() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/api/integrations/audiobookshelf', { method: 'DELETE' }),
    onSuccess: () =>
      client.setQueryData<ShelfSettings>(exportKeys.shelf, { configured: false, hasKey: false }),
  });
}

/** Checks the saved address and key by listing the libraries and folders the key can upload to. */
export function useTestShelf() {
  return useMutation({
    mutationFn: () =>
      api<ShelfLibrary[]>('/api/integrations/audiobookshelf/test', { method: 'POST' }),
  });
}
