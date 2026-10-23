// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for reading a PE file's DLL imports and finding the ones a runtime can't provide.
 * Scope: Normal and delay-load imports in PE32+ and PE32 files built here byte by byte, files that
 *   aren't PE, and the rules for where each kind of DLL must be (the Visual C++ runtime, other shipped
 *   DLLs, Windows' own, API sets).
 * Does NOT belong: Scanning a real runtime folder (scripts/desktop/cpp-runtime.mjs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { missingImports, peImports } from './pe-imports.mjs';

const SECTION_RVA = 0x1000;
const SECTION_RAW = 0x400;

/**
 * A minimal PE file with one section holding the import tables.
 * @param {{ imports?: string[], delay?: string[], plus?: boolean, directoryCount?: number }} options
 */
function peFile({ imports = [], delay = [], plus = true, directoryCount = 16 }) {
  const data = Buffer.alloc(SECTION_RAW + 0x400);
  data.write('MZ', 0, 'latin1');
  const pe = 0x40;
  data.writeUInt32LE(pe, 0x3c);
  data.write('PE\0\0', pe, 'latin1');
  data.writeUInt16LE(1, pe + 6);
  const optionalSize = plus ? 240 : 224;
  data.writeUInt16LE(optionalSize, pe + 20);
  const optional = pe + 24;
  data.writeUInt16LE(plus ? 0x20b : 0x10b, optional);
  data.writeUInt32LE(directoryCount, optional + (plus ? 108 : 92));
  const directories = optional + (plus ? 112 : 96);
  const section = optional + optionalSize;
  data.writeUInt32LE(0x400, section + 8);
  data.writeUInt32LE(SECTION_RVA, section + 12);
  data.writeUInt32LE(0x400, section + 16);
  data.writeUInt32LE(SECTION_RAW, section + 20);

  const importTable = 0;
  const delayTable = (imports.length + 1) * 20;
  let names = delayTable + (delay.length + 1) * 32;
  /** @param {string[]} list @param {number} table @param {number} entry @param {number} field */
  const fill = (list, table, entry, field) => {
    for (const [index, name] of list.entries()) {
      data.writeUInt32LE(SECTION_RVA + names, SECTION_RAW + table + index * entry + field);
      data.write(`${name}\0`, SECTION_RAW + names, 'latin1');
      names += name.length + 1;
    }
  };
  fill(imports, importTable, 20, 12);
  fill(delay, delayTable, 32, 4);
  if (imports.length) data.writeUInt32LE(SECTION_RVA + importTable, directories + 8);
  if (delay.length) data.writeUInt32LE(SECTION_RVA + delayTable, directories + 13 * 8);
  return data;
}

test('reads normal and delay-load imports from PE32+ and PE32 files', () => {
  const imports = ['KERNEL32.dll', 'MSVCP140.dll', 'onnxruntime.dll'];
  assert.deepEqual(peImports(peFile({ imports, delay: ['dbghelp.dll'] })), [
    ...imports,
    'dbghelp.dll',
  ]);
  assert.deepEqual(peImports(peFile({ imports: ['python312.dll'], plus: false })), [
    'python312.dll',
  ]);
  assert.deepEqual(peImports(peFile({})), []);
  // An old header without the delay-load directory: only the normal imports exist.
  assert.deepEqual(peImports(peFile({ imports: ['a.dll'], delay: ['b.dll'], directoryCount: 2 })), [
    'a.dll',
  ]);
});

test('answers null for files that are not PE files', () => {
  assert.equal(peImports(Buffer.from('not a program')), null);
  const noSignature = peFile({ imports: ['a.dll'] });
  noSignature.write('XX', 0x40, 'latin1');
  assert.equal(peImports(noSignature), null);
  const outOfRange = peFile({});
  outOfRange.writeUInt32LE(outOfRange.length, 0x3c);
  assert.equal(peImports(outOfRange), null);
});

test('the Visual C++ runtime must ship next to python.exe or the file that loads it', () => {
  const windows = new Set(['kernel32.dll', 'msvcp140.dll', 'vcruntime140.dll']);
  const isWindowsDll = (/** @type {string} */ name) => windows.has(name);
  const modules = [
    { path: 'python/python.exe', imports: ['KERNEL32.dll', 'VCRUNTIME140.dll'] },
    { path: 'python/vcruntime140.dll', imports: ['api-ms-win-crt-runtime-l1-1-0.dll'] },
    {
      path: 'python/Lib/site-packages/onnxruntime/capi/onnxruntime.dll',
      imports: ['MSVCP140.dll', 'MSVCP140_1.dll', 'VCRUNTIME140.dll', 'kernel32.dll'],
    },
    {
      path: 'python/Lib/site-packages/espeakng_loader/espeak-ng.dll',
      imports: ['MSVCP140.dll', 'missing-helper.dll'],
    },
    {
      path: 'python/Lib/site-packages/numpy/_core/_multiarray_umath.pyd',
      imports: ['msvcp140-a4c2229bdc2a2a630acdc095b4d86008.dll', 'python312.dll'],
    },
    {
      path: 'python/Lib/site-packages/numpy.libs/msvcp140-a4c2229bdc2a2a630acdc095b4d86008.dll',
      imports: [],
    },
    { path: 'python/python312.dll', imports: [] },
  ];
  const missing = missingImports(modules, { appDir: 'python', isWindowsDll });
  // Installed on the build machine (in System32) is not enough for the C++ runtime.
  assert.deepEqual(
    [...missing.entries()],
    [
      [
        'msvcp140.dll',
        [
          'python/Lib/site-packages/espeakng_loader/espeak-ng.dll',
          'python/Lib/site-packages/onnxruntime/capi/onnxruntime.dll',
        ],
      ],
      ['msvcp140_1.dll', ['python/Lib/site-packages/onnxruntime/capi/onnxruntime.dll']],
      ['missing-helper.dll', ['python/Lib/site-packages/espeakng_loader/espeak-ng.dll']],
    ],
  );

  const fixed = [
    ...modules,
    { path: 'python/msvcp140.dll', imports: ['VCRUNTIME140.dll'] },
    { path: 'python/Lib/site-packages/onnxruntime/capi/msvcp140_1.dll', imports: [] },
    { path: 'python/Lib/site-packages/espeakng_loader/missing-helper.dll', imports: [] },
  ];
  assert.equal(missingImports(fixed, { appDir: 'python', isWindowsDll }).size, 0);
});

test('a runtime with the program at its root finds the C++ runtime there', () => {
  const modules = [
    { path: 'app.exe', imports: ['vcruntime140.dll'] },
    { path: 'vcruntime140.dll', imports: [] },
  ];
  assert.equal(missingImports(modules, { appDir: '', isWindowsDll: () => false }).size, 0);
});
