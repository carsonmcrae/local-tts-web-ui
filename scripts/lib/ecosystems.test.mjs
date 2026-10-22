// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for spotting files that bring in an ecosystem without security tooling.
 * Scope: PHP and the other unsupported languages, package managers and container images are named;
 *   the project's own npm, uv, Cargo and GitHub Actions files, and its source files, are not.
 * Does NOT belong: The repository walk or the report (check-ecosystems.mjs).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unsupportedFiles } from './ecosystems.mjs';

const names = (/** @type {string[]} */ files) => unsupportedFiles(files).map(({ name }) => name);

test('PHP is caught by its source files and by Composer', () => {
  assert.deepEqual(
    names(['site/contact.php', 'tools/view.phtml', 'composer.json', 'apps/x/composer.lock']),
    ['PHP', 'PHP', 'PHP', 'PHP'],
  );
});

test('other languages, package managers and container images are named', () => {
  assert.deepEqual(
    names([
      'Gemfile',
      'tools/build.go',
      'android/build.gradle.kts',
      'win/App.csproj',
      'ios/Podfile',
      'mobile/pubspec.yaml',
      'mix.exs',
      'scripts/tidy.pl',
      'plugin/init.lua',
      'yarn.lock',
      'apps/server/requirements-dev.txt',
      'Dockerfile.server',
      'compose.yaml',
    ]),
    [
      'Ruby',
      'Go',
      'Java, Kotlin or Scala (JVM)',
      '.NET',
      'Swift or CocoaPods',
      'Dart or Flutter',
      'Elixir or Erlang',
      'Perl',
      'Lua',
      'a JavaScript package manager other than npm',
      'a Python package manager other than uv',
      'a container image',
      'a container image',
    ],
  );
});

test("the project's own ecosystems and files pass", () => {
  assert.deepEqual(
    unsupportedFiles([
      'package.json',
      'package-lock.json',
      'apps/server/pyproject.toml',
      'apps/server/uv.lock',
      'apps/server/src/ltts/app.py',
      'apps/desktop/src-tauri/Cargo.toml',
      'apps/desktop/src-tauri/src/main.rs',
      '.github/workflows/ci.yml',
      'apps/web/src/main.tsx',
      'scripts/check-changes.mjs',
      'site/demo.js',
      'docs/guides/composer-notes.md',
      'apps/web/public/music/golden.webm',
    ]),
    [],
  );
});
