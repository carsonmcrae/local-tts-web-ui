// @ts-check
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
 * @param {Buffer} zip
 * @param {string} wanted base name of the entry to extract
 * @returns {Buffer}
 */
export function extractFromZip(zip, wanted) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1) {
    if (zip.readUInt32LE(i) === ZIP_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new BootstrapError('Archive is not a valid zip file.');
  const entries = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n += 1) {
    if (zip.readUInt32LE(offset) !== ZIP_CENTRAL)
      throw new BootstrapError('Corrupt zip directory.');
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const size = zip.readUInt32LE(offset + 24);
    const nameLen = zip.readUInt16LE(offset + 28);
    const extraLen = zip.readUInt16LE(offset + 30);
    const commentLen = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLen);
    offset += 46 + nameLen + extraLen + commentLen;
    if (baseName(name) !== wanted) continue;
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
  throw new BootstrapError(`Archive does not contain ${wanted}.`);
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
    const name = header.toString('utf8', 0, 100).replace(/\0.*$/s, '');
    const prefix = header.toString('utf8', 345, 500).replace(/\0.*$/s, '');
    const size = Number.parseInt(
      header.toString('utf8', 124, 136).replace(/\0.*$/s, '').trim() || '0',
      8,
    );
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
