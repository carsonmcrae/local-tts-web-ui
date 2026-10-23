// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Read which DLLs a Windows program or library loads, and find the ones a bundled runtime would
 *   need from a computer that may not have them.
 * Scope: The import and delay-load import tables of a PE file (PE32 and PE32+); for a set of files,
 *   every imported DLL that is neither shipped with them nor part of Windows. The Microsoft Visual C++
 *   runtime (msvcp140, vcruntime140 and their family) is never counted as part of Windows: a clean PC
 *   doesn't have it, although build machines and most developers' PCs do, so it must ship next to
 *   python.exe or next to the file that loads it.
 * Does NOT belong: Reading files or deciding what Windows includes (scripts/desktop/cpp-runtime.mjs).
 */

const VC_RUNTIME =
  /^(?:(?:msvcp|vcruntime|concrt|vcomp|vccorlib|mfc|msvcr)\d+\w*|ucrtbased)\.dll$/i;
const API_SET = /^(api-ms-win-|ext-ms-)/i;

/**
 * The DLLs a PE file imports, normal and delay-loaded, or null when it isn't a PE file.
 * @param {Buffer} data
 * @returns {string[] | null}
 */
export function peImports(data) {
  if (data.length < 64 || data.readUInt16LE(0) !== 0x5a4d) return null;
  const pe = data.readUInt32LE(0x3c);
  if (pe + 24 > data.length || data.readUInt32LE(pe) !== 0x4550) return null;
  const sectionCount = data.readUInt16LE(pe + 6);
  const optionalSize = data.readUInt16LE(pe + 20);
  const optional = pe + 24;
  const plus = data.readUInt16LE(optional) === 0x20b;
  const directoryCount = data.readUInt32LE(optional + (plus ? 108 : 92));
  const directories = optional + (plus ? 112 : 96);
  const sections = Array.from({ length: sectionCount }, (_, index) => {
    const at = optional + optionalSize + index * 40;
    return {
      size: Math.max(data.readUInt32LE(at + 8), data.readUInt32LE(at + 16)),
      address: data.readUInt32LE(at + 12),
      raw: data.readUInt32LE(at + 20),
    };
  });
  /** @param {number} rva */
  const offset = (rva) => {
    const section = sections.find((s) => rva >= s.address && rva < s.address + s.size);
    return section ? rva - section.address + section.raw : -1;
  };
  /** @param {number} at */
  const text = (at) => data.toString('latin1', at, data.indexOf(0, at));
  /** One import table: its descriptors end with an all-zero entry. @param {number} index @param {number} entry @param {number} nameField */
  const names = (index, entry, nameField) => {
    if (index >= directoryCount) return [];
    const found = [];
    for (let at = offset(data.readUInt32LE(directories + index * 8)); at >= 0; at += entry) {
      if (at + entry > data.length || data.subarray(at, at + entry).every((byte) => byte === 0))
        break;
      const name = offset(data.readUInt32LE(at + nameField));
      if (name >= 0) found.push(text(name));
    }
    return found;
  };
  return [...names(1, 20, 12), ...names(13, 32, 4)];
}

/**
 * Every DLL the files import that the runtime can't provide, with the files that need it.
 * @param {{ path: string, imports: string[] }[]} modules paths relative to the runtime, with "/"
 * @param {{ appDir: string, isWindowsDll: (name: string) => boolean }} where the folder of the
 *   program that loads everything (python.exe), and whether Windows itself has a DLL
 * @returns {Map<string, string[]>}
 */
export function missingImports(modules, { appDir, isWindowsDll }) {
  const folder = (/** @type {string} */ file) => file.split('/').slice(0, -1).join('/');
  const base = (/** @type {string} */ file) => (file.split('/').pop() ?? '').toLowerCase();
  const shipped = new Set(modules.map((module) => module.path.toLowerCase()));
  const anywhere = new Set(modules.map((module) => base(module.path)));
  /** @type {Map<string, string[]>} */
  const missing = new Map();
  for (const module of modules) {
    for (const name of module.imports.map((dll) => dll.toLowerCase())) {
      if (API_SET.test(name)) continue;
      const found = VC_RUNTIME.test(name)
        ? [appDir, folder(module.path)].some((dir) =>
            shipped.has((dir ? `${dir}/${name}` : name).toLowerCase()),
          )
        : anywhere.has(name) || isWindowsDll(name);
      if (!found) {
        const users = [...(missing.get(name) ?? []), module.path];
        missing.set(
          name,
          users.sort((a, b) => (a < b ? -1 : 1)),
        );
      }
    }
  }
  return missing;
}
