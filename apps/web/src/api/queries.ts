/**
 * Purpose: TanStack Query hooks and mutations for every server resource.
 * Scope: Query keys, polling for in-progress jobs, cache invalidation after mutations, and raw-body
 *   uploads (documents, voice recordings). One place to see how the UI stays in sync with the server.
 * Does NOT belong: Presentation or playback state.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type {
  DocumentDetail,
  DocumentSummary,
  EngineInfo,
  ExportRequest,
  JobOut,
  Preferences,
  QualityReport,
  SectionContent,
  SystemInfo,
  VoiceInfo,
  VoiceProfile,
} from './types';

export const keys = {
  documents: ['documents'] as const,
  document: (id: string) => ['documents', id] as const,
  section: (id: string, index: number) => ['documents', id, 'sections', index] as const,
  voices: ['voices'] as const,
  engines: ['engines'] as const,
  job: (id: string) => ['jobs', id] as const,
  jobs: ['jobs'] as const,
  preferences: ['preferences'] as const,
  system: ['system'] as const,
  profiles: ['voice-profiles'] as const,
};

const ACTIVE_JOB = new Set(['queued', 'running']);
const POLL_MS = 1000;

export function useDocuments() {
  return useQuery({ queryKey: keys.documents, queryFn: () => api<DocumentSummary[]>('/api/documents') });
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
    refetchInterval: (query) => (query.state.data && !ACTIVE_JOB.has(query.state.data.status) ? false : POLL_MS),
  });
}

export function isJobActive(job: JobOut | undefined): boolean {
  return Boolean(job && ACTIVE_JOB.has(job.status));
}

export function useJobs() {
  return useQuery({ queryKey: keys.jobs, queryFn: () => api<JobOut[]>('/api/jobs') });
}

export function usePreferences() {
  return useQuery({ queryKey: keys.preferences, queryFn: () => api<Preferences>('/api/preferences') });
}

export function useSystem() {
  return useQuery({ queryKey: keys.system, queryFn: () => api<SystemInfo>('/api/system') });
}

export function useProfiles() {
  return useQuery({ queryKey: keys.profiles, queryFn: () => api<VoiceProfile[]>('/api/voice-profiles') });
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
    mutationFn: (prefs: Preferences) => api<Preferences>('/api/preferences', { method: 'PUT', json: prefs }),
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
    mutationFn: (request: ExportRequest) => api<JobOut>('/api/exports', { method: 'POST', json: request }),
  });
}

export function useClearCache() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ removedEntries: number }>('/api/system/cache/clear', { method: 'POST' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.system }),
  });
}

export function analyzeRecording(wav: Blob) {
  return api<QualityReport>('/api/voice-profiles/analyze', { method: 'POST', body: wav });
}

export function useCreateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; wav: Blob; source: 'recording' | 'import' }) =>
      api<VoiceProfile>('/api/voice-profiles', {
        method: 'POST',
        query: { name: input.name, consent: true, source: input.source },
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

export function useRenameProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      api<VoiceProfile>(`/api/voice-profiles/${input.id}`, { method: 'PATCH', json: { name: input.name } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.profiles });
      void client.invalidateQueries({ queryKey: keys.voices });
    },
  });
}
