// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The release-readiness gate: what must be true of the exact commit a version ships from.
 * Scope: Judging each requirement from its evidence: the workflows that ran on that commit (CI, the
 *   Windows app, CodeQL and the browser journeys, which pass only as a whole), the SonarQube result
 *   recorded for it, and the
 *   version's acceptance checklist (every manual check done or waived with a reason, no open blocker).
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
 * @typedef {{ commit: string, gate: string }} QualityEvidence
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
 * The SonarQube quality gate passed on this commit, or on one that differs from it only by the
 * recorded evidence.
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
 * The checklist items under a `## Heading`, as `- [x]`, `- [ ]` or `- [~]` lines (a waiver needs
 * "waived: <reason>").
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
    .map((match) => ({ mark: (match[1] ?? ' ').toLowerCase(), text: match[2] ?? '' }));
}

/**
 * Manual checks are listed, and each is done or waived with a reason.
 * @param {string} text @param {string} file
 * @returns {Verdict}
 */
function manualChecksVerdict(text, file) {
  const item = 'Manual checks identified and done';
  const checks = checklist(text, 'Manual checks') ?? [];
  if (checks.length === 0)
    return { item, ok: false, detail: `${file} lists no "## Manual checks"` };
  const open = checks.filter(
    (check) => check.mark === ' ' || (check.mark === '~' && !/waived:\s*\S/i.test(check.text)),
  );
  if (open.length) {
    const detail = `${open.length} of ${checks.length} open, e.g. "${open[0]?.text.slice(0, 60)}"`;
    return { item, ok: false, detail };
  }
  return { item, ok: true, detail: `${checks.length} done or waived with a reason` };
}

/**
 * There is a blockers section, and every blocker in it is resolved.
 * @param {string} text @param {string} file
 * @returns {Verdict}
 */
function blockersVerdict(text, file) {
  const item = 'No unresolved blocker';
  const blockers = checklist(text, 'Blockers');
  if (blockers === null) return { item, ok: false, detail: `${file} has no "## Blockers" section` };
  const open = blockers.filter((blocker) => blocker.mark !== 'x');
  if (open.length) {
    const detail = `${open.length} open, e.g. "${open[0]?.text.slice(0, 60)}"`;
    return { item, ok: false, detail };
  }
  return { item, ok: true, detail: 'none open' };
}

/**
 * Every manual check is done or waived with a reason, and no blocker is open.
 * @param {string | null} text the version's acceptance.md
 * @param {string} version
 * @returns {Verdict[]}
 */
export function acceptanceVerdicts(text, version) {
  const file = `${readinessDir(version)}/acceptance.md`;
  if (text === null) {
    return [{ item: 'Manual checks identified and done', ok: false, detail: `no ${file}` }];
  }
  return [manualChecksVerdict(text, file), blockersVerdict(text, file)];
}
