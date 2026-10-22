// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Act on what a reader selects in the text: style those sentences, add a sound effect to
 *   them, or fix how a word is said.
 * Scope: Watches the text selection in the reading view and, while sentences are selected, shows
 *   floating buttons beside it: "Voice & effect" opens the styling dialog for exactly those sentences
 *   (a selection that only touches a sentence's edge doesn't count), "Sound effect" opens the sound
 *   library and places the chosen sound at the first of them (a looping sound plays across all of
 *   them), and for a word or short phrase "Fix pronunciation" opens the pronunciation dialog for it.
 * Does NOT belong: The dialogs themselves (StyleSentencesDialog, SoundLibraryDialog,
 *   FixPronunciationDialog), the Sounds panel's own placement, or the cast dialog.
 */
import { AudioLines, Sparkles, Volume2 } from 'lucide-react';
import { type RefObject, useEffect, useState } from 'react';
import type { SentenceStyle, SfxSound } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { FixPronunciationDialog } from '@/features/pronunciation/FixPronunciationDialog';
import { selectedWord } from '@/features/pronunciation/pronunciationRules';
import { useAddSoundEffect } from '@/features/sfx/queries';
import { SoundLibraryDialog } from '@/features/sfx/SoundLibraryDialog';
import { StyleSentencesDialog } from './StyleSentencesDialog';

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
  first: number;
  last: number;
  text: string;
  top: number;
  left: number;
}

function useSelectedSentences(root: RefObject<HTMLElement | null>): Selected | null {
  const [selected, setSelected] = useState<Selected | null>(null);
  useEffect(() => {
    const update = () => {
      const container = root.current;
      const indexes = container ? selectedSentences(container) : [];
      const [first, ...more] = indexes;
      if (first === undefined) {
        setSelected(null);
        return;
      }
      const range = document.getSelection()?.getRangeAt(0);
      const rect =
        typeof range?.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null;
      const left = rect ? rect.left + rect.width / 2 : 0;
      setSelected({
        indexes,
        first,
        last: more.at(-1) ?? first,
        text: document.getSelection()?.toString() ?? '',
        top: Math.max((rect?.top ?? 0) - 48, 8),
        left: Math.min(Math.max(left, 160), window.innerWidth - 160),
      });
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [root]);
  return selected;
}

/** How many sentences after its own an effect may last (the server's `sfx.store.MAX_SPAN`). */
const MAX_SPAN = 60;

/** The sound library for the selected sentences: a pick is placed at the first of them. */
function SelectionSound({
  documentId,
  first,
  last,
  onClose,
}: Readonly<{ documentId: string; first: number; last: number; onClose: () => void }>) {
  const add = useAddSoundEffect(documentId);
  const pick = (sound: SfxSound) =>
    add.mutate(
      {
        segmentIndex: first,
        soundId: sound.id,
        position: 0,
        offsetMs: 0,
        // A looping sound plays across the selection, up to the longest span the server keeps; a
        // one-off plays once.
        untilSegment: sound.loop ? Math.min(last, first + MAX_SPAN) : null,
      },
      { onSuccess: onClose },
    );
  const where = last > first ? 'the first selected sentence' : 'this sentence';
  return (
    <SoundLibraryDialog
      open
      onOpenChange={onClose}
      title="Add a sound effect"
      description={`It will play at the start of ${where}; you can move or remove it in the Sounds panel. Turn sound effects on in the audio mixer to hear it.`}
      busy={add.isPending}
      onPick={pick}
      error={add.isError ? add.error : undefined}
    />
  );
}

/** Buttons floating beside the selected sentences: style them, add a sound, or fix a word. */
export function SelectionStyler({
  documentId,
  root,
  styles,
  voiceId,
  onChanged,
}: Readonly<{
  documentId: string;
  root: RefObject<HTMLElement | null>;
  styles: ReadonlyMap<number, SentenceStyle>;
  voiceId: string;
  onChanged: () => void;
}>) {
  const selected = useSelectedSentences(root);
  const [editing, setEditing] = useState<number[] | null>(null);
  const [sounding, setSounding] = useState<{ first: number; last: number } | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);
  const word = selected ? selectedWord(selected.text) : null;
  const fix = (picked: string, index: number | undefined) => {
    // The dialog hands focus back to what had it: the sentence the word is in.
    const sentence = root.current?.querySelector<HTMLElement>(`.reader-seg[data-index="${index}"]`);
    sentence?.focus({ preventScroll: true });
    setFixing(picked);
  };
  return (
    <>
      {selected && !editing && !sounding && fixing === null ? (
        <div
          className="fixed z-40 flex -translate-x-1/2 gap-2"
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
          <Button
            size="sm"
            icon={<Volume2 size={14} />}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setSounding({ first: selected.first, last: selected.last })}
          >
            Sound effect
          </Button>
          {word ? (
            <Button
              size="sm"
              icon={<AudioLines size={14} />}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => fix(word, selected.indexes[0])}
            >
              Fix pronunciation
            </Button>
          ) : null}
        </div>
      ) : null}
      {fixing === null ? null : (
        <FixPronunciationDialog
          documentId={documentId}
          word={fixing}
          voiceId={voiceId}
          onClose={() => setFixing(null)}
          onSaved={onChanged}
        />
      )}
      {sounding ? (
        <SelectionSound documentId={documentId} {...sounding} onClose={() => setSounding(null)} />
      ) : null}
      {editing ? (
        <StyleSentencesDialog
          documentId={documentId}
          indexes={editing}
          styles={styles}
          voiceId={voiceId}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}
