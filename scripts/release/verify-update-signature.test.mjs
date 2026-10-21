// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the update-signature check run before a release is published.
 * Scope: Keys and signatures made here in Tauri's format (base64 minisign, prehashed and plain
 *   Ed25519): a valid signature passes; a changed file, another key, a forged trusted comment and
 *   malformed input fail; the app's committed public key is well-formed.
 * Does NOT belong: Signing real artifacts (the release workflow).
 */
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { test } from 'node:test';
import { appPublicKey, checkSignature } from './verify-update-signature.mjs';

/** A key pair and signer in the format Tauri's updater uses. */
function keys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  const id = randomBytes(8);
  const pub = Buffer.from(
    `untrusted comment: minisign public key\n${Buffer.concat([Buffer.from('Ed'), id, raw]).toString('base64')}\n`,
  ).toString('base64');
  /** @param {Buffer} data @param {'ED' | 'Ed'} algorithm */
  const signFile = (data, algorithm = 'ED', comment = 'timestamp:1\tfile:app.exe') => {
    const message = algorithm === 'ED' ? createHash('blake2b512').update(data).digest() : data;
    const signature = sign(null, message, privateKey);
    const global = sign(null, Buffer.concat([signature, Buffer.from(comment)]), privateKey);
    const body = Buffer.concat([Buffer.from(algorithm), id, signature]).toString('base64');
    return Buffer.from(
      `untrusted comment: signature from tauri secret key\n${body}\ntrusted comment: ${comment}\n${global.toString('base64')}\n`,
    ).toString('base64');
  };
  return { pub, signFile };
}

test('a matching signature passes, prehashed or not', () => {
  const { pub, signFile } = keys();
  const data = randomBytes(5000);
  assert.deepEqual(checkSignature(data, signFile(data), pub), []);
  assert.deepEqual(checkSignature(data, signFile(data, 'Ed'), pub), []);
});

test('a changed file, another key, a forged comment or garbage fail', () => {
  const { pub, signFile } = keys();
  const other = keys();
  const data = randomBytes(5000);
  const changed = Buffer.from(data);
  changed[0] = (changed[0] ?? 0) ^ 1;
  assert.deepEqual(checkSignature(changed, signFile(data), pub), [
    'the file does not match its signature',
  ]);
  assert.deepEqual(checkSignature(data, other.signFile(data), pub), [
    'signed with a different key than the one built into the app',
  ]);
  const forged = Buffer.from(signFile(data), 'base64')
    .toString('utf8')
    .replace('file:app.exe', 'file:evil.exe');
  assert.deepEqual(checkSignature(data, Buffer.from(forged).toString('base64'), pub), [
    'the trusted comment is not signed',
  ]);
  assert.deepEqual(checkSignature(data, 'bm90IGEgc2lnbmF0dXJl', pub), [
    'the key or the signature is malformed',
  ]);
});

test("the app's public key is a minisign Ed25519 key", () => {
  const lines = Buffer.from(appPublicKey(), 'base64').toString('utf8').split('\n');
  assert.match(lines[0] ?? '', /minisign public key/);
  assert.equal(Buffer.from(lines[1] ?? '', 'base64').length, 42);
});
