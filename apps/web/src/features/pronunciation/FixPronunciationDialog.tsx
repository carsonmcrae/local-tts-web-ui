// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Fix how a word the reader selected is spoken, without changing the text.
 * Scope: A small dialog: the word (editable), how to say it written the way it sounds, both heard in
 *   the reading voice, and "This document" or "All documents". It starts from the pronunciation
 *   already saved for the word. Saving for all documents also folds this document's own
 *   pronunciation of the word into it, so this document says it the new way too. Focus starts in
 *   "Say it as" and goes back to what had it before (the reader focuses the word's sentence).
 * Does NOT belong: Finding the selection (reader/SentenceStyling) or the full list (PronunciationSection).
 */
import { Check } from 'lucide-react';
import type { SubmitEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { describeError } from '@/api/client';
import {
  useDeletePronunciation,
  usePronunciations,
  useSavePronunciation,
} from '@/api/readingQueries';
import type { Pronunciation } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { closeOnly, Dialog } from '@/components/ui/Dialog';
import { Banner, Skeleton } from '@/components/ui/Feedback';
import { OptionList } from '@/components/ui/Menu';
import { usePlayer } from '@/features/player/PlayerProvider';
import { rulesFor } from './pronunciationRules';
import { RespellingFields } from './RespellingFields';
import { usePronunciationPreview } from './usePronunciationPreview';

type Scope = 'document' | 'library';

const SCOPES = [
  { value: 'document', label: 'This document' },
  { value: 'library', label: 'All documents' },
] as const;

function savedNote(
  own: Pronunciation | undefined,
  library: Pronunciation | undefined,
  scope: Scope,
) {
  if (own && scope === 'library')
    return `This document's own “${own.sayAs}” is replaced, so it says it this way too.`;
  if (own) return `This document already says it as “${own.sayAs}”.`;
  if (library && scope === 'document')
    return `All documents say it as “${library.sayAs}”; this document will say it your way.`;
  if (library) return `All documents already say it as “${library.sayAs}”.`;
  return null;
}

interface FixProps {
  documentId: string;
  word: string;
  voiceId: string;
  onClose: () => void;
  onSaved: () => void;
}

function FixForm({
  rules,
  documentId,
  word: selected,
  voiceId,
  onClose,
  onSaved,
}: Readonly<FixProps & { rules: Pronunciation[] }>) {
  const [start] = useState(() => rulesFor(rules, selected, documentId));
  const [word, setWord] = useState(selected);
  const [sayAs, setSayAs] = useState((start.own ?? start.library)?.sayAs ?? '');
  const [scope, setScope] = useState<Scope>(start.library && !start.own ? 'library' : 'document');
  const sayAsField = useRef<HTMLInputElement>(null);
  const preview = usePronunciationPreview(voiceId, usePlayer().state.pace);
  const save = useSavePronunciation();
  const remove = useDeletePronunciation();
  const { own, library } = rulesFor(rules, word, documentId);
  const note = savedNote(own, library, scope);
  const failed = save.error ?? remove.error;

  useEffect(() => sayAsField.current?.focus(), []);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    // For all documents: change the library's rule, or move this document's own rule there.
    const target = scope === 'document' ? own : (library ?? own);
    try {
      await save.mutateAsync({
        ...(target ? { id: target.id } : {}),
        word,
        sayAs,
        matchCase: target?.matchCase ?? false,
        documentId: scope === 'document' ? documentId : null,
      });
      if (scope === 'library' && own && library) await remove.mutateAsync(own.id);
      onSaved();
      onClose();
    } catch {
      // Shown below the form.
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      aria-label="Fix pronunciation"
      className="flex flex-col gap-5"
    >
      <RespellingFields
        word={word}
        sayAs={sayAs}
        onWord={setWord}
        onSayAs={setSayAs}
        preview={preview}
        wordHint="Every place it is written this way, in any letter case."
        sayAsRef={sayAsField}
      />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium" aria-hidden="true">
          Use it in
        </p>
        <OptionList label="Use it in" options={SCOPES} value={scope} onSelect={setScope} />
        {note ? <p className="text-[13px] text-muted">{note}</p> : null}
      </div>
      {failed ? <Banner tone="error">{describeError(failed)}</Banner> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          icon={<Check size={15} />}
          loading={save.isPending || remove.isPending}
          disabled={word.trim() === '' || sayAs.trim() === ''}
        >
          Save
        </Button>
      </div>
    </form>
  );
}

export function FixPronunciationDialog(props: Readonly<FixProps>) {
  const rules = usePronunciations();
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const close = () => {
    props.onClose();
    // The dialog only hands focus back to a trigger, and this one has none: once it has gone,
    // focus returns to what had it before.
    globalThis.setTimeout(() => opener?.focus({ preventScroll: true }), 0);
  };
  return (
    <Dialog
      open
      size="sm"
      onOpenChange={closeOnly(close)}
      title="Fix pronunciation"
      description={`How the voice should say “${props.word}”. The text stays as written.`}
    >
      {rules.data ? <FixForm {...props} rules={rules.data} onClose={close} /> : null}
      {rules.isPending ? <Skeleton className="h-40" /> : null}
      {rules.isError ? <Banner tone="error">{describeError(rules.error)}</Banner> : null}
    </Dialog>
  );
}
