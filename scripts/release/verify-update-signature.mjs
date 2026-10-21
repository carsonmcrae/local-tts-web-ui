// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Prove an installer's update signature matches the public key built into TTSNative, before
 *   anything is published (a mismatched signing secret would make every update fail in the field).
 * Scope: Tauri updater signatures are base64-encoded minisign signatures (Ed25519, normally over the
 *   file's BLAKE2b-512 hash); the key id must match the app's key in tauri.conf.json, the signature
 *   must verify over the file, and the trusted comment's global signature must verify too.
 *   Usage: `node scripts/release/verify-update-signature.mjs <file> <file.sig>`.
 * Does NOT belong: Signing (Tauri's bundler) or Windows code signing (Authenticode).
 */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot } from '../lib/paths.mjs';

const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');

/** @param {string} base64 a Tauri key or signature: base64 of minisign's two-line text */
function minisignLines(base64) {
  return Buffer.from(base64.trim(), 'base64')
    .toString('utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * @param {Buffer} data the signed file
 * @param {string} signature contents of the .sig file
 * @param {string} publicKey `plugins.updater.pubkey` from tauri.conf.json
 * @returns {string[]} problems; empty when the signature is valid for this key
 */
export function checkSignature(data, signature, publicKey) {
  const keyLines = minisignLines(publicKey);
  const sigLines = minisignLines(signature);
  const key = Buffer.from(keyLines[1] ?? '', 'base64');
  const sig = Buffer.from(sigLines[1] ?? '', 'base64');
  const trusted = (sigLines[2] ?? '').replace(/^trusted comment: /, '');
  const global = Buffer.from(sigLines[3] ?? '', 'base64');
  if (key.length !== 42 || sig.length !== 74) return ['the key or the signature is malformed'];
  if (!key.subarray(2, 10).equals(sig.subarray(2, 10))) {
    return ['signed with a different key than the one built into the app'];
  }
  const algorithm = sig.subarray(0, 2).toString('latin1');
  const message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data;
  const publicKeyObject = createPublicKey({
    key: Buffer.concat([SPKI_ED25519, key.subarray(10)]),
    format: 'der',
    type: 'spki',
  });
  const problems = [];
  if (!verify(null, message, publicKeyObject, sig.subarray(10)))
    problems.push('the file does not match its signature');
  const globalMessage = Buffer.concat([sig.subarray(10), Buffer.from(trusted, 'utf8')]);
  if (!verify(null, globalMessage, publicKeyObject, global))
    problems.push('the trusted comment is not signed');
  return problems;
}

/** @returns {string} */
export function appPublicKey() {
  const config = JSON.parse(
    readFileSync(path.join(repoRoot, 'apps', 'desktop', 'src-tauri', 'tauri.conf.json'), 'utf8'),
  );
  return config.plugins.updater.pubkey;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [file = '', signatureFile = `${file}.sig`] = process.argv.slice(2);
  const problems = checkSignature(
    readFileSync(file),
    readFileSync(signatureFile, 'utf8'),
    appPublicKey(),
  );
  if (problems.length) {
    console.error(`✗ ${path.basename(file)}: ${problems.join('; ')}`);
    process.exit(1);
  }
  console.log(`✓ ${path.basename(file)} carries a valid update signature for the app's public key`);
}
