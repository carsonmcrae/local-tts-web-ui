// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Style the sentences a reader selects in the text.
 * Scope: Watches the text selection in the reading view and, while sentences are selected, shows a
 *   floating "Voice & effect" button beside it that opens the styling dialog for exactly those
 *   sentences (a selection that only touches a sentence's edge doesn't count).
 * Does NOT belong: The dialog itself (StyleSentencesDialog) or the cast dialog.
 */
import { Sparkles } from 'lucide-react';
import { type RefObject, useEffect, useState } from 'react';
import type { SentenceStyle } from '@/api/types';
import { Button } from '@/components/ui/Button';
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

/** A button floating beside the selected sentences that opens the styling dialog for them. */
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
          voiceId={voiceId}
          onClose={() => setEditing(null)}
          onChanged={onChanged}
        />
      ) : null}
    </>
  );
}
