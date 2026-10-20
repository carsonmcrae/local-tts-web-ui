// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Play a recording held in memory, in every browser.
 * Scope: A stable id per Blob (for query keys) and a cached data: URL for a Blob — WebKit refuses to
 *   play media from Blob URLs, so recordings are played back through data: URLs instead.
 * Does NOT belong: Playing the audio (useClipPlayer) or recording it.
 */
import { useQuery } from '@tanstack/react-query';

const blobIds = new WeakMap<Blob, number>();
let nextBlobId = 1;

export function blobId(blob: Blob): number {
  let id = blobIds.get(blob);
  if (id === undefined) {
    id = nextBlobId++;
    blobIds.set(blob, id);
  }
  return id;
}

export function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // readAsDataURL always produces a string result.
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the recording.'));
    reader.readAsDataURL(blob);
  });
}

/** A data: URL for local playback of `blob` (undefined until it's ready). */
export function useDataUrl(blob: Blob): string | undefined {
  return useQuery({
    queryKey: ['data-url', blobId(blob)],
    queryFn: () => readAsDataUrl(blob),
    staleTime: Infinity,
  }).data;
}
