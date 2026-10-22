// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the release-readiness gate's judgements.
 * Scope: Which versions are gated; the newest run of each required workflow decides; SonarQube evidence
 *   counts only for this commit or one that differs by the evidence itself; manual checks need to be
 *   done or waived with a reason, and blockers resolved.
 * Does NOT belong: Fetching runs or files (scripts/release/gate.mjs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acceptanceVerdicts,
  isGated,
  qualityEvidence,
  qualityVerdict,
  workflowVerdicts,
} from './gate.mjs';

/** @param {string} name @param {string} conclusion @param {string} created_at */
const run = (name, conclusion, created_at = '2026-10-22T10:00:00Z', status = 'completed') => ({
  name,
  status,
  conclusion: status === 'completed' ? conclusion : null,
  created_at,
});

test('versions from 2.2.0 are gated', () => {
  assert.equal(isGated('2.1.0'), false);
  assert.equal(isGated('2.2.0'), true);
  assert.equal(isGated('3.0.0'), true);
});

test('the newest run of every required workflow must have passed on the commit', () => {
  const verdicts = workflowVerdicts([
    run('CI', 'failure', '2026-10-22T09:00:00Z'),
    run('CI', 'success', '2026-10-22T11:00:00Z'), // a re-run that passed counts
    run('Desktop', 'success', '2026-10-22T09:00:00Z'),
    run('Desktop', 'cancelled', '2026-10-22T11:00:00Z'), // ...and so does one that didn't
    run('Pages', 'success'),
  ]);
  assert.deepEqual(
    verdicts.map((verdict) => [verdict.item, verdict.ok, verdict.detail]),
    [
      ['CI passed on this commit', true, 'completed/success'],
      ['Desktop passed on this commit', false, 'completed/cancelled'],
      ['CodeQL passed on this commit', false, 'no run'],
      ['Inference & E2E passed on this commit', false, 'no run'],
    ],
  );
  assert.equal(workflowVerdicts([run('CodeQL', '', 'x', 'in_progress')])[2]?.detail, 'in_progress');
});

test('SonarQube evidence counts only for this commit, or one that differs by the evidence itself', () => {
  const commit = 'a'.repeat(40);
  assert.match(
    qualityVerdict(null, [], '2.2.0').detail,
    /no docs\/readiness\/2\.2\.0\/quality\.json/,
  );
  assert.deepEqual(qualityVerdict({ commit, gate: 'ERROR' }, [], '2.2.0'), {
    item: 'SonarQube quality gate passed',
    ok: false,
    detail: 'gate ERROR on aaaaaaa',
  });
  assert.equal(
    qualityVerdict({ commit, gate: 'OK' }, ['docs/readiness/2.2.0/quality.json'], '2.2.0').ok,
    true,
  );
  const stale = qualityVerdict({ commit, gate: 'OK' }, ['apps/web/src/a.ts'], '2.2.0');
  assert.equal(stale.ok, false);
  assert.match(stale.detail, /1 file\(s\) changed since \(apps\/web\/src\/a\.ts\)/);
});

test('SonarQube evidence records the analysed commit, the gate and the measures', () => {
  const evidence = qualityEvidence(
    '2.2.0',
    { date: '2026-10-22T12:00:00+0000', revision: 'b'.repeat(40) },
    {
      status: 'OK',
      conditions: [
        { metricKey: 'new_coverage', status: 'OK', actualValue: '100.0', errorThreshold: '80' },
      ],
    },
    [
      { metric: 'coverage', value: '100.0' },
      { metric: 'bugs', value: '0' },
    ],
  );
  assert.equal(evidence.commit, 'b'.repeat(40));
  assert.equal(evidence.gate, 'OK');
  assert.deepEqual(evidence.conditions, [
    { metric: 'new_coverage', status: 'OK', actual: '100.0', threshold: '80' },
  ]);
  assert.equal(evidence.measures.coverage, '100.0');
  assert.equal(evidence.measures.vulnerabilities, null); // not reported: recorded as unknown
  assert.deepEqual(
    qualityEvidence('2.2.0', { date: 'd', revision: 'c' }, { status: 'ERROR' }, []).conditions,
    [],
  );
  assert.throws(() => qualityEvidence('2.2.0', { date: 'd' }, { status: 'OK' }, []), /no commit/);
});

test('manual checks are done or waived with a reason, and no blocker is open', () => {
  const text = (/** @type {string} */ checks, /** @type {string} */ blockers) =>
    `# Acceptance\n\n## Manual checks\n\n${checks}\n\n## Blockers\n\n${blockers}\n`;
  const [checks, blockers] = acceptanceVerdicts(
    text(
      '- [x] Installed on Windows 11\n- [~] Real iPhone — waived: no device; emulated only',
      'None.',
    ),
    '2.2.0',
  );
  assert.deepEqual([checks?.ok, checks?.detail], [true, '2 done or waived with a reason']);
  assert.deepEqual([blockers?.ok, blockers?.detail], [true, 'none open']);
  const open = acceptanceVerdicts(
    text(
      '- [x] Done\n- [ ] Listen to the music\n- [~] Waived without a reason',
      '- [ ] Signing key missing\n- [x] Fixed',
    ),
    '2.2.0',
  );
  assert.deepEqual(
    open.map((verdict) => [verdict.ok, verdict.detail]),
    [
      [false, '2 of 3 open, e.g. "Listen to the music"'],
      [false, '1 open, e.g. "Signing key missing"'],
    ],
  );
  assert.match(
    acceptanceVerdicts(null, '2.2.0')[0]?.detail ?? '',
    /no docs\/readiness\/2\.2\.0\/acceptance\.md/,
  );
  const missing = acceptanceVerdicts('# Acceptance\n', '2.2.0');
  assert.match(missing[0]?.detail ?? '', /lists no "## Manual checks"/);
  assert.match(missing[1]?.detail ?? '', /has no "## Blockers" section/);
});
