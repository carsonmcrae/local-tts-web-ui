// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Choose how selected sentences should sound.
 * Scope:
 *   - Always shown: voice (a character, an accent), effect (a loudspeaker announcement, a phone call,
 *     a radio, a quiet aside…) and a sound before the sentence (cloned voices only).
 *   - Under "More options": the speaking style for studio voices, a pause after the sentence and,
 *     for one sentence, its takes.
 *   - For several sentences, a choice that differs between them is kept unless changed.
 *   - "Clear styling" returns them to normal. The player then fetches the new audio.
 *   - "Skip when reading" leaves them out of playback and exports; "Read this sentence" brings back
 *     a skipped one (the cleanup's skips too).
 * Does NOT belong: Finding the selected sentences (SentenceStyling) or takes (TakePicker).
 */
import { EyeOff, Volume2 } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useVoices } from '@/api/queries';
import { useStyleSentences } from '@/api/stylingQueries';
import type {
  SentenceStyle,
  SentenceStyleChange,
  SoundEffect,
  SpeakingStyle,
  VoiceInfo,
  VoiceSound,
} from '@/api/types';
import { Button } from '@/components/ui/Button';
import { closeOnly, Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Field, Select } from '@/components/ui/Field';
import { EFFECT_LABELS, PAUSE_LABELS, SOUND_LABELS, STYLE_LABELS } from './stylingLabels';
import { TakePicker } from './TakePicker';

const KEEP = '__keep__';
const NONE = '__none__';
type Shared = 'voiceId' | 'effect' | 'sound' | 'style' | 'pauseMs';
type Choices = Readonly<Record<Shared, string>>;

/** The value all ``styles`` share for ``field`` (NONE when unset), or KEEP when they differ. */
function shared(styles: SentenceStyle[], field: Shared): string {
  const values = new Set(styles.map((style) => (style[field] ?? NONE).toString()));
  return values.size === 1 ? [...values][0]! : KEEP;
}

/** Only what the reader changed is sent, so nothing else about these sentences is touched. */
function changes(values: Choices, initial: Choices): Omit<SentenceStyleChange, 'indexes'> {
  const chosen = (value: string) => (value === NONE ? null : value);
  const changed = (field: Shared) => values[field] !== KEEP && values[field] !== initial[field];
  return {
    ...(changed('voiceId') ? { voiceId: chosen(values.voiceId) } : {}),
    ...(changed('effect') ? { effect: chosen(values.effect) as SoundEffect | null } : {}),
    ...(changed('sound') ? { sound: chosen(values.sound) as VoiceSound | null } : {}),
    ...(changed('style') ? { style: chosen(values.style) as SpeakingStyle | null } : {}),
    ...(changed('pauseMs')
      ? { pauseMs: values.pauseMs === NONE ? null : Number(values.pauseMs) }
      : {}),
  };
}

export function voiceLabel(voice: VoiceInfo): string {
  return voice.category === 'custom'
    ? `${voice.name} (custom)`
    : `${voice.name} · ${voice.language}`;
}

function KeepOption({ mixed }: Readonly<{ mixed: boolean }>) {
  return mixed ? <option value={KEEP}>Keep as they are (they differ)</option> : null;
}

/** A picker with "keep as they are" (when the sentences differ), "none" and the given options. */
function ChoiceField({
  label,
  hint,
  value,
  mixed,
  onChange,
  none,
  options,
}: Readonly<{
  label: string;
  hint: string;
  value: string;
  /** The sentences started out different here, so "keep as they are" stays on offer. */
  mixed: boolean;
  onChange: (value: string) => void;
  none: string;
  options: Readonly<Record<string, string>>;
}>) {
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <KeepOption mixed={mixed} />
          <option value={NONE}>{none}</option>
          {Object.entries(options).map(([option, text]) => (
            <option key={option} value={option}>
              {text}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function StyleSentencesDialog({
  documentId,
  indexes,
  styles,
  voiceId,
  onClose,
  onChanged,
}: Readonly<{
  documentId: string;
  indexes: number[];
  styles: ReadonlyMap<number, SentenceStyle>;
  /** The reading voice, for takes of one sentence. */
  voiceId: string;
  onClose: () => void;
  onChanged: () => void;
}>) {
  const voices = useVoices();
  const save = useStyleSentences(documentId);
  const current = indexes.map((index) => styles.get(index) ?? { index });
  const [initial] = useState(() => ({
    voiceId: shared(current, 'voiceId'),
    effect: shared(current, 'effect'),
    sound: shared(current, 'sound'),
    style: shared(current, 'style'),
    pauseMs: shared(current, 'pauseMs'),
  }));
  const [values, setValues] = useState(initial);
  const set = (field: Shared) => (value: string) => setValues({ ...values, [field]: value });
  const available = (voices.data ?? []).filter((item) => item.available);
  const single = indexes.length === 1 ? indexes[0] : undefined;
  const count = single === undefined ? `these ${indexes.length} sentences` : 'this sentence';
  const skipped = indexes.every((index) => Boolean(styles.get(index)?.skip));

  const apply = (change: Omit<SentenceStyleChange, 'indexes'>) =>
    save.mutate(
      { indexes, ...change },
      {
        onSuccess: () => {
          document.getSelection()?.removeAllRanges();
          onChanged();
          onClose();
        },
      },
    );
  const cleared = {
    voiceId: null,
    effect: null,
    sound: null,
    style: null,
    pauseMs: null,
    take: null,
  };

  return (
    <Dialog
      open
      onOpenChange={closeOnly(onClose)}
      title="Voice and effect"
      description={`How ${count} should sound. A voice or effect covers whole sentences; to voice only the quoted words, give the character a voice in Voices & effects.`}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              className="h-11 sm:h-10"
              onClick={() => apply(cleared)}
              disabled={save.isPending}
            >
              Clear styling
            </Button>
            <Button
              variant="ghost"
              className="h-11 sm:h-10"
              icon={skipped ? <Volume2 size={15} /> : <EyeOff size={15} />}
              title={skipped ? undefined : 'Left out when reading aloud and in exports'}
              onClick={() => apply({ skip: !skipped })}
              disabled={save.isPending}
            >
              {skipped ? `Read ${count}` : 'Skip when reading'}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              onClick={() => apply(changes(values, initial))}
            >
              Apply
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Voice"
          hint="A different voice or accent for a character. Your reading voice reads everything else."
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={values.voiceId}
              onChange={(event) => set('voiceId')(event.target.value)}
            >
              <KeepOption mixed={initial.voiceId === KEEP} />
              <option value={NONE}>The reading voice</option>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {voiceLabel(item)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <ChoiceField
          label="Effect"
          hint="For announcements, calls, broadcasts, asides, memories or a voice in another room."
          value={values.effect}
          mixed={initial.effect === KEEP}
          onChange={set('effect')}
          none="No effect"
          options={EFFECT_LABELS}
        />
        <ChoiceField
          label="Sound before it"
          hint="Experimental, and only with custom (cloned) voices; other voices ignore it."
          value={values.sound}
          mixed={initial.sound === KEEP}
          onChange={set('sound')}
          none="No sound"
          options={SOUND_LABELS}
        />
        <details className="group rounded-[var(--radius-md)] border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium select-none">More options</summary>
          <div className="mt-4 flex flex-col gap-4">
            <ChoiceField
              label="Speaking style"
              hint="For studio voices: read it like your recorded questions, lively lines or calm passages. Normally chosen from the text."
              value={values.style}
              mixed={initial.style === KEEP}
              onChange={set('style')}
              none="Chosen from the text"
              options={STYLE_LABELS}
            />
            <ChoiceField
              label="Pause after it"
              hint="Instead of the usual pause after this sentence."
              value={values.pauseMs}
              mixed={initial.pauseMs === KEEP}
              onChange={set('pauseMs')}
              none="The usual pause"
              options={PAUSE_LABELS}
            />
            {single === undefined ? null : (
              <TakePicker
                documentId={documentId}
                index={single}
                voiceId={
                  values.voiceId !== NONE && values.voiceId !== KEEP ? values.voiceId : voiceId
                }
                currentTake={styles.get(single)?.take ?? null}
                onChanged={onChanged}
              />
            )}
          </div>
        </details>
        {save.isError ? <Banner tone="error">{describeError(save.error)}</Banner> : null}
      </div>
    </Dialog>
  );
}
