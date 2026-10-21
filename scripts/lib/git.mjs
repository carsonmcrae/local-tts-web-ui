// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The few Git facts the release tooling needs, read without a shell.
 * Scope: Release tags (vX.Y.Z), the commit, branch and distance from the last release tag, whether
 *   the working tree has changes, files changed since a base commit, and a file's content at a commit.
 *   Every function returns a neutral value when Git or the history is unavailable.
 * Does NOT belong: Decisions about versions (changes.mjs, build-version.mjs).
 */
import { execFileSync } from 'node:child_process';
import { repoRoot } from './paths.mjs';
import { compareVersions, isStable } from './semver.mjs';

const GIT = process.platform === 'win32' ? 'git.exe' : 'git';

/**
 * @param {string[]} args
 * @returns {string | null} trimmed output, or null when the command fails
 */
export function git(args) {
  try {
    return execFileSync(GIT, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

/** Stable release versions that have a `vX.Y.Z` tag, newest first. */
export function releaseTags() {
  return (git(['tag', '--list', 'v*']) ?? '')
    .split('\n')
    .map((tag) => tag.trim().replace(/^v/, ''))
    .filter((version) => isStable(version))
    .sort((a, b) => compareVersions(b, a));
}

/** @returns {{ sha: string, branch: string, sinceTag: number, dirty: boolean }} */
export function headFacts() {
  const tag = git(['describe', '--tags', '--match', 'v[0-9]*.[0-9]*.[0-9]*', '--abbrev=0']);
  const count = tag
    ? git(['rev-list', '--count', `${tag}..HEAD`])
    : git(['rev-list', '--count', 'HEAD']);
  return {
    sha: git(['rev-parse', '--short=10', 'HEAD']) ?? 'unknown',
    branch:
      process.env.GITHUB_HEAD_REF ||
      process.env.GITHUB_REF_NAME ||
      (git(['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'unknown'),
    sinceTag: Number(count ?? 0),
    dirty: Boolean(git(['status', '--porcelain', '--untracked-files=no'])),
  };
}

/** Whether HEAD is exactly the commit tagged `v<version>`. @param {string} version */
export function headIsTagged(version) {
  const tagged = git(['rev-parse', `v${version}^{commit}`]);
  return tagged !== null && tagged === git(['rev-parse', 'HEAD']);
}

/**
 * `git diff --name-status` from the merge base with `base` to HEAD.
 * @param {string} base
 * @returns {{ status: string, file: string }[]}
 */
export function changedFiles(base) {
  return (git(['diff', '--name-status', '--no-renames', `${base}...HEAD`]) ?? '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [status = '', file = ''] = line.split('\t');
      return { status, file };
    });
}

/**
 * A file's content at a commit, or null when it didn't exist there.
 * @param {string} commit
 * @param {string} file
 */
export function fileAt(commit, file) {
  return git(['show', `${commit}:${file}`]);
}
