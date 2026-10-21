// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Hold the desktop shell's Rust crates to the repository's 14-day release cool-down, transitive
 *   ones included (Cargo has no such setting).
 * Scope: Reads every crate in apps/desktop/src-tauri/Cargo.lock, looks up publication times in the
 *   crates.io index, and for each version newer than the cool-down asks Cargo to move to the newest
 *   compatible version that is older (`cargo update --precise`), repeating until nothing changes; then
 *   lists what Cargo couldn't move. A security fix always wins: a crate never moves to a version with a
 *   known advisory (checked on OSV.dev). `--check` only reports (exit 1 if any crate is too new).
 *   Usage: `node scripts/desktop/cargo-cooldown.mjs [--check] [--days 14]` (needs cargo for changes).
 * Does NOT belong: Advisories and licences (deny.toml) or direct dependency pins (Cargo.toml).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';
import { compareVersions, parseVersion } from '../lib/semver.mjs';

const crateDir = path.join(repoRoot, 'apps', 'desktop', 'src-tauri');
const lockFile = path.join(crateDir, 'Cargo.lock');
const daysIndex = process.argv.indexOf('--days');
const days = daysIndex >= 0 ? Number(process.argv[daysIndex + 1]) : 14;
const cutoff = Date.now() - days * 86_400_000;
const CARGO = process.env.CARGO ?? 'cargo';

/** @returns {{ name: string, version: string }[]} */
function lockedCrates() {
  const text = readFileSync(lockFile, 'utf8');
  return [
    ...text.matchAll(
      /\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"\nsource = "registry\+/g,
    ),
  ].map((match) => ({ name: match[1] ?? '', version: match[2] ?? '' }));
}

/** @param {string} name */
function indexPath(name) {
  const lower = name.toLowerCase();
  if (lower.length <= 2) return `${lower.length}/${lower}`;
  if (lower.length === 3) return `3/${lower[0]}/${lower}`;
  return `${lower.slice(0, 2)}/${lower.slice(2, 4)}/${lower}`;
}

/** @type {Map<string, { vers: string, yanked: boolean, pubtime?: string }[]>} */
const cache = new Map();
/** @param {string} name */
async function versions(name) {
  const known = cache.get(name);
  if (known) return known;
  const response = await fetch(`https://index.crates.io/${indexPath(name)}`, {
    headers: { 'user-agent': 'ttsnative-release-audit (https://github.com/carsonmcrae/ttsnative)' },
  });
  if (!response.ok) throw new Error(`index ${name}: HTTP ${response.status}`);
  const list = (await response.text())
    .trim()
    .split('\n')
    .map(
      (line) =>
        /** @type {{ vers: string, yanked: boolean, pubtime?: string }} */ (JSON.parse(line)),
    );
  cache.set(name, list);
  return list;
}

/** Same compatibility range as Cargo's caret requirement. @param {string} a @param {string} b */
function compatible(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  if (x.major !== y.major) return false;
  if (x.major === 0 && x.minor !== y.minor) return false;
  return x.major !== 0 || x.minor !== 0 || x.patch === y.patch;
}

/** @param {{ name: string, version: string }} krate */
async function tooNew(krate) {
  const entry = (await versions(krate.name)).find((item) => item.vers === krate.version);
  return entry?.pubtime ? Date.parse(entry.pubtime) > cutoff : false;
}

/** @param {{ name: string, version: string }} krate */
async function olderTarget(krate) {
  const list = await versions(krate.name);
  return list
    .filter(
      (item) =>
        !item.yanked &&
        item.pubtime &&
        Date.parse(item.pubtime) <= cutoff &&
        parseVersion(item.vers)?.prerelease.length === 0 &&
        compatible(item.vers, krate.version) &&
        compareVersions(item.vers, krate.version) < 0,
    )
    .sort((a, b) => compareVersions(b.vers, a.vers))[0]?.vers;
}

/** Whether OSV.dev lists any advisory for this crate version. @param {string} name @param {string} version */
async function advisories(name, version) {
  const response = await fetch('https://api.osv.dev/v1/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ package: { ecosystem: 'crates.io', name }, version }),
  });
  if (!response.ok) return true; // unknown counts as unsafe: keep the newer version
  const result = /** @type {{ vulns?: unknown[] }} */ (await response.json());
  return Boolean(result.vulns?.length);
}

async function main() {
  const stuck = new Set();
  for (let round = 0; round < 6; round += 1) {
    const recent = [];
    for (const krate of lockedCrates()) if (await tooNew(krate)) recent.push(krate);
    const movable = recent.filter((krate) => !stuck.has(`${krate.name}@${krate.version}`));
    if (process.argv.includes('--check') || !movable.length) {
      for (const krate of recent)
        console.log(`${krate.name} ${krate.version} is newer than ${days} days`);
      process.exitCode = recent.length ? 1 : 0;
      return;
    }
    for (const krate of movable) {
      const target = await olderTarget(krate);
      if (target && (await advisories(krate.name, target))) {
        stuck.add(`${krate.name}@${krate.version}`);
        console.log(`${krate.name} ${krate.version} stays: ${target} has known advisories`);
        continue;
      }
      const result = target
        ? spawnSync(
            CARGO,
            ['update', '-p', `${krate.name}@${krate.version}`, '--precise', target],
            {
              cwd: crateDir,
              encoding: 'utf8',
            },
          )
        : { status: 1, stderr: 'no older compatible version' };
      if (result.status === 0) console.log(`${krate.name} ${krate.version} -> ${target}`);
      else {
        stuck.add(`${krate.name}@${krate.version}`);
        const reason =
          String(result.stderr)
            .split('\n')
            .find((line) => line.includes('error')) ?? result.stderr;
        console.log(`${krate.name} ${krate.version} stays: ${String(reason).trim().slice(0, 160)}`);
      }
    }
  }
}

await main();
