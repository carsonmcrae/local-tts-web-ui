// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Talk to the SonarQube server that analyses this project.
 * Scope: The server and project key from sonar-project.properties (or SONAR_HOST_URL), the token from
 *   SONAR_TOKEN only (never written or printed), and one API call with it: a GET, or a POST with form
 *   fields. Shared by sonar-evidence.mjs and sonar-gate.mjs.
 * Does NOT belong: What either script asks for, or running the scan (`npm run sonar`).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BootstrapError } from './log.mjs';
import { repoRoot } from './paths.mjs';

/** @param {string} key */
function property(key) {
  const text = readFileSync(path.join(repoRoot, 'sonar-project.properties'), 'utf8');
  const escaped = key.replaceAll('.', String.raw`\.`);
  return new RegExp(String.raw`^${escaped}=(.+)$`, 'm').exec(text)?.[1]?.trim();
}

/** @typedef {{ host: string, token: string, project: string }} Sonar */

/** The server, the token and the project key, or a clear failure when the token is missing. */
export function sonarSettings() {
  const token = process.env.SONAR_TOKEN ?? '';
  if (!token) {
    throw new BootstrapError('SONAR_TOKEN is not set.', [
      'Set it in this shell only; never in a file in the repository.',
    ]);
  }
  return {
    host: process.env.SONAR_HOST_URL || property('sonar.host.url') || 'http://127.0.0.1:9000',
    token,
    project: property('sonar.projectKey') ?? '',
  };
}

/**
 * One API call: a GET, or a POST when `form` is given. A 404 answers null.
 * @param {Sonar} sonar @param {string} route @param {Record<string, string>} [form]
 * @returns {Promise<any>}
 */
export async function sonarApi(sonar, route, form) {
  const response = await fetch(`${sonar.host}${route}`, {
    method: form ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${sonar.token}` },
    ...(form ? { body: new URLSearchParams(form) } : {}),
  });
  if (response.status === 401 || response.status === 403) {
    throw new BootstrapError('SonarQube refused the token.', [
      'Check SONAR_TOKEN has the permission this step needs (it is never printed).',
    ]);
  }
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`SonarQube answered ${response.status} for ${route.split('?')[0]}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : {};
}
