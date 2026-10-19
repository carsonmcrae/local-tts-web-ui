// @ts-check
/**
 * Purpose: Generate TypeScript types for the web app from the server's OpenAPI schema.
 * Scope: `ltts openapi` → openapi-typescript → apps/web/src/api/schema.gen.ts (formatted with
 *   Prettier). `--check` fails when the committed file is stale, keeping client and server in sync.
 * Does NOT belong: Hand-written API helpers (apps/web/src/api/*.ts).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';
import prettier from 'prettier';
import { BootstrapError, ok, printFailure } from './lib/log.mjs';
import { repoRoot, serverDir, webDir } from './lib/paths.mjs';
import { resolveUv, uvEnv } from './lib/uv.mjs';

const target = path.join(webDir, 'src', 'api', 'schema.gen.ts');
const header = `/**
 * Purpose: Generated TypeScript types for the local API (do not edit by hand).
 * Scope: Every request/response schema exposed by the FastAPI server.
 * Does NOT belong: Hand-written helpers — regenerate with \`npm run api:types\`.
 */
`;

async function main() {
  const uv = await resolveUv();
  const result = spawnSync(uv, ['run', '--frozen', '--project', serverDir, 'ltts', 'openapi'], {
    cwd: repoRoot,
    env: { ...uvEnv(), LTTS_WARM_UP_ENGINES: 'false' },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) throw new BootstrapError(`ltts openapi failed:\n${result.stderr}`);
  const schema = JSON.parse(result.stdout);
  const ast = await openapiTS(schema, { exportType: true, alphabetize: true });
  const options = (await prettier.resolveConfig(target)) ?? {};
  const output = await prettier.format(header + astToString(ast), { ...options, filepath: target });
  if (process.argv.includes('--check')) {
    const current = readFileSync(target, 'utf8');
    if (current !== output) {
      throw new BootstrapError('apps/web/src/api/schema.gen.ts is out of date.', ['Run `npm run api:types`.']);
    }
    ok('API types are up to date');
    return;
  }
  writeFileSync(target, output);
  ok('Wrote apps/web/src/api/schema.gen.ts');
}

main().catch((error) => {
  printFailure(error);
  process.exit(1);
});
