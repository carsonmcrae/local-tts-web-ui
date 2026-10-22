// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: `npm run release:gate -- <X.Y.Z> [--commit <sha>]` — is this exact commit ready to ship?
 * Scope: Runs the in-repository checks (version files; change files, their surfaces and the notes),
 *   asks GitHub (`gh`) which workflows passed on the commit, reads the version's SonarQube evidence
 *   and acceptance checklist under docs/readiness/X.Y.Z/, prints every requirement with its evidence
 *   and fails if one is unmet. release.yml runs it before anything is built. Versions before 2.2.0
 *   predate the gate.
 * Does NOT belong: The judgements themselves (lib/gate.mjs) or recording SonarQube's result
 *   (sonar-evidence.mjs).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import {
  GATED_FROM,
  acceptanceVerdicts,
  isGated,
  qualityVerdict,
  readinessDir,
  workflowVerdicts,
} from '../lib/gate.mjs';
import { git } from '../lib/git.mjs';
import { color, ok } from '../lib/log.mjs';
import { repoRoot } from '../lib/paths.mjs';

const version = (process.argv[2] ?? '').replace(/^v/, '');
const commitIndex = process.argv.indexOf('--commit');
// The full id: GitHub only matches workflow runs on it.
const commit =
  git([
    'rev-parse',
    '--verify',
    `${(commitIndex >= 0 && process.argv[commitIndex + 1]) || 'HEAD'}^{commit}`,
  ]) ?? '';
const repo = process.env.GITHUB_REPOSITORY || 'carsonmcrae/ttsnative';

/** @param {string} file */
const read = (file) =>
  existsSync(path.join(repoRoot, file)) ? readFileSync(path.join(repoRoot, file), 'utf8') : null;

/** @param {string} item @param {string} script */
function scriptVerdict(item, script) {
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', script)], {
    encoding: 'utf8',
  });
  const lines = `${result.stdout}${result.stderr}`.trim().split('\n');
  // The script's own last line, without its colour codes and mark.
  const last = stripVTControlCharacters(lines.at(-1) ?? '').replace(/^[✓✗]\s*/, '');
  return { item, ok: result.status === 0, detail: last };
}

function workflowRuns() {
  const out = execFileSync(
    'gh',
    [
      'api',
      '-X',
      'GET',
      `repos/${repo}/actions/runs`,
      // As fields: an "&" inside one argument doesn't survive the trip to gh on Windows.
      '-f',
      `head_sha=${commit}`,
      '-f',
      'per_page=100',
      '--jq',
      '[.workflow_runs[] | {name, status, conclusion, created_at}]',
    ],
    { encoding: 'utf8' },
  );
  return JSON.parse(out);
}

function main() {
  if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[0-9a-f]{40}$/.test(commit)) {
    console.error('Usage: npm run release:gate -- <X.Y.Z> [--commit <sha>]');
    process.exit(2);
  }
  if (!isGated(version)) {
    ok(`${version} predates the release-readiness gate (from ${GATED_FROM})`);
    return;
  }
  const dir = readinessDir(version);
  const quality = read(`${dir}/quality.json`);
  const evidence = quality ? JSON.parse(quality) : null;
  const changedSince = evidence
    ? (git(['diff', '--name-only', evidence.commit, commit]) ?? '').split('\n').filter(Boolean)
    : [];
  const verdicts = [
    scriptVerdict('Version files agree', 'check-version.mjs'),
    scriptVerdict('Change files, their surfaces and the notes are valid', 'check-changes.mjs'),
    ...workflowVerdicts(workflowRuns()),
    qualityVerdict(evidence, changedSince, version),
    ...acceptanceVerdicts(read(`${dir}/acceptance.md`), version),
  ];
  console.log(`Release-readiness gate for ${version} at ${commit.slice(0, 7)}:`);
  for (const verdict of verdicts) {
    const mark = verdict.ok ? color.green('✓') : color.red('✗');
    console.log(`${mark} ${verdict.item}: ${verdict.detail}`);
  }
  const failed = verdicts.filter((verdict) => !verdict.ok).length;
  if (failed) {
    console.error(
      `${failed} requirement(s) unmet; see docs/guides/release-process.md, "Readiness gate".`,
    );
    process.exit(1);
  }
  ok(`${version} at ${commit.slice(0, 7)} passed the release-readiness gate`);
}

main();
