// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Show a recording's quality problems, each with its fix.
 * Scope: One banner per issue: errors (which block) in the error tone, warnings in the warning tone.
 * Does NOT belong: Measuring quality (the server) or deciding what to do about it.
 */
import type { QualityReport } from '@/api/types';
import { Banner } from '@/components/ui/Feedback';

export function IssueList({ issues }: Readonly<{ issues: QualityReport['issues'] }>) {
  return (
    <div className="flex flex-col gap-2">
      {issues.map((issue) => (
        <Banner key={issue.code} tone={issue.severity === 'error' ? 'error' : 'warning'}>
          {issue.message}
        </Banner>
      ))}
    </div>
  );
}
