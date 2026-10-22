// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: A document's audiobook details in the export dialog: author, narrator, description and
 *   cover, behind a disclosure that starts closed.
 * Scope: `useDetailsDraft` loads the details once the disclosure is first opened and keeps the
 *   edits, saving them when a field loses focus and again (only if still unsaved) before an export
 *   starts. `AudiobookDetails` draws the disclosure, the fields and the cover picker (`CoverPicker`).
 * Does NOT belong: The export choices (ExportOptions) or the server's checks of the details.
 */
import { ChevronDown } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { describeError } from '@/api/client';
import { useAudiobookDetails, useSaveDetails } from '@/api/exportQueries';
import type { AudiobookDetails as Details } from '@/api/types';
import { Banner, Skeleton } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { CoverPicker } from './CoverPicker';

export interface DetailsDraft {
  author: string;
  narrator: string;
  description: string;
}

function fromServer(details: Details | undefined): DetailsDraft {
  return {
    author: details?.author ?? '',
    narrator: details?.narrator ?? '',
    description: details?.description ?? '',
  };
}

/** The details being edited for one document; `flush` saves them when they changed. */
export function useDetailsDraft(documentId: string, enabled: boolean) {
  const details = useAudiobookDetails(documentId, enabled);
  const save = useSaveDetails(documentId);
  // Edits belong to the document they were made for (the player can switch documents).
  const [draft, setDraft] = useState<{ documentId: string; values: DetailsDraft } | null>(null);
  const sent = useRef<{ body: string; done: Promise<unknown> } | null>(null);
  const edited = draft?.documentId === documentId ? draft.values : null;
  const values = edited ?? fromServer(details.data);

  const flush = (): Promise<unknown> => {
    if (!edited) return Promise.resolve();
    const body = JSON.stringify([documentId, edited]);
    if (sent.current?.body === body) return sent.current.done; // already saved, or saving
    const done = save.mutateAsync(edited).catch((error: unknown) => {
      sent.current = null;
      throw error;
    });
    sent.current = { body, done };
    return done;
  };

  return {
    details,
    values,
    edit: (change: Partial<DetailsDraft>) =>
      setDraft({ documentId, values: { ...values, ...change } }),
    flush,
    saveError: save.error,
  };
}

export type DetailsDraftState = ReturnType<typeof useDetailsDraft>;

const NAMES = [
  ['author', 'Author'],
  ['narrator', 'Narrator'],
] as const;

function DetailFields({ state }: Readonly<{ state: DetailsDraftState }>) {
  const { values, edit, flush, saveError } = state;
  const saveNow = () => void flush().catch(() => undefined); // the error is shown below
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        {NAMES.map(([name, label]) => (
          <Field key={name} label={label}>
            {({ id }) => (
              <Input
                id={id}
                value={values[name]}
                maxLength={200}
                onChange={(event) => edit({ [name]: event.target.value })}
                onBlur={saveNow}
              />
            )}
          </Field>
        ))}
      </div>
      <Field label="Description">
        {({ id }) => (
          <Textarea
            id={id}
            value={values.description}
            maxLength={4000}
            rows={3}
            className="min-h-20"
            onChange={(event) => edit({ description: event.target.value })}
            onBlur={saveNow}
          />
        )}
      </Field>
      {saveError ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          Couldn&apos;t save the details. {describeError(saveError)}
        </p>
      ) : null}
    </>
  );
}

export function AudiobookDetails({
  documentId,
  state,
  open,
  onOpenChange,
}: Readonly<{
  documentId: string;
  state: DetailsDraftState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}>) {
  const regionId = useId();
  const { details } = state;
  return (
    <div className="rounded-[var(--radius-lg)] border border-line">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? regionId : undefined}
        onClick={() => onOpenChange(!open)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--radius-lg)] px-4 py-2.5 text-left hover:bg-surface-2"
      >
        <span>
          <span className="block text-sm font-medium">Audiobook details</span>
          <span className="block text-[13px] text-muted">
            Author, narrator, description and cover
          </span>
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open ? (
        <div id={regionId} className="flex flex-col gap-4 border-t border-line px-4 py-4">
          <p className="text-[13px] text-muted">
            Saved with the document. M4B and EPUB files include them, and so do books you send to
            Audiobookshelf.
          </p>
          {details.isPending ? <Skeleton className="h-40" /> : <DetailFields state={state} />}
          {details.isError ? <Banner tone="error">{describeError(details.error)}</Banner> : null}
          <CoverPicker
            documentId={documentId}
            hasCover={Boolean(details.data?.hasCover)}
            version={details.dataUpdatedAt}
          />
        </div>
      ) : null}
    </div>
  );
}
