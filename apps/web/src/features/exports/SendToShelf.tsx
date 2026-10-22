// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Send a finished audiobook to the user's own Audiobookshelf server.
 * Scope: Shown only when Audiobookshelf is set up (address, key, library and folder) and the export
 *   is one M4B, MP3 or WAV file; starts the upload job, follows it and says when it is done or why
 *   it failed.
 * Does NOT belong: Setting up the connection (Settings) or the upload itself (server).
 */
import { CloudUpload } from 'lucide-react';
import { describeError } from '@/api/client';
import { isShelfReady, useSendToShelf, useShelfSettings } from '@/api/exportQueries';
import { isJobActive, useJob } from '@/api/queries';
import type { JobOut } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { TOUCH } from './exportText';

function sendStatus(job: JobOut | undefined, error: unknown) {
  if (error) return { text: describeError(error), failed: true };
  if (!job) return null;
  if (job.status === 'succeeded') return { text: 'Sent to Audiobookshelf.', failed: false };
  if (job.status === 'failed') return { text: job.message, failed: true };
  if (isJobActive(job)) return { text: 'Sending to Audiobookshelf…', failed: false };
  return null;
}

export function SendToShelf({ exportId }: Readonly<{ exportId: string }>) {
  const settings = useShelfSettings();
  const send = useSendToShelf();
  const upload = useJob(send.data?.id);
  if (!isShelfReady(settings.data)) return null;
  const sending = send.isPending || isJobActive(upload.data);
  const status = sendStatus(upload.data, send.error);
  const sent = upload.data?.status === 'succeeded';
  return (
    <>
      {sent ? null : (
        <Button
          size="sm"
          icon={<CloudUpload size={15} />}
          loading={sending}
          onClick={() => send.mutate(exportId)}
          className={TOUCH}
        >
          {sending ? 'Sending…' : 'Send to Audiobookshelf'}
        </Button>
      )}
      <p
        aria-live="polite"
        className={status?.failed ? 'basis-full text-danger' : 'basis-full empty:hidden'}
      >
        {status?.text}
      </p>
    </>
  );
}
