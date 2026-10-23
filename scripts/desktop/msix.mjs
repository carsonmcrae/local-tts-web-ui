// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Package the Windows app for the Microsoft Store as MSIX (ADR-26).
 * Scope: Lays out the Store build of TTSNative.exe and the bundled runtime, makes the tile and Store
 *   logos from the brand icon (`tauri icon`), writes AppxManifest.xml and packs it with the Windows
 *   SDK's makeappx (or TTSNATIVE_MAKEAPPX). The manifest describes a full-trust desktop app for Windows
 *   11 whose user folder (%LOCALAPPDATA%\<identifier>) is excluded from MSIX file-system
 *   virtualisation, so documents and voices are the same as the direct install's and outlive an
 *   uninstall. The identity comes from apps/desktop/store/identity.json; while it is empty the result is
 *   a test package, named so, that can be sideloaded but not uploaded. The Store signs the package.
 *   Upstream files the app never reads and MSIX can't hold are left out; any other is refused.
 * Does NOT belong: Building the program and runtime (build.mjs) or submitting to Partner Center.
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { BootstrapError, ok, step, warn } from '../lib/log.mjs';
import { repoRoot } from '../lib/paths.mjs';

const desktopDir = path.join(repoRoot, 'apps', 'desktop');
/** Windows 11 21H2: the first version with excluded directories, and the app's own minimum. */
const MIN_WINDOWS = '10.0.22000.0';
const TESTED_WINDOWS = '10.0.26100.0';
const LOGOS = ['Square44x44Logo.png', 'Square150x150Logo.png', 'StoreLogo.png'];
const TEST_IDENTITY = { name: 'TTSNative.Test', publisher: 'CN=TTSNative Test' };
/**
 * Left out of the package: python-docx ships the unpacked source of its default.docx (it only ever
 * opens default.docx and the loose default-*.xml files), whose [Content_Types].xml is a name MSIX keeps
 * for itself.
 */
const LEFT_OUT = ['python/Lib/site-packages/docx/templates/default-docx-template'];

/**
 * Runtime files the package format can't hold: MSIX writes [Content_Types].xml itself.
 * @param {string[]} files paths relative to the runtime, with "/"
 * @returns {string[]}
 */
export function unpackable(files) {
  return files.filter((file) => file.split('/').pop()?.toLowerCase() === '[content_types].xml');
}

/**
 * The four-part version MSIX needs; the Store wants the fourth part to be 0, so a development build
 * carries its release number only.
 * @param {string} version
 */
export function storeVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  const parts = match ? match.slice(1, 4).map(Number) : [];
  if (!parts.length || parts.some((part) => part > 65_535)) {
    throw new BootstrapError(`"${version}" can't be an MSIX version (four numbers up to 65535).`);
  }
  return `${parts.join('.')}.0`;
}

/**
 * @typedef {{ name: string, publisher: string, publisherDisplayName: string, storeId: string }} Identity
 */

/**
 * The Partner Center identity, or the test identity while none is recorded.
 * @param {Partial<Identity>} recorded
 * @returns {{ identity: Identity, test: boolean }}
 */
export function packageIdentity(recorded) {
  const name = recorded.name?.trim() ?? '';
  const publisher = recorded.publisher?.trim() ?? '';
  const publisherDisplayName = recorded.publisherDisplayName?.trim() ?? '';
  const storeId = recorded.storeId?.trim() ?? '';
  if (!publisherDisplayName) throw new BootstrapError('identity.json needs publisherDisplayName.');
  if (!name && !publisher) {
    return { identity: { ...TEST_IDENTITY, publisherDisplayName, storeId: '' }, test: true };
  }
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(name)) {
    throw new BootstrapError(`identity.json: "${name}" isn't a package name from Partner Center.`);
  }
  if (!/^CN=.+/.test(publisher)) {
    throw new BootstrapError(`identity.json: the publisher must be Partner Center's "CN=…" value.`);
  }
  return { identity: { name, publisher, publisherDisplayName, storeId }, test: false };
}

/** @param {string} text */
function xml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * AppxManifest.xml for the Store package.
 * @param {{ identity: Identity, version: string, displayName: string, description: string,
 *   identifier: string, executable: string }} app
 */
export function manifest({ identity, version, displayName, description, identifier, executable }) {
  return `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  xmlns:virtualization="http://schemas.microsoft.com/appx/manifest/virtualization/windows10"
  IgnorableNamespaces="uap rescap virtualization">
  <Identity Name="${xml(identity.name)}" Publisher="${xml(identity.publisher)}" Version="${storeVersion(version)}" ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>${xml(displayName)}</DisplayName>
    <PublisherDisplayName>${xml(identity.publisherDisplayName)}</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
    <virtualization:FileSystemWriteVirtualization>
      <virtualization:ExcludedDirectories>
        <virtualization:ExcludedDirectory>$(KnownFolder:LocalAppData)\\${xml(identifier)}</virtualization:ExcludedDirectory>
      </virtualization:ExcludedDirectories>
    </virtualization:FileSystemWriteVirtualization>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="${MIN_WINDOWS}" MaxVersionTested="${TESTED_WINDOWS}" />
  </Dependencies>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Applications>
    <Application Id="TTSNative" Executable="${xml(executable)}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="${xml(displayName)}" Description="${xml(description)}" BackgroundColor="transparent" Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png" />
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
    <rescap:Capability Name="unvirtualizedResources" />
  </Capabilities>
</Package>
`;
}

/** The newest makeappx.exe of the Windows SDK, or the one named in the environment. */
function makeappx() {
  const named = process.env.TTSNATIVE_MAKEAPPX;
  if (named) return named;
  const programs = process.env['ProgramFiles(x86)'] ?? String.raw`C:\Program Files (x86)`;
  const kits = path.join(programs, 'Windows Kits', '10', 'bin');
  const versions = existsSync(kits)
    ? readdirSync(kits).filter((name) => /^10(\.\d+){3}$/.test(name))
    : [];
  versions.sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  for (const version of versions) {
    const exe = path.join(kits, version, 'x64', 'makeappx.exe');
    if (existsSync(exe)) return exe;
  }
  throw new BootstrapError('makeappx.exe (Windows SDK) was not found.', [
    'Install the Windows SDK, or set TTSNATIVE_MAKEAPPX to makeappx.exe.',
  ]);
}

/**
 * @param {string} command
 * @param {string[]} args
 */
function run(command, args) {
  // makeappx prints a line for each of several thousand files: more than spawnSync's 1 MB default,
  // which would stop it part-way.
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) {
    throw new BootstrapError(`${path.basename(command)} couldn't run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    // makeappx lists every file it packs ("Processing …"); its own messages are what matter.
    const lines = `${result.stdout}${result.stderr}`
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.startsWith('Processing '));
    const errors = lines.filter((line) => /^MakeAppx\s*:\s*error/i.test(line.trim()));
    throw new BootstrapError(
      `${path.basename(command)} failed.`,
      (errors.length ? errors : lines.slice(-8)).slice(0, 12).map((line) => line.slice(0, 400)),
    );
  }
}

/**
 * Lays out and packs the Store package; returns its path.
 * @param {{ exe: string, runtime: string, version: string, out: string }} build
 */
export function packMsix({ exe, runtime, version, out }) {
  const conf = JSON.parse(
    readFileSync(path.join(desktopDir, 'src-tauri', 'tauri.conf.json'), 'utf8'),
  );
  const recorded = JSON.parse(
    readFileSync(path.join(desktopDir, 'store', 'identity.json'), 'utf8'),
  );
  const { identity, test } = packageIdentity(recorded);
  if (test) {
    warn('No Partner Center identity in apps/desktop/store/identity.json: this is a test package.');
  }
  step(`Microsoft Store package ${storeVersion(version)}${test ? ' (test identity)' : ''}…`);
  const layout = path.join(out, 'msix-layout');
  rmSync(layout, { recursive: true, force: true });
  mkdirSync(path.join(layout, 'Assets'), { recursive: true });
  const executable = `${conf.mainBinaryName}.exe`;
  copyFileSync(exe, path.join(layout, executable));
  const skipped = LEFT_OUT.map((part) => path.join(runtime, ...part.split('/')));
  cpSync(runtime, path.join(layout, 'runtime'), {
    recursive: true,
    filter: (source) =>
      !skipped.some((part) => source === part || source.startsWith(part + path.sep)),
  });
  const files = readdirSync(path.join(layout, 'runtime'), { recursive: true, encoding: 'utf8' });
  const refused = unpackable(files.map((file) => file.split(path.sep).join('/')));
  if (refused.length) {
    throw new BootstrapError(
      'The runtime holds files an MSIX package cannot.',
      refused.slice(0, 10),
    );
  }

  const icons = path.join(out, 'msix-icons');
  rmSync(icons, { recursive: true, force: true });
  run(process.execPath, [
    path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'),
    'icon',
    path.join(repoRoot, 'brand', 'svg', 'ttsnative-app-icon.svg'),
    '-o',
    icons,
  ]);
  for (const logo of LOGOS) copyFileSync(path.join(icons, logo), path.join(layout, 'Assets', logo));
  rmSync(icons, { recursive: true, force: true });

  writeFileSync(
    path.join(layout, 'AppxManifest.xml'),
    manifest({
      identity,
      version,
      displayName: conf.productName,
      description: conf.bundle.shortDescription,
      identifier: conf.identifier,
      executable,
    }),
  );
  const target = path.join(out, `TTSNative-${version}${test ? '-test' : ''}.msix`);
  run(makeappx(), ['pack', '/d', layout, '/p', target, '/o']);
  rmSync(layout, { recursive: true, force: true });
  ok(`${path.basename(target)}${test ? ' (test identity: sideload only)' : ''}`);
  return target;
}
