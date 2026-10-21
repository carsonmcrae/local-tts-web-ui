// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Why a new export can't start right now, at the top of the Exports page.
 * Scope: The export queue is full (how many run and wait, and what makes room), or the disk is
 *   nearly full (how much is free and what to do). Announced politely; says nothing when a new
 *   export can start. Also the words for a waiting export's place in line.
 * Does NOT belong: The limits themselves (the server) or the export list (ExportsPage).
 */
import type { ExportQueue } from '@/api/exportQueries';
import { Banner } from '@/components/ui/Feedback';
import { formatBytes, pluralize } from '@/lib/format';

const ORDINAL = new Intl.PluralRules('en-US', { type: 'ordinal' });
const SUFFIX: Record<Intl.LDMLPluralRule, string> = {
  zero: 'th',
  one: 'st',
  two: 'nd',
  few: 'rd',
  many: 'th',
  other: 'th',
};

/** 1 → "Next in line", 3 → "3rd in line". */
export function placeText(place: number): string {
  return place === 1 ? 'Next in line' : `${place}${SUFFIX[ORDINAL.select(place)]} in line`;
}

export function QueueNotice({ queue }: Readonly<{ queue: ExportQueue | undefined }>) {
  if (queue?.blocked === 'queue_full') {
    return (
      <Banner tone="warning" title="The export queue is full" className="mb-6">
        {pluralize(queue.running, 'export')} running and {queue.waiting} waiting, the most this
        computer takes on at once. A new export or a resume can start when one finishes, or when you
        pause or cancel one.
      </Banner>
    );
  }
  if (queue?.blocked === 'low_disk') {
    return (
      <Banner tone="warning" title="Low disk space" className="mb-6">
        Only {formatBytes(queue.freeBytes)} is free on this computer, and TTSNative keeps{' '}
        {formatBytes(queue.reserveBytes)} free for the system. New exports and resumes need room for
        their audio: free up some space, or delete exports you no longer need.
      </Banner>
    );
  }
  return null;
}
