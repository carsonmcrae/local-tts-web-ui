// @ts-check
/**
 * Purpose: List the repository's files the way Git sees them, for the repository gates.
 * Scope: Tracked and untracked files minus anything Git ignores, filtered by a pattern and a list of
 *   exemptions. Shared by check-file-size.mjs and check-headers.mjs.
 * Does NOT belong: The rules each gate applies to the files it gets.
 */
import { execFileSync } from 'node:child_process';
import { repoRoot } from './paths.mjs';

/**
 * @param {RegExp} checked files to include (repository-relative, forward slashes)
 * @param {RegExp[]} exempt files to leave out even when they match
 * @returns {string[]}
 */
export function repoFiles(checked, exempt) {
  return execFileSync(
    process.platform === 'win32' ? 'git.exe' : 'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: repoRoot, encoding: 'utf8' },
  )
    .split('\n')
    .filter((file) => checked.test(file) && !exempt.some((rule) => rule.test(file)));
}
