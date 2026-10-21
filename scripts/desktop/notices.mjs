// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Ship the licence notices the Windows installer owes for everything it redistributes.
 * Scope: Copies apps/desktop/licenses into runtime/licenses and writes runtime/THIRD-PARTY-NOTICES.txt:
 *   the written offer of GPL/LGPL source (published with each release) and how to replace the LGPL
 *   library, CPython and its libraries, every Python package (fails when one has no licence file and
 *   no reviewed text in apps/desktop/licenses/python-packages), native libraries inside packages, every
 *   Rust crate compiled for the Windows shell (from `cargo metadata`, with its crates.io source and
 *   de-duplicated licence texts), uv, the installer and the Kokoro model.
 *   Usage: `node scripts/desktop/notices.mjs <version>` after build-runtime.mjs (needs cargo).
 * Does NOT belong: Building the runtime (build-runtime.mjs) or the web UI's own notices (vite.config.ts).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '../lib/paths.mjs';

const REPO = 'carsonmcrae/ttsnative';
const runtime = path.join(repoRoot, 'apps', 'desktop', 'runtime');
const site = path.join(runtime, 'python', 'Lib', 'site-packages');
const vendored = path.join(repoRoot, 'apps', 'desktop', 'licenses');
const LICENCE_FILE = /^(LICEN[CS]E|COPYING|NOTICE|COPYRIGHT)/i;
/** Packages that carry no licence file and need a note instead of a vendored text. */
const NOTES = {
  'espeakng-loader':
    'No licence file was published for this version (its repository is MIT-licensed since November 2025). It contains espeak-ng 1.52.0 and its data, GPL-3.0-or-later: licenses\\GPL-3.0.txt and licenses\\espeak-ng\\.',
  flatbuffers: 'Apache-2.0, Copyright Google Inc.: licenses\\Apache-2.0.txt.',
  ltts: 'TTSNative itself (MIT): LICENSE.txt.',
  onnxruntime:
    'MIT, Microsoft: onnxruntime\\LICENSE, with third-party notices in onnxruntime\\ThirdPartyNotices.txt. onnxruntime.dll includes Eigen under MPL-2.0 (licenses\\MPL-2.0.txt): its source is at https://gitlab.com/libeigen/eigen, and the version used is named in https://github.com/microsoft/onnxruntime (cmake/deps.txt, at the tag of this onnxruntime version).',
};
/** Native code inside packages that brings licences of its own. */
const NATIVE = {
  soundfile:
    'libsndfile_x64.dll contains libsndfile, LAME and mpg123 (LGPL-2.1-or-later; licenses\\LGPL-2.1.txt and _soundfile_data\\COPYING) and FLAC, Ogg, Vorbis and Opus (BSD-3-Clause). It is a separate library: you may replace python\\Lib\\site-packages\\_soundfile_data\\libsndfile_x64.dll with your own build of a compatible version.',
  'espeakng-loader':
    'espeak-ng: GPL-3.0-or-later, with sonic (Apache-2.0) compiled in (see the source offer above).',
  phonemizer: 'GPL-3.0-or-later (see the source offer above).',
  lxml: 'Statically includes libxml2 and libxslt (MIT), zlib, and GNU libiconv (LGPL-2.1); see lxml-*.dist-info\\licenses\\LICENSES.txt and the source offer above.',
  pypdfium2:
    'Includes PDFium and its libraries (BUILD_LICENSES in pypdfium2-*.dist-info). Portions of this software are copyright © The FreeType Project (www.freetype.org). All rights reserved. This software is based in part on the work of the Independent JPEG Group.',
  numpy:
    'Includes OpenBLAS and libgfortran (GPL with the GCC Runtime Library Exception); see numpy-*.dist-info\\licenses.',
};

/** A licence file by its name, or any file inside a "licenses" folder. @param {string} file */
const isLicence = (file) =>
  LICENCE_FILE.test(path.basename(file)) ||
  file
    .split(/[\\/]/)
    .slice(0, -1)
    .some((part) => /^licen[cs]es?$/i.test(part));

/** Licence files (not folders) anywhere below a directory, as relative paths. @param {string} dir */
const licenceFiles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true })
        .map(String)
        .filter((f) => isLicence(f) && statSync(path.join(dir, f)).isFile())
    : [];

/** A package's name, version and licence from its METADATA. @param {string} dir */
function packageMetadata(dir) {
  const meta = readFileSync(path.join(site, dir, 'METADATA'), 'utf8');
  const field = (/** @type {RegExp} */ pattern) => pattern.exec(meta)?.[1]?.trim();
  return {
    name: field(/^Name: (.+)$/m) ?? dir,
    version: field(/^Version: (.+)$/m) ?? '',
    licence:
      field(/^License-Expression: (.+)$/m) ??
      field(/^Classifier: License :: (?:OSI Approved :: )?(.+)$/m) ??
      field(/^License: (.{1,60})/m) ??
      'see note',
  };
}

function pythonPackages() {
  const problems = [];
  const lines = [];
  const reviewed = readdirSync(path.join(vendored, 'python-packages'));
  const dirs = readdirSync(site).filter((d) => d.endsWith('.dist-info'));
  for (const dir of dirs.sort()) {
    const { name, version, licence } = packageMetadata(dir);
    const key = name.toLowerCase().replaceAll('_', '-');
    const files = licenceFiles(path.join(site, dir)).map(
      (f) => `${dir}\\${f.replaceAll('/', '\\')}`,
    );
    const extra = reviewed
      .filter((f) => f.startsWith(`${key}-${version}-`))
      .map((f) => `licenses\\python-packages\\${f}`);
    const notes = [
      NOTES[/** @type {keyof typeof NOTES} */ (key)],
      NATIVE[/** @type {keyof typeof NATIVE} */ (key)],
    ];
    if (!files.length && !extra.length && !notes[0]) {
      problems.push(`${name} ${version} has no licence file or reviewed text`);
    }
    lines.push(
      `${name} ${version} — ${licence}`,
      ...[...files, ...extra, ...notes.filter(Boolean)].map((x) => `    ${x}`),
    );
  }
  return { lines, problems };
}

function rustCrates() {
  const metadata = JSON.parse(
    execFileSync(
      process.env.CARGO ?? 'cargo',
      [
        'metadata',
        '--locked',
        '--format-version',
        '1',
        '--filter-platform',
        'x86_64-pc-windows-msvc',
      ],
      {
        cwd: path.join(repoRoot, 'apps', 'desktop', 'src-tauri'),
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      },
    ),
  );
  const used = new Set(metadata.resolve.nodes.map((/** @type {{ id: string }} */ node) => node.id));
  /** @type {Map<string, { text: string, crates: string[] }>} */
  const texts = new Map();
  const list = [];
  for (const pkg of metadata.packages) {
    if (!used.has(pkg.id) || !pkg.source) continue; // the app's own crate has no registry source
    const dir = path.dirname(pkg.manifest_path);
    list.push(
      `${pkg.name} ${pkg.version} — ${pkg.license ?? 'see text'} — https://crates.io/crates/${pkg.name}/${pkg.version}`,
    );
    for (const file of licenceFiles(dir).filter((f) => !f.includes(path.sep) && !f.includes('/'))) {
      const text = readFileSync(path.join(dir, file), 'utf8').trim();
      const hash = createHash('sha256').update(text).digest('hex');
      const entry = texts.get(hash) ?? { text, crates: [] };
      entry.crates.push(`${pkg.name} ${pkg.version}`);
      texts.set(hash, entry);
    }
  }
  const blocks = [...texts.values()].map(
    ({ text, crates }) => `----- ${crates.join(', ')}\n\n${text}\n`,
  );
  return { count: list.length, list: list.sort(), blocks };
}

function main() {
  const version = process.argv[2] ?? 'development build';
  cpSync(vendored, path.join(runtime, 'licenses'), { recursive: true });
  const python = pythonPackages();
  if (python.problems.length) {
    console.error(`Licence review needed before shipping:\n  ${python.problems.join('\n  ')}`);
    process.exit(1);
  }
  const rust = rustCrates();
  const sources = `https://github.com/${REPO}/releases/download/v${version}/ttsnative-${version}-third-party-sources.tar.gz`;
  const text = `TTSNative ${version} — third-party software notices

TTSNative is free software under the MIT License (LICENSE.txt). It includes the third-party software
listed below, each under its own licence. Licence texts are in the "licenses" folder next to this file,
in python\\LICENSE.txt, in each Python package's .dist-info folder, and further down in this file.

SOURCE CODE OFFER (GPL and LGPL components)
espeak-ng and phonemizer (GPL-3.0-or-later), and libsndfile with LAME and mpg123 and GNU libiconv
(LGPL-2.1-or-later), are distributed under the GNU licences in licenses\\GPL-3.0.txt and
licenses\\LGPL-2.1.txt. Their complete corresponding source code, with the scripts used to build the
binaries included here, is published next to each official release as
  ${sources}
(all releases: https://github.com/${REPO}/releases), for as long as that release is offered and for
at least three years. You may also ask for it by opening an issue at https://github.com/${REPO}/issues.

1. PYTHON RUNTIME
CPython 3.12 (python-build-standalone), Python Software Foundation License: python\\LICENSE.txt.
It includes bzip2, expat, libffi, liblzma, mpdecimal, OpenSSL 3, SQLite and zlib: licenses\\python\\.

2. PYTHON PACKAGES
${python.lines.join('\n')}

3. uv (installs the optional voice-cloning engine on request): MIT OR Apache-2.0, licenses\\uv\\.

4. INSTALLER
Built with NSIS (zlib/libpng licence; https://nsis.sourceforge.io/License) and nsis_tauri_utils
(MIT OR Apache-2.0); uninstall.exe is produced by NSIS.

5. VOICE MODEL
Kokoro 82M v1.0 (Apache-2.0): licenses\\kokoro\\README.txt and licenses\\Apache-2.0.txt.

6. WEB INTERFACE
Bundled JavaScript packages and fonts: web\\THIRD-PARTY-LICENSES.md and web\\FONT-LICENSES.txt.

7. TTSNative.exe (Rust crates compiled into the desktop shell for Windows: ${rust.count})
Each crate's source is at the address shown. The Microsoft WebView2 loader is linked through
webview2-com-sys; its licence is among the texts below.
${rust.list.join('\n')}

LICENCE TEXTS OF THE RUST CRATES (each text once, with the crates it applies to)

${rust.blocks.join('\n')}`;
  writeFileSync(
    path.join(runtime, 'THIRD-PARTY-NOTICES.txt'),
    text.replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'),
  );
  console.log(
    `Notices written: ${python.lines.length} Python lines, ${rust.count} Rust crates, ${rust.blocks.length} distinct crate licence texts`,
  );
}

main();
