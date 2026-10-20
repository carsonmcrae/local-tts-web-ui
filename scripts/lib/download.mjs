// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Verified HTTPS downloads for bootstrap toolchain artifacts.
 * Scope: Redirect following restricted to an allow-list of hosts, exact size and SHA-256
 *   verification, temp-file-then-rename so a partial download is never mistaken for a good one.
 * Does NOT belong: Archive extraction (archive.mjs) or model downloads (the server owns those).
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import https from 'node:https';
import { BootstrapError } from './log.mjs';

const MAX_REDIRECTS = 5;

/**
 * @param {string} url
 * @param {string[]} allowedHosts
 * @returns {URL}
 */
function assertAllowedUrl(url, allowedHosts) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new BootstrapError(`Refusing non-HTTPS download: ${parsed.origin}`);
  }
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new BootstrapError(`Refusing download from unapproved host: ${parsed.hostname}`, [
      'Approved hosts are listed in scripts/toolchain.json.',
    ]);
  }
  return parsed;
}

/**
 * @param {string} url
 * @param {string[]} allowedHosts
 * @param {number} redirectsLeft
 * @returns {Promise<import('node:http').IncomingMessage>}
 */
function request(url, allowedHosts, redirectsLeft) {
  const target = assertAllowedUrl(url, allowedHosts);
  return new Promise((resolve, reject) => {
    const req = https.get(
      target,
      { headers: { 'user-agent': 'local-tts-web-ui-bootstrap' } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new BootstrapError('Too many redirects while downloading.'));
            return;
          }
          const next = new URL(res.headers.location, target).toString();
          request(next, allowedHosts, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(
            new BootstrapError(`Download failed with HTTP ${status} from ${target.hostname}.`),
          );
          return;
        }
        resolve(res);
      },
    );
    req.setTimeout(60_000, () => req.destroy(new Error('Network timeout after 60 seconds.')));
    req.on('error', (error) =>
      reject(
        new BootstrapError(`Network error while downloading: ${error.message}`, [
          'Check your internet connection or proxy settings, then run the command again.',
        ]),
      ),
    );
  });
}

/**
 * Download `url` to `destination`, verifying exact size and SHA-256 before the file appears.
 * @param {{ url: string, destination: string, size: number, sha256: string,
 *   allowedHosts: string[], onProgress?: (received: number, total: number) => void }} options
 */
export async function downloadVerified({
  url,
  destination,
  size,
  sha256,
  allowedHosts,
  onProgress,
}) {
  const res = await request(url, allowedHosts, MAX_REDIRECTS);
  const partial = `${destination}.part`;
  const hash = createHash('sha256');
  let received = 0;
  const out = createWriteStream(partial, { flags: 'w', mode: 0o600 });
  try {
    await new Promise((resolve, reject) => {
      res.on('data', (/** @type {Buffer} */ chunk) => {
        received += chunk.length;
        if (received > size) {
          res.destroy(new BootstrapError('Download is larger than the pinned size; aborting.'));
          return;
        }
        hash.update(chunk);
        onProgress?.(received, size);
      });
      res.on('error', reject);
      out.on('error', reject);
      out.on('finish', () => resolve(undefined));
      res.pipe(out);
    });
    if (received !== size) {
      throw new BootstrapError(`Downloaded size ${received} does not match pinned size ${size}.`);
    }
    const digest = hash.digest('hex');
    if (digest !== sha256) {
      throw new BootstrapError(
        'Checksum mismatch: the downloaded file was not the pinned artifact.',
        [
          `expected ${sha256}`,
          `received ${digest}`,
          'Nothing was installed. If this persists, report it — do not bypass the check.',
        ],
      );
    }
    await rename(partial, destination);
  } catch (error) {
    out.destroy();
    await rm(partial, { force: true });
    throw error;
  }
}
