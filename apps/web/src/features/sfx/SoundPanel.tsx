// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The reader's Sounds panel: turn effects on, set their level and intensity, analyse a
 *   chapter, review suggestions and manage the effects placed in the document.
 * Scope: The switch (off for every narration), volume, the three intensities, "Analyse this
 *   chapter" with its result, "Add an effect" at the sentence being read (or the chapter's first),
 *   the list of suggestions (accept, dismiss, replace, preview, and a quiet "Accept all"), the list
 *   of placed effects (on or off, adjust, replace, remove, preview), notices from playback, and the
 *   empty state. Loading and error states for the arrangement.
 * Does NOT belong: Rows (EffectRows), the library (SoundLibraryDialog), adjusting (EffectDialog),
 *   or when effects play (session.ts).
 */
import { Plus, Sparkles } from 'lucide-react';
import { useId, useState } from 'react';
import { describeError } from '@/api/client';
import type { SectionOut, SfxAnalysis, SfxEffect, SfxSound } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner, Skeleton, StatusRegion } from '@/components/ui/Feedback';
import { Switch } from '@/components/ui/Field';
import { Slider } from '@/components/ui/Slider';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import { EffectDialog } from './EffectDialog';
import { EffectRow, SuggestionRow } from './EffectRows';
import { INTENSITIES } from './preferences';
import {
  useAddSoundEffect,
  useAnalyseSection,
  useRemoveSoundEffect,
  useReviewSoundEffects,
  useSoundEffects,
  useSoundLibrary,
  useUpdateSoundEffect,
} from './queries';
import { useSfx } from './SfxProvider';
import { SoundLibraryDialog } from './SoundLibraryDialog';

const CHIP =
  'flex h-8 flex-1 cursor-pointer items-center justify-center rounded-full border px-2 text-[13px] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent';
const HEADING = 'text-xs font-semibold tracking-wide text-muted uppercase';
/** How many sentences an ambience added by hand plays under, at most. */
const HAND_AMBIENCE_SENTENCES = 10;

interface SoundPanelProps {
  documentId: string;
  sections: readonly SectionOut[];
  viewedSection: number;
  /** The sentence being read, when the player holds this document. */
  activeIndex: number | null;
  onJump: (segmentIndex: number, sectionIndex: number) => void;
}

type Picking = 'add' | SfxEffect | null;

interface Failing {
  isError: boolean;
  error: unknown;
  submittedAt: number;
}

/** The most recent failure among `mutations`, so a later error is never hidden behind an earlier one. */
export function latestError(mutations: readonly Failing[]): unknown {
  const failed = mutations.filter((mutation) => mutation.isError);
  failed.sort((a, b) => b.submittedAt - a.submittedAt);
  return failed[0]?.error;
}

function Controls() {
  const { sfx, state } = useSfx();
  const chips = useId();
  return (
    <div className="flex flex-col gap-4">
      <Switch
        checked={state.enabled}
        onCheckedChange={(enabled) => sfx.setEnabled(enabled)}
        label="Sound effects"
        description={
          state.enabled
            ? 'Playing with the narration.'
            : 'Off at the start of every narration. Suggestions and your effects wait here.'
        }
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium" aria-hidden="true">
            Effects volume
          </span>
          <span className="text-xs text-muted tabular-nums" aria-hidden="true">
            {state.volume}%
          </span>
        </div>
        <Slider
          label="Sound effects volume"
          min={0}
          max={100}
          value={state.volume}
          valueText={(value) => `${value}%`}
          onChange={(value) => sfx.setVolume(value)}
        />
      </div>
      <fieldset className="flex gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">Intensity</legend>
        {INTENSITIES.map((intensity) => (
          <label
            key={intensity.id}
            title={intensity.hint}
            className={cn(
              CHIP,
              intensity.id === state.intensity
                ? 'border-accent bg-accent-soft font-medium text-accent-text'
                : 'border-line text-muted hover:bg-surface-2 hover:text-text',
            )}
          >
            <input
              type="radio"
              name={chips}
              className="sr-only"
              checked={intensity.id === state.intensity}
              onChange={() => sfx.setIntensity(intensity.id)}
            />
            {intensity.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

function AnalysisNote({ result }: Readonly<{ result: SfxAnalysis | undefined }>) {
  if (!result) return null;
  const count = result.suggested;
  const found =
    count === 0
      ? 'Nothing worth adding in this chapter.'
      : `${pluralize(count, 'new suggestion')} for this chapter.`;
  const cut = result.truncated
    ? ` Only the first ${result.sentences} sentences were analysed.`
    : '';
  return (
    <StatusRegion className="text-[13px] text-muted">
      {found}
      {cut}
    </StatusRegion>
  );
}

/** What the sound library says when it opens to add a sound, or to replace one effect's sound. */
function libraryCopy(picking: Picking, activeIndex: number | null) {
  if (picking !== 'add') {
    return { title: 'Replace the sound', description: 'Pick another sound for this moment.' };
  }
  const where =
    activeIndex === null ? 'at the start of this chapter' : 'at the sentence being read';
  return {
    title: 'Add a sound effect',
    description: `It will be placed ${where}. You can move it afterwards.`,
  };
}

/** A fresh library each time it opens: the last search and category are not kept. */
function libraryKey(picking: Picking): string {
  if (picking === null) return 'closed';
  return picking === 'add' ? 'add' : picking.id;
}

interface ListProps {
  documentId: string;
  effects: readonly SfxEffect[];
  nameOf: (effect: SfxEffect) => string;
  busy: boolean;
  onJump: (segmentIndex: number, sectionIndex: number) => void;
  onReplace: (effect: SfxEffect) => void;
}

/** The props a suggestion row and a placed row share: the effect, its sound, preview and jump. */
function useRowProps(
  nameOf: (effect: SfxEffect) => string,
  busy: boolean,
  onJump: ListProps['onJump'],
) {
  const { sfx, state } = useSfx();
  return (effect: SfxEffect) => ({
    effect,
    soundName: nameOf(effect),
    previewing: state.previewId === effect.soundId,
    busy,
    onJump: () => onJump(effect.segmentIndex, effect.sectionIndex),
    onPreview: () => sfx.preview(state.previewId === effect.soundId ? null : effect.soundId),
  });
}

function SuggestionList({
  documentId,
  effects,
  nameOf,
  busy,
  onJump,
  onReplace,
}: Readonly<ListProps>) {
  const review = useReviewSoundEffects(documentId);
  const pending = busy || review.isPending;
  const rowProps = useRowProps(nameOf, pending, onJump);
  if (effects.length === 0) return null;
  return (
    <section aria-labelledby="sfx-suggestions" className="flex flex-col gap-2">
      <h3 id="sfx-suggestions" className={HEADING}>
        Suggested
      </h3>
      <ol className="flex flex-col gap-2">
        {effects.map((effect) => (
          <SuggestionRow
            key={effect.id}
            {...rowProps(effect)}
            onAccept={() => review.mutate({ accept: [effect.id] })}
            onDismiss={() => review.mutate({ dismiss: [effect.id] })}
            onReplace={() => onReplace(effect)}
          />
        ))}
      </ol>
      {effects.length > 1 ? (
        <Button
          size="sm"
          variant="ghost"
          className="self-end"
          disabled={pending}
          onClick={() => review.mutate({ accept: effects.map((effect) => effect.id) })}
        >
          Accept all
        </Button>
      ) : null}
      {review.isError ? <Banner tone="error">{describeError(review.error)}</Banner> : null}
    </section>
  );
}

function PlacedList({ documentId, effects, nameOf, busy, onJump, onReplace }: Readonly<ListProps>) {
  const update = useUpdateSoundEffect(documentId);
  const remove = useRemoveSoundEffect(documentId);
  const [editing, setEditing] = useState<SfxEffect | undefined>();
  const pending = busy || update.isPending || remove.isPending;
  const rowProps = useRowProps(nameOf, pending, onJump);
  if (effects.length === 0) return null;
  const error = latestError([update, remove]);
  return (
    <section aria-labelledby="sfx-placed" className="flex flex-col gap-2">
      <h3 id="sfx-placed" className={HEADING}>
        In this document
      </h3>
      <ol className="flex flex-col gap-2">
        {effects.map((effect) => (
          <EffectRow
            key={effect.id}
            {...rowProps(effect)}
            onToggle={() => update.mutate({ id: effect.id, enabled: !effect.enabled })}
            onEdit={() => setEditing(effect)}
            onReplace={() => onReplace(effect)}
            onRemove={() => remove.mutate(effect.id)}
          />
        ))}
      </ol>
      {error ? <Banner tone="error">{describeError(error)}</Banner> : null}
      {editing ? (
        <EffectDialog
          key={editing.id}
          documentId={documentId}
          effect={editing}
          soundName={nameOf(editing)}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </section>
  );
}

/** Where a sound added by hand goes: the sentence being read, or the chapter's first sentence. */
export function placement(
  sections: readonly SectionOut[],
  viewedSection: number,
  activeIndex: number | null,
): { target: number; last: number } {
  const section = sections.find((entry) => entry.index === viewedSection);
  const target = activeIndex ?? section?.startSegment ?? 0;
  const last = section ? Math.max(section.startSegment + section.segmentCount - 1, target) : target;
  return { target, last };
}

export function SoundPanel({
  documentId,
  sections,
  viewedSection,
  activeIndex,
  onJump,
}: Readonly<SoundPanelProps>) {
  const { state } = useSfx();
  const library = useSoundLibrary(true);
  const arrangement = useSoundEffects(documentId);
  const analyse = useAnalyseSection(documentId);
  const add = useAddSoundEffect(documentId);
  const update = useUpdateSoundEffect(documentId);
  const [picking, setPicking] = useState<Picking>(null);
  const busy = add.isPending || update.isPending;
  const names = new Map((library.data?.sounds ?? []).map((sound) => [sound.id, sound.name]));
  const nameOf = (effect: SfxEffect) => names.get(effect.soundId) ?? effect.soundId;
  const effects = arrangement.data?.effects ?? [];
  const suggestions = effects.filter((effect) => effect.status === 'suggested');
  const placed = effects.filter((effect) => effect.status === 'accepted');
  const pick = (sound: SfxSound) => {
    const options = { onSuccess: () => setPicking(null) };
    if (picking === 'add') {
      const { target, last } = placement(sections, viewedSection, activeIndex);
      const untilSegment = sound.loop ? Math.min(target + HAND_AMBIENCE_SENTENCES - 1, last) : null;
      add.mutate(
        { segmentIndex: target, soundId: sound.id, position: 0, offsetMs: 0, untilSegment },
        options,
      );
      return;
    }
    // The library only opens to add a sound or to replace one effect's sound.
    update.mutate({ id: (picking as SfxEffect).id, soundId: sound.id }, options);
  };
  const error = latestError([add, update, analyse]);
  const lists = { documentId, nameOf, busy, onJump, onReplace: setPicking };
  const copy = libraryCopy(picking, activeIndex);

  return (
    <div className="flex flex-col gap-4">
      <Controls />
      <div className="flex flex-wrap gap-1.5">
        <Button
          size="sm"
          variant="secondary"
          icon={<Sparkles size={14} />}
          loading={analyse.isPending}
          onClick={() =>
            analyse.mutate({ sectionIndex: viewedSection, intensity: state.intensity })
          }
        >
          Analyse this chapter
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus size={14} />}
          onClick={() => setPicking('add')}
        >
          Add an effect
        </Button>
      </div>
      <AnalysisNote result={analyse.data} />
      {state.notice ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {state.notice.message}
        </p>
      ) : null}
      {error ? <Banner tone="error">{describeError(error)}</Banner> : null}
      {arrangement.isPending ? <Skeleton className="h-16" /> : null}
      {arrangement.isError ? (
        <Banner tone="error">{describeError(arrangement.error)}</Banner>
      ) : null}
      {arrangement.data && effects.length === 0 && !analyse.data ? (
        <p className="px-1 text-[13px] leading-snug text-muted">
          No sound effects yet. Analyse this chapter for suggestions, or add one by hand.
        </p>
      ) : null}
      <SuggestionList effects={suggestions} {...lists} />
      <PlacedList effects={placed} {...lists} />
      <SoundLibraryDialog
        key={libraryKey(picking)}
        open={picking !== null}
        onOpenChange={() => setPicking(null)}
        title={copy.title}
        description={copy.description}
        busy={busy}
        onPick={pick}
      />
    </div>
  );
}
