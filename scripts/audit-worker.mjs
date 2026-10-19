// @ts-check
/**
 * Purpose: `npm run security` step that audits the optional Chatterbox voice-cloning environment.
 * Scope: Exports both locked extras (CPU and CUDA) with hashes from apps/chatterbox-worker/uv.lock and
 *   runs pip-audit on each without installing anything (`--disable-pip`). Uses the OSV service because
 *   PyTorch's local builds (`+cpu`, `+cu126`) are not on PyPI, so the PyPI service would skip torch.
 * Does NOT belong: The server audit (package.json) or the reasoning behind each ignored advisory, which
 *   lives in docs/security/supply-chain.md.
 */
import path from 'node:path';
import { BootstrapError, ok, printFailure, step } from './lib/log.mjs';
import { repoRoot, serverDir, toolsDir } from './lib/paths.mjs';
import { runUv } from './lib/python-env.mjs';
import { resolveUv } from './lib/uv.mjs';

const workerDir = path.join(repoRoot, 'apps', 'chatterbox-worker');

// Reviewed, unfixable-for-now advisories; each one is justified in docs/security/supply-chain.md.
const IGNORED = [
  'PYSEC-2025-194', // torch.jit.script memory corruption: never called; the fix (2.13) has no torchaudio
  'PYSEC-2026-3447', // setuptools sdist MANIFEST.in bypass: no sdists are built; <81 kept for Perth
];

// The export carries hashes, so pip-audit can read it as-is instead of installing it with pip.
const EXPORT = [
  'export',
  '--frozen',
  '--no-dev',
  '--no-emit-project',
  '--format',
  'requirements-txt',
];
const AUDIT = ['run', '--frozen', 'pip-audit', '--strict', '--disable-pip'];

async function main() {
  const uv = await resolveUv({ allowDownload: false });
  const ignore = IGNORED.flatMap((id) => ['--ignore-vuln', id]);
  for (const extra of ['cpu', 'cuda']) {
    const requirements = path.join(toolsDir, `worker-requirements-${extra}.txt`);
    step(`Auditing the Chatterbox environment (${extra})…`);
    const exportArgs = [...EXPORT, '--extra', extra, '-o', requirements, '--quiet'];
    if (runUv(uv, exportArgs, { cwd: workerDir }).status !== 0) {
      throw new BootstrapError(`uv export of the ${extra} extra failed.`);
    }
    const auditArgs = [...AUDIT, '--vulnerability-service', 'osv', ...ignore, '-r', requirements];
    const audit = runUv(uv, auditArgs, { cwd: serverDir });
    if (audit.status !== 0) {
      throw new BootstrapError(`pip-audit found unreviewed advisories in the ${extra} extra.`, [
        'Fix them (override in apps/chatterbox-worker/pyproject.toml) or, if unreachable, add the ID',
        'here with a justification in docs/security/supply-chain.md.',
      ]);
    }
  }
  ok('Chatterbox environment: no unreviewed advisories.');
}

main().catch((error) => {
  printFailure(error);
  process.exit(1);
});
