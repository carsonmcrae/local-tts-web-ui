// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Extract a single named file from a .zip or .tar.gz archive held in memory.
 * Scope: Just enough of the ZIP and ustar formats to pull the uv binary out of its
 *   official release archive. Only exact base-name matches are written, to a caller-chosen
 *   path, so archive entry paths can never escape the destination (no zip-slip).
 * Does NOT belong: General-purpose archive handling or anything that writes entry paths.
 */
import { gunzipSync, inflateRawSync } from 'node:zlib';
import { BootstrapError } from './log.mjs';

const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;
const MAX_ENTRY_BYTES = 200 * 1024 * 1024;

/** @param {string} entryName */
const baseName = (entryName) => entryName.split(/[\\/]/).pop() ?? '';

/**
 * @typedef {{ method: number, compressedSize: number, size: number, localOffset: number,
 *   name: string, next: number }} ZipEntry
 */

/**
 * Finds the end-of-central-directory record, which sits in the last 64 KiB of the archive.
 * @param {Buffer} zip
 * @returns {number} its offset
 */
function findEndOfCentralDirectory(zip) {
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1) {
    if (zip.readUInt32LE(i) === ZIP_EOCD) return i;
  }
  throw new BootstrapError('Archive is not a valid zip file.');
}

/**
 * Reads the central-directory record at `offset`.
 * @param {Buffer} zip
 * @param {number} offset
 * @returns {ZipEntry} the entry, with `next` pointing at the following record
 */
function readCentralEntry(zip, offset) {
  if (zip.readUInt32LE(offset) !== ZIP_CENTRAL) throw new BootstrapError('Corrupt zip directory.');
  const method = zip.readUInt16LE(offset + 10);
  const compressedSize = zip.readUInt32LE(offset + 20);
  const size = zip.readUInt32LE(offset + 24);
  const nameLen = zip.readUInt16LE(offset + 28);
  const extraLen = zip.readUInt16LE(offset + 30);
  const commentLen = zip.readUInt16LE(offset + 32);
  const localOffset = zip.readUInt32LE(offset + 42);
  const name = zip.toString('utf8', offset + 46, offset + 46 + nameLen);
  const next = offset + 46 + nameLen + extraLen + commentLen;
  return { method, compressedSize, size, localOffset, name, next };
}

/**
 * Returns an entry's contents, read through its local file header.
 * @param {Buffer} zip
 * @param {ZipEntry} entry
 * @returns {Buffer}
 */
function readZipData(zip, { method, compressedSize, size, localOffset }) {
  if (size > MAX_ENTRY_BYTES) throw new BootstrapError('Archive entry is unexpectedly large.');
  if (zip.readUInt32LE(localOffset) !== ZIP_LOCAL) throw new BootstrapError('Corrupt zip entry.');
  const localName = zip.readUInt16LE(localOffset + 26);
  const localExtra = zip.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + localName + localExtra;
  const data = zip.subarray(start, start + compressedSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
  throw new BootstrapError(`Unsupported zip compression method ${method}.`);
}

/**
 * @param {Buffer} zip
 * @param {string} wanted base name of the entry to extract
 * @returns {Buffer}
 */
export function extractFromZip(zip, wanted) {
  const eocd = findEndOfCentralDirectory(zip);
  const entries = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n += 1) {
    const entry = readCentralEntry(zip, offset);
    offset = entry.next;
    if (baseName(entry.name) === wanted) return readZipData(zip, entry);
  }
  throw new BootstrapError(`Archive does not contain ${wanted}.`);
}

/**
 * Decodes a ustar header field: its text up to the first NUL, or all of it when it has none.
 * A plain index search, so a crafted header cannot cause regex backtracking.
 * @param {Buffer} header
 * @param {number} start
 * @param {number} end
 */
function headerField(header, start, end) {
  const text = header.toString('utf8', start, end);
  const nul = text.indexOf('\0');
  return nul === -1 ? text : text.slice(0, nul);
}

/**
 * @param {Buffer} tgz
 * @param {string} wanted base name of the entry to extract
 * @returns {Buffer}
 */
export function extractFromTarGz(tgz, wanted) {
  const tar = gunzipSync(tgz, { maxOutputLength: MAX_ENTRY_BYTES * 2 });
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = headerField(header, 0, 100);
    const prefix = headerField(header, 345, 500);
    const size = Number.parseInt(headerField(header, 124, 136).trim() || '0', 8);
    const type = header.toString('utf8', 156, 157);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const dataStart = offset + 512;
    if ((type === '0' || type === '\0' || type === '') && baseName(fullName) === wanted) {
      if (size > MAX_ENTRY_BYTES) throw new BootstrapError('Archive entry is unexpectedly large.');
      return Buffer.from(tar.subarray(dataStart, dataStart + size));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new BootstrapError(`Archive does not contain ${wanted}.`);
}
