// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Show a recording's quality problems: the one that matters most, with its fix, first.
 * Scope: The most important issue as a banner (an error, which blocks, before any warning; errors
 *   and warnings have their own tone and icon), and any others below it as a short, quieter "Also
 *   noticed" list, so a take never shows a wall of messages.
 * Does NOT belong: Measuring quality (the server) or deciding what to do about it.
 */
import type { QualityReport } from '@/api/types';
import { Banner } from '@/components/ui/Feedback';

type Issue = QualityReport['issues'][number];

export function IssueList({ issues }: Readonly<{ issues: readonly Issue[] }>) {
  // Errors first; otherwise the server's order, which puts the cause before its effects.
  const [primary, ...others] = [...issues].sort(
    (a, b) => Number(b.severity === 'error') - Number(a.severity === 'error'),
  );
  if (!primary) return null;
  return (
    <div className="flex flex-col gap-2">
      <Banner tone={primary.severity === 'error' ? 'error' : 'warning'}>{primary.message}</Banner>
      {others.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-line px-4 py-3 text-[13px]">
          <p className="font-medium">Also noticed</p>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-muted">
            {others.map((issue) => (
              <li key={issue.code}>
                {issue.severity === 'error' ? <span className="sr-only">Problem: </span> : null}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
