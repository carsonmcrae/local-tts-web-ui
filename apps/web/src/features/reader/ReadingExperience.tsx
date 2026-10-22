// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Choose how one of the included books is read: standard, in its characters' voices, or immersive.
 * Scope: Shown in the reader for a document that is a bundled book with a reading preset. Asks what
 *   the preset offers this document and shows the experiences as a radio list: Standard (the reading
 *   voice throughout), Multi-voice (the narrator's suggested voice, each character in their own voice
 *   and the curated speaker lines) and Immersive (those, the book's sound effects placed in the Sounds
 *   panel, and the recommended music). Choosing one applies or removes the preset's components; the
 *   characters are listed with the voice each would get here or "not installed"; the suggested reading
 *   voice can be given to the player; the recommended music track is named from the music library and
 *   can be chosen for this device at the recommended level (Immersive chooses it too); the effects line
 *   says how many were placed. Neither music nor effects are ever turned on here.
 * Does NOT belong: The reader's own cast dialog (CastDialog), playback, or the music and effects players.
 */
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
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
import { TRACKS } from '@/features/music/library';
import { useMusic } from '@/features/music/MusicProvider';
import type { MusicSession } from '@/features/music/session';
import { voiceLabel } from './StyleSentencesDialog';

type Experience = 'standard' | 'voices' | 'immersive';
type PresetMusic = NonNullable<ReadingPreset['music']>;
const VOICE_PARTS: readonly PresetComponent[] = ['narrator', 'characters', 'speakers'];
const IMMERSIVE_PARTS: readonly PresetComponent[] = ['effects', 'music'];

/** Which experience the applied components amount to. */
function currentExperience(preset: ReadingPreset): Experience {
  const applied = preset.components.filter((c) => c.applied).map((c) => c.name);
  if (applied.some((name) => IMMERSIVE_PARTS.includes(name))) return 'immersive';
  return applied.length ? 'voices' : 'standard';
}

/** A radio label that never breaks across lines; the hint beside it may wrap on a phone. */
const name = (text: string): ReactNode => <span className="whitespace-nowrap">{text}</span>;

const trackOf = (music: PresetMusic) => TRACKS.find((track) => track.id === music.trackId);

/** Choose the recommended track and level on this device; music stays off until the reader turns it on. */
function acceptTrack(session: MusicSession, music: PresetMusic): void {
  if (!trackOf(music)) return;
  session.selectTrack(music.trackId);
  session.setVolume(music.volume);
}

function MusicRecommendation({ music }: Readonly<{ music: PresetMusic }>) {
  const { music: session, state } = useMusic();
  const track = trackOf(music);
  return (
    <div>
      <dt className="text-muted">Music</dt>
      <dd>
        <div className="flex flex-wrap items-center gap-2">
          {!track ? (
            <span>The recommended track isn't in this version's music library.</span>
          ) : state.trackId === track.id ? (
            <span>
              {track.title} is recommended at {music.volume}%.{' '}
              <span className="text-subtle">Chosen in the player.</span>
            </span>
          ) : (
            <>
              <span>
                {track.title} is recommended at {music.volume}%.
              </span>
              <Button variant="ghost" size="sm" onClick={() => acceptTrack(session, music)}>
                Use this track
              </Button>
            </>
          )}
        </div>
        <p className="text-xs text-subtle">
          {music.note ? `${music.note} ` : ''}Music stays off until you turn it on in the player.
        </p>
      </dd>
    </div>
  );
}

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
  const { music: session } = useMusic();
  const voices = useVoices();
  const apply = useApplyReadingPreset(documentId);
  const remove = useRemoveReadingPreset(documentId);
  const report = preset.data;
  if (!bundledWorkId || !report) return null;
  const offered = report.components;
  const voiceParts = VOICE_PARTS.filter((part) => offered.some((c) => c.name === part));
  const immersiveReady =
    offered.some((c) => IMMERSIVE_PARTS.includes(c.name)) && offered.every((c) => c.available);
  const effectsApplied = offered.some((c) => c.name === 'effects' && c.applied);
  const busy = apply.isPending || remove.isPending;
  const known = new Map<string, VoiceInfo>((voices.data ?? []).map((voice) => [voice.id, voice]));
  const label = (voiceId: string | null) => {
    if (!voiceId) return 'not installed here';
    const voice = known.get(voiceId);
    return voice ? voiceLabel(voice) : voiceId;
  };
  const choose = (experience: Experience) => {
    if (busy) return;
    const done = {
      onSuccess: () => {
        if (experience === 'immersive' && report.music) acceptTrack(session, report.music);
        onChanged();
      },
    };
    if (experience === 'standard') remove.mutate(undefined, done);
    else apply.mutate(experience === 'voices' ? [...voiceParts] : offered.map((c) => c.name), done);
  };
  const options: { value: Experience; label: ReactNode; hint: string }[] = [
    { value: 'standard', label: name('Standard'), hint: 'Your reading voice throughout.' },
    { value: 'voices', label: name('Multi-voice'), hint: 'Each character in their own voice.' },
  ];
  if (immersiveReady)
    options.push({
      value: 'immersive',
      label: name('Immersive'),
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
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
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
        {report.music ? <MusicRecommendation music={report.music} /> : null}
        {report.effects ? (
          <div>
            <dt className="text-muted">Sound effects</dt>
            <dd>
              {effectsApplied
                ? `${report.effectsPlaced} of ${report.effects} placed in the Sounds panel.`
                : `${report.effects} for the Sounds panel.`}{' '}
              {effectsApplied && report.effectsPlaced < report.effects
                ? 'The others were left out, for example where a sentence already has your own effect or the sound is still experimental. '
                : null}
              They stay off until you turn them on in the player.
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
