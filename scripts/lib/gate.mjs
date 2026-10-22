// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The release-readiness gate: what must be true of the exact commit a version ships from.
 * Scope: Judging each requirement from its evidence: the workflows that ran on that commit (CI, the
 *   Windows app, CodeQL and the browser journeys, which pass only as a whole); the SonarQube result
 *   recorded for it, held to the project's own policy (100 % coverage, no duplication, no open issue,
 *   every hotspot reviewed) whatever the server's gate allows; the previous release, published from a
 *   release commit; and the acceptance checklists: this version's checks before release done with a
 *   "verified:" note (or waived with a reason, never a required one), its checks after publishing
 *   still open, the previous version's checks after publishing done, and no open blocker.
 *   Versions before 2.2.0 predate the gate.
 * Does NOT belong: Fetching the evidence (scripts/release/gate.mjs) or the checks the workflows run.
 */
import { compareVersions } from './semver.mjs';

/** The first version the gate applies to. */
export const GATED_FROM = '2.2.0';
/**
 * Workflows that must have passed on the release commit, by their `name:`: everyday CI (tests at full
 * coverage, duplication, audits, the website build), the Windows app (installer, persistence and
 * update path), CodeQL, and the real-model and browser journeys (run by hand on the commit).
 */
const REQUIRED_WORKFLOWS = ['CI', 'Desktop', 'CodeQL', 'Inference & E2E'];
/** Where a version's readiness evidence lives. */
export const readinessDir = (/** @type {string} */ version) => `docs/readiness/${version}`;

/**
 * @typedef {{ name: string, status: string, conclusion: string | null, created_at: string }} Run
 * @typedef {{ item: string, ok: boolean, detail: string }} Verdict
 * @typedef {{ commit: string, gate: string, measures?: Record<string, string | null> }} QualityEvidence
 */

/** @param {string} version */
export const isGated = (version) => compareVersions(version, GATED_FROM) >= 0;

/**
 * A run's state as GitHub reports it: "completed/success", "in_progress", or "no run".
 * @param {Run | undefined} run
 */
function runState(run) {
  if (!run) return 'no run';
  return run.conclusion ? `${run.status}/${run.conclusion}` : run.status;
}

/**
 * Each required workflow's newest run on the commit passed.
 * @param {Run[]} runs every workflow run on the commit
 * @returns {Verdict[]}
 */
export function workflowVerdicts(runs) {
  return REQUIRED_WORKFLOWS.map((name) => {
    const newest = runs
      .filter((run) => run.name === name)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const ok = newest?.status === 'completed' && newest.conclusion === 'success';
    return { item: `${name} passed on this commit`, ok, detail: runState(newest) };
  });
}

/**
 * The project's quality policy for the measured code (the web app and the server; see
 * docs/readiness/2.2.0/quality-review.md for what is measured), checked on the recorded measures so a
 * looser server-side gate can't let a release through. scripts/release/sonar-gate.mjs sets the server's
 * gate to the same thresholds.
 */
const QUALITY_POLICY = [
  { metric: 'line_coverage', min: 100 },
  { metric: 'branch_coverage', min: 100 },
  { metric: 'duplicated_lines_density', max: 0 },
  { metric: 'duplicated_blocks', max: 0 },
  { metric: 'bugs', max: 0 },
  { metric: 'vulnerabilities', max: 0 },
  { metric: 'code_smells', max: 0 },
  { metric: 'security_hotspots', max: 0 },
];

/**
 * The recorded measures that miss the policy, as "metric value" strings.
 * @param {Record<string, string | null> | undefined} measures
 */
function policyMisses(measures) {
  return QUALITY_POLICY.filter(({ metric, min, max }) => {
    const value = Number(measures?.[metric] ?? Number.NaN);
    if (Number.isNaN(value)) return true;
    return min === undefined ? value > /** @type {number} */ (max) : value < min;
  }).map(({ metric }) => `${metric} ${measures?.[metric] ?? 'missing'}`);
}

/**
 * The SonarQube quality gate passed on this commit, or on one that differs from it only by the
 * recorded evidence, and the recorded measures meet the project's policy.
 * @param {QualityEvidence | null} evidence
 * @param {string[]} changedSince files changed between the analysed commit and this one
 * @param {string} version
 * @returns {Verdict}
 */
export function qualityVerdict(evidence, changedSince, version) {
  const item = 'SonarQube quality gate passed';
  if (!evidence) {
    return { item, ok: false, detail: `no ${readinessDir(version)}/quality.json` };
  }
  if (evidence.gate !== 'OK') {
    return { item, ok: false, detail: `gate ${evidence.gate} on ${evidence.commit.slice(0, 7)}` };
  }
  const misses = policyMisses(evidence.measures);
  if (misses.length) {
    return { item, ok: false, detail: `below the project's policy: ${misses.join(', ')}` };
  }
  const other = changedSince.filter((file) => !file.startsWith(`${readinessDir(version)}/`));
  return other.length
    ? {
        item,
        ok: false,
        detail: `analysed ${evidence.commit.slice(0, 7)}, but ${other.length} file(s) changed since (${other.slice(0, 3).join(', ')})`,
      }
    : { item, ok: true, detail: `gate OK on ${evidence.commit.slice(0, 7)}` };
}

/** The measures SonarQube evidence records, as SonarQube names them. */
export const QUALITY_METRICS = [
  'coverage',
  'line_coverage',
  'branch_coverage',
  'duplicated_lines_density',
  'duplicated_blocks',
  'bugs',
  'vulnerabilities',
  'security_hotspots',
  'security_hotspots_reviewed',
  'code_smells',
  'ncloc',
];

/**
 * The evidence file for a version from SonarQube's answers: which commit was analysed and when, the
 * quality gate's status and conditions, and the measures.
 * @param {string} version
 * @param {{ date: string, revision?: string }} analysis the newest analysis
 * @param {{ status: string, conditions?: { metricKey: string, status: string, actualValue?: string, errorThreshold?: string }[] }} gate
 * @param {{ metric: string, value?: string }[]} measures
 */
export function qualityEvidence(version, analysis, gate, measures) {
  if (!analysis.revision) {
    throw new Error('The analysis has no commit; run the scan from a Git checkout.');
  }
  return {
    version,
    commit: analysis.revision,
    analysedAt: analysis.date,
    gate: gate.status,
    conditions: (gate.conditions ?? []).map(
      ({ metricKey, status, actualValue, errorThreshold }) => ({
        metric: metricKey,
        status,
        actual: actualValue ?? null,
        threshold: errorThreshold ?? null,
      }),
    ),
    measures: Object.fromEntries(
      QUALITY_METRICS.map((metric) => [
        metric,
        measures.find((measure) => measure.metric === metric)?.value ?? null,
      ]),
    ),
  };
}

/**
 * The checklist items under a `## Heading`, as `- [x]`, `- [ ]` or `- [~]` lines. A check marked
 * `(required)` can't be waived; a ticked one needs "verified: <what, when, where>" and a waived one
 * "waived: <reason>", so nothing passes on a bare mark.
 * @param {string} text @param {string} heading
 */
function checklist(text, heading) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const start = lines.findIndex(
    (line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`,
  );
  if (start < 0) return null;
  const next = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  const end = next < 0 ? lines.length : next;
  return lines
    .slice(start + 1, end)
    .map((line) => /^\s*- \[([ x~])\] (.+)$/i.exec(line))
    .filter((match) => match !== null)
    .map((match) => {
      const text = match[2] ?? '';
      return { mark: (match[1] ?? ' ').toLowerCase(), text, required: /^\(required\)/i.test(text) };
    });
}

/** @typedef {NonNullable<ReturnType<typeof checklist>>[number]} Check */

/**
 * Why a check isn't done, or null when it is: ticked with a "verified:" note, or waived with a reason
 * when it isn't required.
 * @param {Check} check
 */
function notDone(check) {
  if (check.mark === 'x') {
    return /verified:\s*\S/i.test(check.text) ? null : 'ticked without "verified:"';
  }
  if (check.mark === '~') {
    if (check.required) return "required, so it can't be waived";
    return /waived:\s*\S/i.test(check.text) ? null : 'waived without a reason';
  }
  return 'open';
}

/**
 * Every check in a section is done; the verdict names the first that isn't and why.
 * @param {Check[]} checks @param {string} item
 * @returns {Verdict}
 */
function allDone(checks, item) {
  const open = checks
    .map((check) => ({ check, why: notDone(check) }))
    .filter(({ why }) => why !== null);
  if (open.length === 0) {
    return { item, ok: true, detail: `${checks.length} done or waived with a reason` };
  }
  const first = open[0];
  const detail = `${open.length} of ${checks.length} not done, e.g. "${first?.check.text.slice(0, 60)}" (${first?.why})`;
  return { item, ok: false, detail };
}

/**
 * This version's checks before release are listed and done.
 * @param {string} text @param {string} file
 * @returns {Verdict}
 */
function beforeReleaseVerdict(text, file) {
  const item = 'Checks before release done';
  const checks = checklist(text, 'Before release') ?? [];
  if (checks.length === 0) {
    return { item, ok: false, detail: `${file} lists no "## Before release"` };
  }
  return allDone(checks, item);
}

/**
 * This version's checks after publishing are listed and none is marked yet: they test the published
 * release, which doesn't exist while the gate runs, so a mark can only be false.
 * @param {string} text @param {string} file @param {string} version
 * @returns {Verdict}
 */
function afterPublishingVerdict(text, file, version) {
  const item = 'Checks after publishing listed, none marked early';
  const checks = checklist(text, 'After publishing') ?? [];
  if (checks.length === 0) {
    return { item, ok: false, detail: `${file} lists no "## After publishing"` };
  }
  const early = checks.filter((check) => check.mark !== ' ');
  if (early.length) {
    const detail = `${early.length} marked before ${version} is published, e.g. "${early[0]?.text.slice(0, 60)}"`;
    return { item, ok: false, detail };
  }
  return { item, ok: true, detail: `${checks.length} for after ${version} is published` };
}

/**
 * There is a blockers section, and every blocker in it is resolved with a "verified:" note.
 * @param {string} text @param {string} file
 * @returns {Verdict}
 */
function blockersVerdict(text, file) {
  const item = 'No unresolved blocker';
  const blockers = checklist(text, 'Blockers');
  if (blockers === null) return { item, ok: false, detail: `${file} has no "## Blockers" section` };
  const open = blockers.filter((blocker) => blocker.mark !== 'x' || notDone(blocker) !== null);
  if (open.length) {
    const detail = `${open.length} open, e.g. "${open[0]?.text.slice(0, 60)}"`;
    return { item, ok: false, detail };
  }
  return { item, ok: true, detail: 'none open' };
}

/**
 * This version's acceptance: checks before release done, checks after publishing not yet marked, no
 * open blocker.
 * @param {string | null} text the version's acceptance.md
 * @param {string} version
 * @returns {Verdict[]}
 */
export function acceptanceVerdicts(text, version) {
  const file = `${readinessDir(version)}/acceptance.md`;
  if (text === null) {
    return [{ item: 'Checks before release done', ok: false, detail: `no ${file}` }];
  }
  return [
    beforeReleaseVerdict(text, file),
    afterPublishingVerdict(text, file, version),
    blockersVerdict(text, file),
  ];
}

/**
 * The previous gated version's checks after publishing are done, so a release's smoke tests can't be
 * skipped: they block the next one.
 * @param {{ version: string, text: string | null } | null} previous the newest earlier gated version
 * @returns {Verdict}
 */
export function previousAcceptanceVerdict(previous) {
  const item = 'Previous release checked after publishing';
  if (!previous) return { item, ok: true, detail: 'no earlier gated release' };
  const checks = previous.text === null ? null : checklist(previous.text, 'After publishing');
  if (!checks?.length) {
    const file = `${readinessDir(previous.version)}/acceptance.md`;
    return { item, ok: false, detail: `${file} lists no "## After publishing"` };
  }
  const verdict = allDone(checks, item);
  return { ...verdict, detail: `${previous.version}: ${verdict.detail}` };
}

/**
 * The previous release is published (not a draft) from a release commit: one whose version files
 * name it and that has no pending change file. Tagging `main` by mistake fails the second.
 * @param {string | null} previous the previous version in the release history
 * @param {{ draft: boolean } | null} release its GitHub release, or null when there is none
 * @param {{ version: string | null, pending: number } | null} tagged what its tag's commit holds
 * @returns {Verdict}
 */
export function previousReleaseVerdict(previous, release, tagged) {
  const item = 'Previous release published from a release commit';
  if (!previous) return { item, ok: true, detail: 'no earlier release' };
  if (!release) return { item, ok: false, detail: `v${previous} isn't published on GitHub` };
  if (release.draft) return { item, ok: false, detail: `v${previous} is still a draft` };
  if (tagged?.version !== previous) {
    const named = tagged?.version ?? 'nothing';
    return {
      item,
      ok: false,
      detail: `v${previous}'s tag points at a commit whose version files say ${named}`,
    };
  }
  if (tagged.pending) {
    return {
      item,
      ok: false,
      detail: `v${previous}'s tag points at a commit with ${tagged.pending} pending change file(s), not a release commit`,
    };
  }
  return { item, ok: true, detail: `v${previous} published from its release commit` };
}
