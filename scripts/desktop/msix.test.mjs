// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for the Microsoft Store package's version, identity and manifest.
 * Scope: The four-part version from release and development versions, the test identity while
 *   Partner Center's is missing and refusals of a half-filled or malformed one, and the manifest: full
 *   trust on Windows 11, the user folder outside file-system virtualisation, the logos, and escaping;
 *   runtime files the package can't hold.
 * Does NOT belong: Packing with makeappx (needs the Windows SDK; the release workflow does it).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { manifest, packageIdentity, storeVersion, unpackable } from './msix.mjs';

test('MSIX versions have four numbers and end in 0', () => {
  assert.equal(storeVersion('2.2.0'), '2.2.0.0');
  assert.equal(storeVersion('2.2.0-dev.440+feat-store.0354045742'), '2.2.0.0');
  assert.equal(storeVersion('10.0.65535'), '10.0.65535.0');
  assert.throws(() => storeVersion('2.2'), /can't be an MSIX version/);
  assert.throws(() => storeVersion('2.2.65536'), /can't be an MSIX version/);
});

test('a test identity stands in until Partner Center gives one, and half of one is refused', () => {
  assert.deepEqual(
    packageIdentity({ name: '', publisher: '', publisherDisplayName: 'Carson McRae' }),
    {
      identity: {
        name: 'TTSNative.Test',
        publisher: 'CN=TTSNative Test',
        publisherDisplayName: 'Carson McRae',
        storeId: '',
      },
      test: true,
    },
  );
  const real = {
    name: '12345CarsonMcRae.TTSNative',
    publisher: 'CN=0A1B2C3D-0000-1111-2222-333344445555',
    publisherDisplayName: 'Carson McRae',
    storeId: '9NABCDEFGHIJ',
  };
  assert.deepEqual(packageIdentity(real), { identity: real, test: false });
  assert.throws(() => packageIdentity({ ...real, publisher: '' }), /CN=/);
  assert.throws(() => packageIdentity({ ...real, name: '' }), /isn't a package name/);
  assert.throws(() => packageIdentity({ ...real, name: 'has spaces' }), /isn't a package name/);
  assert.throws(
    () => packageIdentity({ ...real, publisherDisplayName: ' ' }),
    /publisherDisplayName/,
  );
});

test('the manifest is a full-trust Windows 11 app that keeps its user folder outside the package', () => {
  const xml = manifest({
    identity: packageIdentity({ publisherDisplayName: 'Carson & Co' }).identity,
    version: '2.2.0-dev.1',
    displayName: 'TTSNative',
    description: 'Reads "documents" <aloud>',
    identifier: 'com.ttsnative.desktop',
    executable: 'TTSNative.exe',
  });
  assert.match(
    xml,
    /<Identity Name="TTSNative.Test" Publisher="CN=TTSNative Test" Version="2.2.0.0" /,
  );
  assert.match(xml, /<PublisherDisplayName>Carson &amp; Co<\/PublisherDisplayName>/);
  assert.match(xml, /Description="Reads &quot;documents&quot; &lt;aloud&gt;"/);
  assert.match(xml, /Executable="TTSNative.exe" EntryPoint="Windows.FullTrustApplication"/);
  assert.match(xml, /MinVersion="10.0.22000.0"/);
  assert.match(
    xml,
    /<virtualization:ExcludedDirectory>\$\(KnownFolder:LocalAppData\)\\com\.ttsnative\.desktop<\/virtualization:ExcludedDirectory>/,
  );
  assert.match(xml, /<rescap:Capability Name="runFullTrust" \/>/);
  assert.match(xml, /<rescap:Capability Name="unvirtualizedResources" \/>/);
  for (const logo of ['StoreLogo', 'Square150x150Logo', 'Square44x44Logo']) {
    assert.match(xml, new RegExp(`Assets\\\\${logo}\\.png`));
  }
});

test('a [Content_Types].xml anywhere in the runtime is refused, whatever its case', () => {
  assert.deepEqual(
    unpackable([
      'python/Lib/os.py',
      'python/Lib/site-packages/docx/templates/default-docx-template/[Content_Types].xml',
      'python/Lib/site-packages/other/[CONTENT_TYPES].XML',
      'python/Lib/site-packages/other/Content_Types.xml',
    ]),
    [
      'python/Lib/site-packages/docx/templates/default-docx-template/[Content_Types].xml',
      'python/Lib/site-packages/other/[CONTENT_TYPES].XML',
    ],
  );
});
