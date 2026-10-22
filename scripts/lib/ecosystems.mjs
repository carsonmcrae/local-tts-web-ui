// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Recognise files that bring in a language, runtime or package manager this project has no
 *   security tooling for.
 * Scope: The project's own ecosystems are npm, Python through uv, Rust through Cargo and GitHub
 *   Actions; each has Dependabot updates, an audit and a code scanner. Anything else (PHP, Ruby, Go,
 *   the JVM, .NET, other JavaScript or Python package managers, container images and so on) is
 *   reported with its name, so it can't arrive in a pull request before its tooling does.
 * Does NOT belong: Listing the files (repo-files.mjs) or reporting them (check-ecosystems.mjs).
 */

/** Each unsupported ecosystem and the file names or extensions that bring it in. */
const UNSUPPORTED = [
  { name: 'PHP', pattern: /(^|\/)composer\.(json|lock)$|\.(php|phtml|phar)$/ },
  { name: 'Ruby', pattern: /(^|\/)Gemfile(\.lock)?$|\.(rb|gemspec)$/ },
  { name: 'Go', pattern: /(^|\/)go\.(mod|sum|work)$|\.go$/ },
  {
    name: 'Java, Kotlin or Scala (JVM)',
    pattern:
      /(^|\/)(pom\.xml|gradlew|(build|settings)\.gradle(\.kts)?)$|\.(java|kt|kts|scala|jar)$/,
  },
  {
    name: '.NET',
    pattern: /(^|\/)(packages\.config|nuget\.config)$|\.(cs|fs|vb|csproj|fsproj|vbproj|sln)$/i,
  },
  { name: 'Swift or CocoaPods', pattern: /(^|\/)(Package\.swift|Podfile(\.lock)?)$|\.swift$/ },
  { name: 'Dart or Flutter', pattern: /(^|\/)pubspec\.(yaml|lock)$|\.dart$/ },
  { name: 'Elixir or Erlang', pattern: /(^|\/)(mix\.(exs|lock)|rebar\.config)$|\.(ex|exs|erl)$/ },
  { name: 'Perl', pattern: /(^|\/)cpanfile$|\.(pl|pm)$/ },
  { name: 'Lua', pattern: /\.(lua|rockspec)$/ },
  {
    name: 'a JavaScript package manager other than npm',
    pattern: /(^|\/)(yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|deno\.(json|jsonc|lock))$/,
  },
  {
    name: 'a Python package manager other than uv',
    pattern: /(^|\/)(requirements[^/]*\.txt|Pipfile(\.lock)?|poetry\.lock|setup\.py|setup\.cfg)$/,
  },
  {
    name: 'a container image',
    pattern: /(^|\/)(Dockerfile[^/]*|[^/]*\.dockerfile|(docker-)?compose\.ya?ml)$/i,
  },
];

/**
 * The files that bring in an ecosystem the project has no security tooling for, with its name.
 * @param {string[]} files repository-relative paths with forward slashes
 * @returns {{ file: string, name: string }[]}
 */
export function unsupportedFiles(files) {
  return files.flatMap((file) => {
    const match = UNSUPPORTED.find(({ pattern }) => pattern.test(file));
    return match ? [{ file, name: match.name }] : [];
  });
}
