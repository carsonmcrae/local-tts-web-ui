// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Choose how one of the included books is read: standard, in its characters' voices, or immersive.
 * Scope: Shown in the reader for a document that is a bundled book with a reading preset. Asks what
 *   the preset offers this document and shows the experiences as a radio list: Standard (the reading
 *   voice throughout), Multi-voice (the narrator's suggested voice, each character in their own voice
 *   and the curated speaker lines) and, only once sound effects and music exist in this version,
 *   Immersive. Choosing one applies or removes the preset's components; the characters are listed
 *   with the voice each would get here or "not installed"; the suggested reading voice can be given
 *   to the player; the recommended music is named and nothing is turned on.
 * Does NOT belong: The reader's own cast dialog (CastDialog), playback, or the music and effects players.
 */
import { Sparkles } from 'lucide-react';
import { describeError } from '@/api/client';
import {
  useApplyReadingPreset,
  useReadingPreset,
  useRemoveReadingPreset,
} from '@/api/presetQueries';
import { useVoices } from '@/api/queries';
import type { PresetComponent, ReadingPreset, VoiceInfo } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Badge, Banner } from '@/components/ui/Feedback';
import { OptionList } from '@/components/ui/Menu';
import { voiceLabel } from './StyleSentencesDialog';

type Experience = 'standard' | 'voices' | 'immersive';
const VOICE_PARTS: readonly PresetComponent[] = ['narrator', 'characters', 'speakers'];
const IMMERSIVE_PARTS: readonly PresetComponent[] = ['effects', 'music'];

/** Which experience the applied components amount to. */
function currentExperience(preset: ReadingPreset): Experience {
  const applied = preset.components.filter((c) => c.applied).map((c) => c.name);
  if (applied.some((name) => IMMERSIVE_PARTS.includes(name))) return 'immersive';
  return applied.length ? 'voices' : 'standard';
}

const trackName = (trackId: string) =>
  trackId.replace(/-/g, ' ').replace(/^./, (first) => first.toUpperCase());

export function ReadingExperience({
  documentId,
  bundledWorkId,
  onChanged,
  onVoice,
}: Readonly<{
  documentId: string;
  bundledWorkId: string | null | undefined;
  onChanged: () => void;
  onVoice: (voiceId: string) => void;
}>) {
  const preset = useReadingPreset(documentId, Boolean(bundledWorkId));
  const voices = useVoices();
  const apply = useApplyReadingPreset(documentId);
  const remove = useRemoveReadingPreset(documentId);
  const report = preset.data;
  if (!bundledWorkId || !report) return null;
  const offered = report.components;
  const voiceParts = VOICE_PARTS.filter((part) => offered.some((c) => c.name === part));
  const immersiveReady =
    offered.some((c) => IMMERSIVE_PARTS.includes(c.name)) && offered.every((c) => c.available);
  const busy = apply.isPending || remove.isPending;
  const known = new Map<string, VoiceInfo>((voices.data ?? []).map((voice) => [voice.id, voice]));
  const label = (voiceId: string | null) => {
    if (!voiceId) return 'not installed here';
    const voice = known.get(voiceId);
    return voice ? voiceLabel(voice) : voiceId;
  };
  const choose = (experience: Experience) => {
    if (busy) return;
    const done = { onSuccess: onChanged };
    if (experience === 'standard') remove.mutate(undefined, done);
    else apply.mutate(experience === 'voices' ? [...voiceParts] : offered.map((c) => c.name), done);
  };
  const options: { value: Experience; label: string; hint: string }[] = [
    { value: 'standard', label: 'Standard', hint: 'Your reading voice throughout.' },
    { value: 'voices', label: 'Multi-voice', hint: 'Each character in their own voice.' },
  ];
  if (immersiveReady)
    options.push({
      value: 'immersive',
      label: 'Immersive',
      hint: 'Voices, sound effects and music.',
    });
  const error = apply.error ?? remove.error;
  const narrator = report.narrator;

  return (
    <section
      aria-label="Reading experience"
      aria-busy={busy}
      className="bg-surface-1 mb-6 rounded-[var(--radius)] border border-line p-4 text-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-1.5 font-semibold">
            <Sparkles size={14} aria-hidden="true" /> {report.title}
          </h2>
          <p className="mt-1 leading-relaxed text-muted">{report.summary}</p>
        </div>
        <OptionList
          options={options}
          value={currentExperience(report)}
          onSelect={choose}
          label="Reading experience"
        />
      </div>
      {error ? (
        <Banner tone="error" className="mt-3">
          {describeError(error)}
        </Banner>
      ) : null}
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {narrator ? (
          <div>
            <dt className="text-muted">Suggested reading voice</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span>{label(narrator.chosen)}</span>
              {narrator.chosen ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onVoice(narrator.chosen as string)}
                >
                  Use this voice
                </Button>
              ) : null}
            </dd>
          </div>
        ) : null}
        {report.musicTrackId ? (
          <div>
            <dt className="text-muted">Music</dt>
            <dd>
              {trackName(report.musicTrackId)} is recommended. Music stays off until you turn it on
              in the player.
            </dd>
          </div>
        ) : null}
      </dl>
      {report.characters.length ? (
        <ul aria-label="Characters in this experience" className="mt-3 flex flex-wrap gap-1.5">
          {report.characters.map((character) => (
            <li key={character.id}>
              <Badge>
                {character.name}
                {character.lines ? ` · ${character.lines} lines` : ''} ·{' '}
                {label(character.voice.chosen)}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {report.editionMatches ? null : (
        <p className="mt-2 text-xs text-subtle">
          This copy is a different edition from the one the experience was made for, so only
          sentences that match it exactly are used.
        </p>
      )}
      {offered
        .filter((c) => !c.available)
        .map((c) => (
          <p key={c.name} className="mt-2 text-xs text-subtle">
            {c.note}
          </p>
        ))}
    </section>
  );
}
