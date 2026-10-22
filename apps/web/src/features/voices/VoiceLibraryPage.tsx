// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Browse, compare and choose voices.
 * Scope: Search and filters (language, gender, built-in/custom), a shared comparison passage so
 *   every preview says the same thing, voice cards with previews, and setting the reading voice
 *   (applied to the player immediately and saved as the default); blending built-in voices into a
 *   new one (BlendVoices); the full credits of every voice source, once (VoiceCredits).
 * Does NOT belong: Creating custom voices (Voice Studio).
 */
import { AudioLines, Mic, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { describeError } from '@/api/client';
import { usePreferences, useVoices } from '@/api/queries';
import type { VoiceInfo } from '@/api/types';
import { buttonClasses } from '@/components/ui/Button';
import { Banner, EmptyState, Skeleton, StatusRegion } from '@/components/ui/Feedback';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';
import { DefaultVoicesBanner } from '@/features/engines/EngineSetup';
import { useReadingVoice } from '@/features/player/useReadingVoice';
import { BlendVoices } from './BlendVoices';
import { useVoicePreview } from './useVoicePreview';
import { VoiceCard } from './VoiceCard';
import { VoiceCredits } from './VoiceCredits';

export interface VoiceFilters {
  query: string;
  language: string;
  gender: string;
  source: 'all' | 'built-in' | 'custom';
}

export function filterVoices(voices: readonly VoiceInfo[], filters: VoiceFilters): VoiceInfo[] {
  const needle = filters.query.trim().toLowerCase();
  return voices.filter(
    (voice) =>
      (!needle ||
        `${voice.name} ${voice.language} ${voice.engineId}`.toLowerCase().includes(needle)) &&
      (filters.language === 'all' || voice.language === filters.language) &&
      (filters.gender === 'all' || voice.gender === filters.gender) &&
      (filters.source === 'all' || voice.category === filters.source),
  );
}

/** Loading, error and no-match states around the voice grid. */
function VoiceResults({
  voices,
  shown,
  children,
}: Readonly<{ voices: ReturnType<typeof useVoices>; shown: number; children: ReactNode }>) {
  if (voices.isPending) {
    return (
      <StatusRegion
        label="Loading voices"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton key={key} className="h-40" />
        ))}
      </StatusRegion>
    );
  }
  if (voices.isError) {
    return (
      <Banner tone="error" title="Couldn't load voices">
        {describeError(voices.error)}
      </Banner>
    );
  }
  if (shown === 0) {
    return (
      <EmptyState icon={<AudioLines size={26} />} title="No voices match these filters">
        Try clearing the search or choosing another language.
      </EmptyState>
    );
  }
  return children;
}

export default function VoiceLibraryPage() {
  const voices = useVoices();
  const preferences = usePreferences();
  const reading = useReadingVoice();
  const preview = useVoicePreview();
  const toast = useToast();
  const [filters, setFilters] = useState<VoiceFilters>({
    query: '',
    language: 'all',
    gender: 'all',
    source: 'all',
  });
  const [passage, setPassage] = useState('');
  const all = useMemo(() => voices.data ?? [], [voices.data]);
  const languages = useMemo(
    () => [...new Set(all.map((voice) => voice.language))].sort((a, b) => a.localeCompare(b)),
    [all],
  );
  const shown = useMemo(() => filterVoices(all, filters), [all, filters]);
  const defaultVoice = reading.current;

  const use = (voice: VoiceInfo) => {
    reading.choose(voice.id);
    toast.notify('success', `${voice.name} is now your reading voice`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title="Voices"
        description="Preview and compare voices on the same passage. Everything is generated on this computer."
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <BlendVoices voices={all} />
            <Link to="/studio" className={buttonClasses('secondary')}>
              <Mic size={16} /> Create your own voice
            </Link>
          </div>
        }
      />
      <DefaultVoicesBanner />
      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="grid content-start gap-3 sm:grid-cols-4">
          <Field label="Search voices" className="sm:col-span-4">
            {({ id }) => (
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
                />
                <Input
                  id={id}
                  placeholder="Search by name or language"
                  className="pl-9"
                  value={filters.query}
                  onChange={(event) => setFilters({ ...filters, query: event.target.value })}
                />
              </div>
            )}
          </Field>
          <Field label="Language" className="sm:col-span-2">
            {({ id }) => (
              <Select
                id={id}
                value={filters.language}
                onChange={(event) => setFilters({ ...filters, language: event.target.value })}
              >
                <option value="all">All languages</option>
                {languages.map((language) => (
                  <option key={language}>{language}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Gender">
            {({ id }) => (
              <Select
                id={id}
                value={filters.gender}
                onChange={(event) => setFilters({ ...filters, gender: event.target.value })}
              >
                <option value="all">Any</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </Select>
            )}
          </Field>
          <Field label="Source">
            {({ id }) => (
              <Select
                id={id}
                value={filters.source}
                onChange={(event) =>
                  setFilters({ ...filters, source: event.target.value as VoiceFilters['source'] })
                }
              >
                <option value="all">All voices</option>
                <option value="built-in">Built-in</option>
                <option value="custom">Your voices</option>
              </Select>
            )}
          </Field>
        </div>
        <Field
          label="Comparison passage"
          hint="Leave empty to use the standard sample. Up to 400 characters."
        >
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              maxLength={400}
              value={passage}
              onChange={(event) => setPassage(event.target.value)}
              placeholder="The lighthouse keeper climbed the spiral stairs…"
              // Side by side, the box runs from the top of the search field to the bottom of the
              // filters: two 2.5rem controls, a 0.75rem gap, a 1.25rem label and its 0.375rem gap.
              className="min-h-[7.5rem] font-serif lg:h-[7.375rem] lg:min-h-0 lg:resize-none"
            />
          )}
        </Field>
      </div>

      <VoiceResults voices={voices} shown={shown.length}>
        <p className="mb-3 text-[13px] text-muted" aria-live="polite">
          Showing {shown.length} of {all.length} voices. Grades are the upstream model's own quality
          ratings (A is best).
        </p>
        {/* grid-cols-1, not the implicit auto column, so a card's no-wrap line can't widen it past a 320 px screen */}
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((voice) => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              isDefault={voice.id === defaultVoice}
              previewStatus={preview.state.voiceId === voice.id ? preview.state.status : 'idle'}
              previewError={
                preview.state.error?.voiceId === voice.id ? preview.state.error.message : undefined
              }
              onPreview={() => void preview.play(voice.id, passage, preferences.data?.pace ?? 1)}
              onStop={preview.stop}
              onUse={() => use(voice)}
            />
          ))}
        </ul>
      </VoiceResults>
      <VoiceCredits voices={all} />
    </div>
  );
}
