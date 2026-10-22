// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the release-readiness gate's judgements.
 * Scope: Which versions are gated; the newest run of each required workflow decides; SonarQube evidence
 *   counts only for this commit or one that differs by the evidence itself, and only at the project's
 *   policy; checks before release need a "verified:" note or a waiver with a reason (never for a
 *   required one), checks after publishing can't be marked early and block the next release, blockers
 *   are resolved, and the previous release is published from a release commit.
 * Does NOT belong: Fetching runs or files (scripts/release/gate.mjs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acceptanceVerdicts,
  isGated,
  previousAcceptanceVerdict,
  previousReleaseVerdict,
  qualityEvidence,
  qualityVerdict,
  workflowVerdicts,
} from './gate.mjs';

/** Measures that meet the project's policy. */
const MEASURES = {
  line_coverage: '100.0',
  branch_coverage: '100.0',
  duplicated_lines_density: '0.0',
  duplicated_blocks: '0',
  bugs: '0',
  vulnerabilities: '0',
  code_smells: '0',
  security_hotspots: '0',
};

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
    qualityVerdict(
      { commit, gate: 'OK', measures: MEASURES },
      ['docs/readiness/2.2.0/quality.json'],
      '2.2.0',
    ).ok,
    true,
  );
  const stale = qualityVerdict(
    { commit, gate: 'OK', measures: MEASURES },
    ['apps/web/src/a.ts'],
    '2.2.0',
  );
  assert.equal(stale.ok, false);
  assert.match(stale.detail, /1 file\(s\) changed since \(apps\/web\/src\/a\.ts\)/);
});

test("a passing SonarQube gate still has to meet the project's policy", () => {
  const commit = 'a'.repeat(40);
  const loose = { ...MEASURES, line_coverage: '99.8', duplicated_lines_density: '0.4' };
  assert.deepEqual(qualityVerdict({ commit, gate: 'OK', measures: loose }, [], '2.2.0'), {
    item: 'SonarQube quality gate passed',
    ok: false,
    detail: "below the project's policy: line_coverage 99.8, duplicated_lines_density 0.4",
  });
  const unrecorded = Object.fromEntries(
    Object.entries(MEASURES).filter(([metric]) => metric !== 'bugs'),
  );
  assert.match(
    qualityVerdict({ commit, gate: 'OK', measures: unrecorded }, [], '2.2.0').detail,
    /bugs missing/,
  );
  assert.match(qualityVerdict({ commit, gate: 'OK' }, [], '2.2.0').detail, /line_coverage missing/);
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

/** An acceptance list with its three sections. */
const acceptance = (
  /** @type {string} */ before,
  /** @type {string} */ after,
  /** @type {string} */ blockers,
) =>
  `# Acceptance\n\n## Before release\n\n${before}\n\n## After publishing\n\n${after}\n\n## Blockers\n\n${blockers}\n`;

test('checks before release need a "verified:" note, or a reason to waive one that is not required', () => {
  const [before, after, blockers] = acceptanceVerdicts(
    acceptance(
      '- [x] (required) Clean Windows 11 install — verified: 2026-10-24, a fresh VM\n- [~] Real iPhone — waived: no device',
      '- [ ] (required) The published update installs',
      '- [x] Signing secrets exist — verified: 2026-10-24',
    ),
    '2.2.0',
  );
  assert.deepEqual([before?.ok, before?.detail], [true, '2 done or waived with a reason']);
  assert.deepEqual([after?.ok, after?.detail], [true, '1 for after 2.2.0 is published']);
  assert.deepEqual([blockers?.ok, blockers?.detail], [true, 'none open']);
  const open = acceptanceVerdicts(
    acceptance(
      '- [x] Ticked with nothing to show\n- [ ] Listen to the music\n- [~] (required) Real update — waived: later\n- [~] No reason given',
      '- [ ] Later',
      '- [x] Signing key exists\n- [ ] Not yet',
    ),
    '2.2.0',
  );
  assert.deepEqual(
    open.map((verdict) => [verdict.ok, verdict.detail]),
    [
      [false, '4 of 4 not done, e.g. "Ticked with nothing to show" (ticked without "verified:")'],
      [true, '1 for after 2.2.0 is published'],
      [false, '2 open, e.g. "Signing key exists"'],
    ],
  );
  const required = acceptanceVerdicts(
    acceptance('- [~] (required) Real update — waived: later', '- [ ] Later', ''),
    '2.2.0',
  );
  assert.match(required[0]?.detail ?? '', /required, so it can't be waived/);
  const unreasoned = acceptanceVerdicts(acceptance('- [~] Phones', '- [ ] Later', ''), '2.2.0');
  assert.match(unreasoned[0]?.detail ?? '', /waived without a reason/);
});

test('checks after publishing must be listed and stay unmarked until the release exists', () => {
  const early = acceptanceVerdicts(
    acceptance('- [x] Done — verified: today', '- [x] The download works — verified: hoped so', ''),
    '2.2.0',
  )[1];
  assert.deepEqual(
    [early?.ok, early?.detail],
    [false, '1 marked before 2.2.0 is published, e.g. "The download works — verified: hoped so"'],
  );
  const unlisted = acceptanceVerdicts(acceptance('- [x] Done — verified: today', '', ''), '2.2.0');
  assert.match(unlisted[1]?.detail ?? '', /lists no "## After publishing"/);
  assert.match(
    acceptanceVerdicts(null, '2.2.0')[0]?.detail ?? '',
    /no docs\/readiness\/2\.2\.0\/acceptance\.md/,
  );
  const missing = acceptanceVerdicts('# Acceptance\n', '2.2.0');
  assert.match(missing[0]?.detail ?? '', /lists no "## Before release"/);
  assert.match(missing[2]?.detail ?? '', /has no "## Blockers" section/);
});

test("the previous release's checks after publishing block the next release until done", () => {
  assert.deepEqual(previousAcceptanceVerdict(null), {
    item: 'Previous release checked after publishing',
    ok: true,
    detail: 'no earlier gated release',
  });
  const done = acceptance('', '- [x] (required) The update installs — verified: 2026-11-02', '');
  assert.equal(
    previousAcceptanceVerdict({ version: '2.2.0', text: done }).detail,
    '2.2.0: 1 done or waived with a reason',
  );
  const open = acceptance('', '- [ ] (required) The update installs', '');
  const verdict = previousAcceptanceVerdict({ version: '2.2.0', text: open });
  assert.equal(verdict.ok, false);
  assert.match(verdict.detail, /^2\.2\.0: 1 of 1 not done/);
  assert.match(
    previousAcceptanceVerdict({ version: '2.2.0', text: null }).detail,
    /docs\/readiness\/2\.2\.0\/acceptance\.md lists no "## After publishing"/,
  );
});

test('the previous release is published from its own release commit, not from main', () => {
  const check = (
    /** @type {string | null} */ previous,
    /** @type {{ draft: boolean } | null} */ release,
    /** @type {{ version: string | null, pending: number } | null} */ tagged,
  ) => {
    const verdict = previousReleaseVerdict(previous, release, tagged);
    return [verdict.ok, verdict.detail];
  };
  assert.deepEqual(check(null, null, null), [true, 'no earlier release']);
  assert.deepEqual(check('2.1.0', null, null), [false, "v2.1.0 isn't published on GitHub"]);
  assert.deepEqual(check('2.1.0', { draft: true }, null), [false, 'v2.1.0 is still a draft']);
  assert.deepEqual(check('2.1.0', { draft: false }, null), [
    false,
    "v2.1.0's tag points at a commit whose version files say nothing",
  ]);
  assert.deepEqual(check('2.1.0', { draft: false }, { version: '2.2.0', pending: 0 }), [
    false,
    "v2.1.0's tag points at a commit whose version files say 2.2.0",
  ]);
  assert.deepEqual(check('2.1.0', { draft: false }, { version: '2.1.0', pending: 25 }), [
    false,
    "v2.1.0's tag points at a commit with 25 pending change file(s), not a release commit",
  ]);
  assert.deepEqual(check('2.1.0', { draft: false }, { version: '2.1.0', pending: 0 }), [
    true,
    'v2.1.0 published from its release commit',
  ]);
});
