// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: TanStack Query hooks and mutations for every server resource.
 * Scope: Query keys, polling for in-progress jobs, cache invalidation after mutations, and raw-body
 *   uploads (documents, voice recordings, studio session takes). One place to see how the UI stays in
 *   sync with the server.
 * Does NOT belong: Presentation or playback state.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiBlob } from './client';
import type {
  Cleanup,
  Delivery,
  DocumentDetail,
  DocumentSummary,
  EngineInfo,
  ExportRequest,
  JobOut,
  Preferences,
  SectionContent,
  RecordingCheck,
  SystemInfo,
  SessionTake,
  VoiceInfo,
  VoiceProfile,
  VoiceSession,
} from './types';

export const keys = {
  documents: ['documents'] as const,
  document: (id: string) => ['documents', id] as const,
  section: (id: string, index: number) => ['documents', id, 'sections', index] as const,
  voices: ['voices'] as const,
  engines: ['engines'] as const,
  job: (id: string) => ['jobs', id] as const,
  preferences: ['preferences'] as const,
  system: ['system'] as const,
  profiles: ['voice-profiles'] as const,
  sessions: ['voice-sessions'] as const,
  session: (id: string) => ['voice-sessions', id] as const,
};

const ACTIVE_JOB = new Set(['queued', 'running']);
const POLL_MS = 1000;

export function useDocuments() {
  return useQuery({
    queryKey: keys.documents,
    queryFn: () => api<DocumentSummary[]>('/api/documents'),
  });
}

export function useDocument(id: string | undefined) {
  return useQuery({
    queryKey: keys.document(id ?? ''),
    queryFn: () => api<DocumentDetail>(`/api/documents/${id}`),
    enabled: Boolean(id),
  });
}

export function useSection(id: string | undefined, index: number | undefined) {
  return useQuery({
    queryKey: keys.section(id ?? '', index ?? -1),
    queryFn: () => api<SectionContent>(`/api/documents/${id}/sections/${index}`),
    enabled: Boolean(id) && index !== undefined && index >= 0,
    staleTime: Infinity,
  });
}

export function useVoices() {
  return useQuery({ queryKey: keys.voices, queryFn: () => api<VoiceInfo[]>('/api/voices') });
}

export function useEngines() {
  return useQuery({
    queryKey: keys.engines,
    queryFn: () => api<EngineInfo[]>('/api/engines'),
    refetchInterval: (query) =>
      query.state.data?.some((engine) => engine.status === 'installing') ? POLL_MS : false,
  });
}

export function useJob(id: string | null | undefined) {
  return useQuery({
    queryKey: keys.job(id ?? ''),
    queryFn: () => api<JobOut>(`/api/jobs/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data && !ACTIVE_JOB.has(query.state.data.status) ? false : POLL_MS,
  });
}

export function isJobActive(job: JobOut | undefined): boolean {
  return Boolean(job && ACTIVE_JOB.has(job.status));
}

export function usePreferences() {
  return useQuery({
    queryKey: keys.preferences,
    queryFn: () => api<Preferences>('/api/preferences'),
  });
}

export function useSystem() {
  return useQuery({ queryKey: keys.system, queryFn: () => api<SystemInfo>('/api/system') });
}

export function useProfiles() {
  return useQuery({
    queryKey: keys.profiles,
    queryFn: () => api<VoiceProfile[]>('/api/voice-profiles'),
  });
}

// -- mutations ---------------------------------------------------------------

export function useUploadDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      api<DocumentDetail>('/api/documents/upload', {
        method: 'POST',
        query: { filename: file.name },
        body: file,
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.documents }),
  });
}

export function usePasteText() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { text: string; title?: string }) =>
      api<DocumentDetail>('/api/documents/text', { method: 'POST', json: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.documents }),
  });
}

export function useUpdateSection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      documentId,
      index,
      ...changes
    }: {
      documentId: string;
      index: number;
      title?: string;
      startSegment?: number;
    }) =>
      api<DocumentDetail>(`/api/documents/${documentId}/sections/${index}`, {
        method: 'PATCH',
        json: changes,
      }),
    onSuccess: (doc) => {
      client.setQueryData(keys.document(doc.id), doc);
      void client.invalidateQueries({ queryKey: [...keys.document(doc.id), 'sections'] });
    },
  });
}

export function useDeleteDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.documents }),
  });
}

export function useSavePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Preferences) =>
      api<Preferences>('/api/preferences', { method: 'PUT', json: prefs }),
    onSuccess: (prefs) => client.setQueryData(keys.preferences, prefs),
  });
}

export function useInstallEngine() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { engineId: string; option?: string | undefined }) =>
      api<JobOut>(`/api/engines/${input.engineId}/install`, {
        method: 'POST',
        json: { option: input.option ?? null },
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.engines }),
  });
}

/**
 * Engine maintenance as a background job: `update` re-syncs the runtime to the app's current lock
 * (offered when `updateAvailable`); `repair` downloads damaged model files again (`needs_repair`).
 */
export function useEngineJob(action: 'update' | 'repair') {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (engineId: string) =>
      api<JobOut>(`/api/engines/${engineId}/${action}`, { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.engines }),
  });
}

export function useUninstallEngine() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (engineId: string) => api<void>(`/api/engines/${engineId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.engines });
      void client.invalidateQueries({ queryKey: keys.voices });
      void client.invalidateQueries({ queryKey: keys.system });
    },
  });
}

export function useCancelJob() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => api<JobOut>(`/api/jobs/${jobId}/cancel`, { method: 'POST' }),
    onSuccess: (job) => client.setQueryData(keys.job(job.id), job),
  });
}

export function useStartExport() {
  return useMutation({
    mutationFn: (request: ExportRequest) =>
      api<JobOut>('/api/exports', { method: 'POST', json: request }),
  });
}

export function useClearCache() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ removedEntries: number }>('/api/system/cache/clear', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.system }),
  });
}

export function analyzeRecording(wav: Blob) {
  return api<RecordingCheck>('/api/voice-profiles/analyze', { method: 'POST', body: wav });
}

/** A recording with a cleanup applied (noise reduction, rumble filter, tone), to compare by ear. */
export function previewCleanup(wav: Blob, cleanup: Cleanup) {
  return apiBlob('/api/voice-profiles/cleanup-preview', {
    method: 'POST',
    query: { ...cleanup },
    body: wav,
  });
}

export function useCreateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      wav: Blob;
      source: 'recording' | 'import';
      cleanup: Cleanup | null;
    }) =>
      api<VoiceProfile>('/api/voice-profiles', {
        method: 'POST',
        query: { name: input.name, consent: true, source: input.source, ...input.cleanup },
        body: input.wav,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profiles });
      void client.invalidateQueries({ queryKey: keys.voices });
    },
  });
}

export function useDeleteProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/voice-profiles/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profiles });
      void client.invalidateQueries({ queryKey: keys.voices });
    },
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...changes }: { id: string; name?: string; delivery?: Delivery }) =>
      api<VoiceProfile>(`/api/voice-profiles/${id}`, { method: 'PATCH', json: changes }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profiles });
      void client.invalidateQueries({ queryKey: keys.voices });
    },
  });
}

// -- studio voice sessions ---------------------------------------------------

export function useVoiceSessions() {
  return useQuery({
    queryKey: keys.sessions,
    queryFn: () => api<VoiceSession[]>('/api/voice-sessions'),
  });
}

export function useVoiceSession(id: string | null) {
  return useQuery({
    queryKey: keys.session(id ?? ''),
    queryFn: () => api<VoiceSession>(`/api/voice-sessions/${id}`),
    enabled: Boolean(id),
  });
}

export function checkMicrophone(wav: Blob) {
  return api<RecordingCheck>('/api/voice-sessions/microphone-check', { method: 'POST', body: wav });
}

/** A session mutation that refreshes that session and the session list when it succeeds. */
function useSessionMutation<Input extends { sessionId: string }, Result>(
  run: (input: Input) => Promise<Result>,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (_result, input) => {
      void client.invalidateQueries({ queryKey: keys.session(input.sessionId) });
      void client.invalidateQueries({ queryKey: keys.sessions, exact: true });
    },
  });
}

export function useCreateSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (cleanup: Cleanup | null) =>
      api<VoiceSession>('/api/voice-sessions', { method: 'POST', json: { cleanup } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.sessions, exact: true }),
  });
}

export function useSaveTake() {
  return useSessionMutation(
    (input: { sessionId: string; number: number; promptId: string; text: string; wav: Blob }) =>
      api<SessionTake>(`/api/voice-sessions/${input.sessionId}/takes/${input.number}`, {
        method: 'PUT',
        query: { promptId: input.promptId, text: input.text },
        body: input.wav,
      }),
  );
}

export function useImportRecording() {
  return useSessionMutation((input: { sessionId: string; file: Blob }) =>
    api<VoiceSession>(`/api/voice-sessions/${input.sessionId}/import`, {
      method: 'POST',
      body: input.file,
    }),
  );
}

export function useBuildVoice() {
  return useSessionMutation((input: { sessionId: string }) =>
    api<JobOut>(`/api/voice-sessions/${input.sessionId}/build`, { method: 'POST' }),
  );
}

export function useDeleteSession() {
  return useSessionMutation((input: { sessionId: string }) =>
    api<void>(`/api/voice-sessions/${input.sessionId}`, { method: 'DELETE' }),
  );
}

export function useFinishSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      ...choice
    }: {
      sessionId: string;
      candidate: number;
      name: string;
    }) =>
      api<VoiceProfile>(`/api/voice-sessions/${sessionId}/finish`, {
        method: 'POST',
        json: { ...choice, consent: true },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.sessions });
      void client.invalidateQueries({ queryKey: keys.profiles });
      void client.invalidateQueries({ queryKey: keys.voices });
    },
  });
}
