// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Import a long recording made in another app into a studio session.
 * Scope: Checks the file type and size before uploading, then reports how many takes the server
 *   split it into (at its pauses), or why the import failed.
 * Does NOT belong: Recording takes in the app (SessionRecorder) or splitting audio (the server).
 */
import { FileAudio } from 'lucide-react';
import { useRef, useState } from 'react';
import { describeError } from '@/api/client';
import { useImportRecording } from '@/api/queries';
import type { VoiceSession } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';

const MAX_IMPORT_BYTES = 600 * 1024 * 1024;
const IMPORT_TYPES = /\.(wav|flac|ogg)$/i;

export function ImportRecording({ session }: Readonly<{ session: VoiceSession }>) {
  const importer = useImportRecording();
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const choose = (file: File) => {
    setProblem(null);
    if (!IMPORT_TYPES.test(file.name)) setProblem('Import a WAV, FLAC or OGG file.');
    else if (file.size > MAX_IMPORT_BYTES)
      setProblem('That file is larger than 600 MB. Split it into shorter parts.');
    else {
      const before = session.takes.length;
      importer.mutate(
        { sessionId: session.id, file },
        { onSuccess: (updated) => setAdded(updated.takes.length - before) },
      );
    }
  };
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <p className="text-[13px] text-muted">
        Recorded the passages in Audacity or another app? Import the file; it’s split into takes at
        the pauses.
      </p>
      <div>
        <Button
          size="sm"
          icon={<FileAudio size={14} />}
          loading={importer.isPending}
          onClick={() => input.current?.click()}
        >
          Import a recording
        </Button>
        <input
          ref={input}
          type="file"
          accept=".wav,.flac,.ogg,audio/wav,audio/flac,audio/ogg"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a recording to import"
          data-testid="session-import-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) choose(file);
            event.target.value = '';
          }}
        />
      </div>
      {importer.isSuccess ? (
        <Banner tone="success">Added {added} takes from your recording.</Banner>
      ) : null}
      {problem ? <Banner tone="error">{problem}</Banner> : null}
      {importer.isError ? <Banner tone="error">{describeError(importer.error)}</Banner> : null}
    </div>
  );
}
