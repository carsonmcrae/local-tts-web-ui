// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Review one passage's take before moving on: its verdict, listening back, and comparing it
 *   with the take it replaced.
 * Scope: The take's badge and issues (the most important first), a button to listen to it (press again
 *   to stop; press once more to replay), and, when the passage was recorded again, the previous take
 *   kept by the server: listen to it and keep it instead. Keeping it swaps the two, so the newer take
 *   can be brought back the same way.
 * Does NOT belong: Recording or saving takes (SessionRecorder) or the passage itself (PassageParts).
 */
import { Play, RotateCcw, Square } from 'lucide-react';
import { describeError } from '@/api/client';
import { useRestoreTake } from '@/api/queries';
import type { SessionTake, VoiceSession } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Badge, Banner } from '@/components/ui/Feedback';
import { IssueList } from '../IssueList';
import { useClipPlayer } from '../useClipPlayer';

function PlayButton({
  src,
  label,
  player,
}: Readonly<{ src: string; label: string; player: ReturnType<typeof useClipPlayer> }>) {
  const playing = player.playing === src;
  return (
    <Button
      size="sm"
      icon={playing ? <Square size={13} fill="currentColor" /> : <Play size={13} />}
      onClick={() => player.toggle(src)}
    >
      {playing ? 'Stop' : label}
    </Button>
  );
}

export function TakeReview({
  session,
  take,
}: Readonly<{ session: VoiceSession; take: SessionTake | undefined }>) {
  const player = useClipPlayer();
  const restore = useRestoreTake();
  if (!take) return null;
  // The take's time is in the address so a new take of the same passage is never served from cache.
  const base = `/api/voice-sessions/${session.id}/takes/${take.number}`;
  const src = `${base}/audio?v=${encodeURIComponent(take.createdAt)}`;
  const previous = take.previous;
  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {take.quality.ok ? (
          <Badge tone="success">Recorded · {take.durationS.toFixed(0)} s</Badge>
        ) : null}
        <PlayButton src={src} label="Listen to this take" player={player} />
      </div>
      {take.quality.issues.length > 0 ? (
        <div className="w-full">
          <IssueList issues={take.quality.issues} />
        </div>
      ) : null}
      {previous ? (
        <div className="flex w-full flex-col items-center gap-2 rounded-[var(--radius-md)] border border-line p-3 text-center text-[13px]">
          <p className="text-muted">
            Your previous take of this passage is kept
            {previous.quality.ok ? '' : ' (it needed another take)'}. Compare the two and keep the
            one that sounds more like you.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <PlayButton
              src={`${base}/previous/audio?v=${encodeURIComponent(previous.createdAt)}`}
              label="Listen to the previous take"
              player={player}
            />
            <Button
              size="sm"
              icon={<RotateCcw size={13} />}
              loading={restore.isPending}
              onClick={() => restore.mutate({ sessionId: session.id, number: take.number })}
            >
              Keep the previous take
            </Button>
          </div>
          {restore.isError ? <Banner tone="error">{describeError(restore.error)}</Banner> : null}
        </div>
      ) : null}
    </div>
  );
}
