// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Give chosen sentences another voice (a character, an accent), an effect or a sound.
 * Scope: Watches the text selection in the reading view and, while sentences are selected, shows a
 *   floating "Voice & effect" button beside it; its dialog sets the voice, the effect (a loudspeaker
 *   announcement, a phone call, a radio…) and the sound before the sentence (cloned voices only) for
 *   every selected sentence, keeping what differs between them unless changed, or clears them. The
 *   player then fetches the new audio.
 * Does NOT belong: Applying effects or choosing voices for synthesis (the server) or the cast dialog.
 */
import { Sparkles } from 'lucide-react';
import { type RefObject, useEffect, useState } from 'react';
import { describeError } from '@/api/client';
import { useVoices } from '@/api/queries';
import { useStyleSentences } from '@/api/stylingQueries';
import type {
  SentenceStyle,
  SentenceStyleChange,
  SoundEffect,
  VoiceInfo,
  VoiceSound,
} from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Field, Select } from '@/components/ui/Field';
import { EFFECT_LABELS, SOUND_LABELS } from './stylingLabels';

const KEEP = '__keep__';
const NONE = '__none__';

/** The sentences a selection inside ``root`` touches, in reading order. */
export function selectedSentences(root: HTMLElement): number[] {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return [];
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return [];
  const sentence = document.createRange();
  return [...root.querySelectorAll<HTMLElement>('.reader-seg')]
    .filter((element) => {
      // The text itself, so a selection that only touches the sentence's edge doesn't count.
      sentence.selectNodeContents(element.firstChild ?? element);
      // The selection ends after the sentence starts, and starts before it ends.
      return (
        range.compareBoundaryPoints(Range.START_TO_END, sentence) > 0 &&
        range.compareBoundaryPoints(Range.END_TO_START, sentence) < 0
      );
    })
    .map((element) => Number(element.dataset.index));
}

interface Selected {
  indexes: number[];
  top: number;
  left: number;
}

function useSelectedSentences(root: RefObject<HTMLElement | null>): Selected | null {
  const [selected, setSelected] = useState<Selected | null>(null);
  useEffect(() => {
    const update = () => {
      const container = root.current;
      const indexes = container ? selectedSentences(container) : [];
      if (indexes.length === 0) {
        setSelected(null);
        return;
      }
      const range = document.getSelection()?.getRangeAt(0);
      const rect =
        typeof range?.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
      const left = rect ? rect.left + rect.width / 2 : 0;
      setSelected({
        indexes,
        top: Math.max((rect?.top ?? 0) - 48, 8),
        left: Math.min(Math.max(left, 96), window.innerWidth - 96),
      });
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [root]);
  return selected;
}

/** The value all ``styles`` share for ``field`` (NONE when unset), or KEEP when they differ. */
function shared(styles: SentenceStyle[], field: 'voiceId' | 'effect' | 'sound'): string {
  const values = new Set(styles.map((style) => style[field] ?? NONE));
  return values.size === 1 ? [...values][0]! : KEEP;
}

function voiceLabel(voice: VoiceInfo): string {
  return voice.category === 'custom'
    ? `${voice.name} (custom)`
    : `${voice.name} · ${voice.language}`;
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

function KeepOption({ mixed }: Readonly<{ mixed: boolean }>) {
  return mixed ? <option value={KEEP}>Keep as they are (they differ)</option> : null;
}

export function StyleSentencesDialog({
  documentId,
  indexes,
  styles,
  onClose,
  onChanged,
}: Readonly<{
  documentId: string;
  indexes: number[];
  styles: ReadonlyMap<number, SentenceStyle>;
  onClose: () => void;
  onChanged: () => void;
}>) {
  const voices = useVoices();
  const save = useStyleSentences(documentId);
  const current = indexes.map((index) => styles.get(index) ?? { index });
  const [initial] = useState(() => ({
    voice: shared(current, 'voiceId'),
    effect: shared(current, 'effect'),
    sound: shared(current, 'sound'),
  }));
  const [voice, setVoice] = useState(initial.voice);
  const [effect, setEffect] = useState(initial.effect);
  const [sound, setSound] = useState(initial.sound);
  const available = (voices.data ?? []).filter((item) => item.available);
  const count = indexes.length === 1 ? 'this sentence' : `these ${indexes.length} sentences`;

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
  const chosen = (value: string) => (value === NONE ? null : value);
  const change = {
    ...(voice === KEEP ? {} : { voiceId: chosen(voice) }),
    ...(effect === KEEP ? {} : { effect: chosen(effect) as SoundEffect | null }),
    ...(sound === KEEP ? {} : { sound: chosen(sound) as VoiceSound | null }),
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Voice and effect"
      description={`How ${count} should sound.`}
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <Button
            variant="ghost"
            onClick={() => apply({ voiceId: null, effect: null, sound: null })}
            disabled={save.isPending}
          >
            Clear styling
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" loading={save.isPending} onClick={() => apply(change)}>
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
              value={voice}
              onChange={(event) => setVoice(event.target.value)}
            >
              <KeepOption mixed={initial.voice === KEEP} />
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
          hint="For announcements, calls, broadcasts or a voice in another room."
          value={effect}
          mixed={initial.effect === KEEP}
          onChange={setEffect}
          none="No effect"
          options={EFFECT_LABELS}
        />
        <ChoiceField
          label="Sound before it"
          hint="Experimental, and only with custom (cloned) voices; other voices ignore it."
          value={sound}
          mixed={initial.sound === KEEP}
          onChange={setSound}
          none="No sound"
          options={SOUND_LABELS}
        />
        {save.isError ? <Banner tone="error">{describeError(save.error)}</Banner> : null}
      </div>
    </Dialog>
  );
}

/** A button floating beside the selected sentences that opens the styling dialog for them. */
export function SelectionStyler({
  documentId,
  root,
  styles,
  onChanged,
}: Readonly<{
  documentId: string;
  root: RefObject<HTMLElement | null>;
  styles: ReadonlyMap<number, SentenceStyle>;
  onChanged: () => void;
}>) {
  const selected = useSelectedSentences(root);
  const [editing, setEditing] = useState<number[] | null>(null);
  return (
    <>
      {selected && !editing ? (
        <div
          className="fixed z-40 -translate-x-1/2"
          style={{ top: selected.top, left: selected.left }}
        >
          <Button
            size="sm"
            variant="primary"
            icon={<Sparkles size={14} />}
            // Keep the selection: a mousedown would otherwise clear it before the click.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setEditing(selected.indexes)}
          >
            Voice & effect
            {selected.indexes.length > 1 ? ` (${selected.indexes.length})` : ''}
          </Button>
        </div>
      ) : null}
      {editing ? (
        <StyleSentencesDialog
          documentId={documentId}
          indexes={editing}
          styles={styles}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}
