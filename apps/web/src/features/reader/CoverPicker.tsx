// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Choose, preview and remove a document's cover image.
 * Scope: A JPEG or PNG of at most 5 MB (checked here first for a quick answer; the server checks
 *   the file's first bytes), uploaded as soon as it is chosen, with a preview of the saved cover.
 * Does NOT belong: The other audiobook details (AudiobookDetails).
 */
import { ImagePlus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { describeError } from '@/api/client';
import { useRemoveCover, useUploadCover } from '@/api/exportQueries';
import { Button } from '@/components/ui/Button';
import { TOUCH } from '@/features/exports/exportText';

const MAX_COVER_BYTES = 5 * 1024 * 1024;

function coverProblem(file: File): string | null {
  const image = /^image\/(jpeg|png)$/.test(file.type) || /\.(jpe?g|png)$/i.test(file.name);
  if (!image) return 'Use a JPEG or PNG image for the cover.';
  if (file.size > MAX_COVER_BYTES) return 'The cover is larger than 5 MB. Use a smaller image.';
  return null;
}

export function CoverPicker({
  documentId,
  hasCover,
  version,
}: Readonly<{ documentId: string; hasCover: boolean; version: number }>) {
  const upload = useUploadCover(documentId);
  const remove = useRemoveCover(documentId);
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const failed = (error: unknown) => setProblem(describeError(error));

  const choose = (file: File) => {
    const found = coverProblem(file);
    setProblem(found);
    if (!found) upload.mutate(file, { onError: failed });
  };

  return (
    <div className="flex items-start gap-4">
      {hasCover ? (
        <img
          src={`/api/documents/${documentId}/cover?v=${version}`}
          alt="Cover preview"
          className="h-24 w-18 shrink-0 rounded-[var(--radius-md)] border border-line object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-24 w-18 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-line-strong text-subtle"
        >
          <ImagePlus size={20} />
        </div>
      )}
      <div className="flex min-w-0 flex-col gap-2">
        <div>
          <p className="text-sm font-medium">Cover</p>
          <p className="text-[13px] text-muted">A JPEG or PNG image, up to 5 MB.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            loading={upload.isPending}
            onClick={() => input.current?.click()}
            className={TOUCH}
          >
            {hasCover ? 'Change cover' : 'Choose cover'}
          </Button>
          {hasCover ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 size={14} />}
              loading={remove.isPending}
              onClick={() => remove.mutate(undefined, { onError: failed })}
              className={TOUCH}
            >
              Remove cover
            </Button>
          ) : null}
        </div>
        {problem ? (
          <p role="alert" className="text-[13px] font-medium text-danger">
            {problem}
          </p>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png"
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a cover image"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          if (chosen) choose(chosen);
          event.target.value = '';
        }}
      />
    </div>
  );
}
