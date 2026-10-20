// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Correct a section the reader got wrong: rename it or move where it starts.
 * Scope: Lists the end of the previous section and the start of this one as sentences to pick the
 *   new start from (the previous section then ends just before it), plus the title; saves through
 *   the API, which hands the corrected document back to the reader and the player.
 * Does NOT belong: Automatic chapter detection (the server's extractors).
 */
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useSection, useUpdateSection } from '@/api/queries';
import type { SectionOut, SegmentOut } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner, Skeleton } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { OptionList } from '@/components/ui/Menu';

/** How many sentences to offer from the end of the previous section and the start of this one. */
const BEFORE = 20;
const AFTER = 60;

interface AdjustSectionDialogProps {
  documentId: string;
  section: SectionOut;
  onClose: () => void;
}

/** Sentences this section could start at: after the previous section's first, up to its own end. */
function candidates(previous: readonly SegmentOut[], current: readonly SegmentOut[]) {
  return [...previous.slice(1).slice(-BEFORE), ...current.slice(0, AFTER)];
}

function StartPicker({
  documentId,
  section,
  start,
  onStart,
}: Readonly<{
  documentId: string;
  section: SectionOut;
  start: number;
  onStart: (index: number) => void;
}>) {
  const previous = useSection(documentId, section.index - 1);
  const current = useSection(documentId, section.index);
  const failed = [previous, current].find((query) => query.isError);
  if (failed) return <Banner tone="error">{describeError(failed.error)}</Banner>;
  if (!previous.data || !current.data) return <Skeleton className="h-40" />;
  const options = candidates(previous.data.segments, current.data.segments).map((segment) => ({
    value: segment.index,
    label: <span className="line-clamp-2">{segment.text}</span>,
    ...(segment.index === section.startSegment ? { hint: 'Starts here now' } : {}),
  }));
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium">Starts at</p>
      <p className="text-[13px] leading-snug text-muted">
        Pick the sentence this section should start with. The section before it ends just before
        that sentence.
      </p>
      <div className="max-h-80 scrollbar-thin overflow-y-auto rounded-[var(--radius-md)] border border-line p-1">
        <OptionList label="Starts at" options={options} value={start} onSelect={onStart} />
      </div>
    </div>
  );
}

export function AdjustSectionDialog({
  documentId,
  section,
  onClose,
}: Readonly<AdjustSectionDialogProps>) {
  const [title, setTitle] = useState(section.title);
  const [start, setStart] = useState(section.startSegment);
  const update = useUpdateSection();
  const trimmed = title.trim();

  const save = () => {
    const changes = {
      ...(trimmed === section.title ? {} : { title: trimmed }),
      ...(start === section.startSegment ? {} : { startSegment: start }),
    };
    if (Object.keys(changes).length === 0) onClose();
    else update.mutate({ documentId, index: section.index, ...changes }, { onSuccess: onClose });
  };

  return (
    <Dialog
      open
      onOpenChange={() => onClose()}
      title="Adjust this section"
      description="Fix a title or a chapter that starts in the wrong place."
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={save}
            loading={update.isPending}
            disabled={trimmed === ''}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Title" error={trimmed === '' ? 'Give the section a title.' : undefined}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              value={title}
              maxLength={200}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </Field>
        {section.index > 0 ? (
          <StartPicker documentId={documentId} section={section} start={start} onStart={setStart} />
        ) : (
          <p className="text-[13px] text-muted">
            The first section always starts at the beginning of the document.
          </p>
        )}
        {update.isError ? <Banner tone="error">{describeError(update.error)}</Banner> : null}
      </div>
    </Dialog>
  );
}
