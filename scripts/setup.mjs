// @ts-check
/**
 * Purpose: `npm run setup` — idempotent bootstrap of everything the app needs locally.
 * Scope: Node check, pinned uv, locked Python environment, and the default Kokoro model
 *   (checksum-verified by the server's model manager). Safe to re-run at any time.
 * Does NOT belong: Starting services (dev.mjs / start.mjs) or optional engines, which users
 *   install from Settings so the basic reader never needs a GPU or multi-gigabyte downloads.
 */
import { BootstrapError, ok, printFailure, step, warn } from './lib/log.mjs';
import { assertNodeVersion, runUv, syncServerEnvironment } from './lib/python-env.mjs';

/**
 * @param {{ skipModels?: boolean }} [options]
 * @returns {Promise<{ uv: string, modelReady: boolean }>}
 */
export async function setup({ skipModels = process.env.LTTS_SKIP_MODEL_DOWNLOAD === '1' } = {}) {
  assertNodeVersion();
  ok(`Node.js ${process.versions.node}`);
  const uv = await syncServerEnvironment();
  if (skipModels) {
    warn('LTTS_SKIP_MODEL_DOWNLOAD=1 — install the Kokoro model later from Settings.');
    return { uv, modelReady: false };
  }
  step('Checking the default Kokoro voice model…');
  const result = runUv(uv, ['run', '--frozen', '--project', 'apps/server', 'ltts', 'models', 'ensure', 'kokoro'], {
    cwd: process.cwd(),
  });
  if (result.status !== 0) {
    warn('The default Kokoro model is not installed yet (see the message above).');
    warn('The app still starts; retry from Settings → Engines & models.');
    return { uv, modelReady: false };
  }
  return { uv, modelReady: true };
}

const invokedDirectly = process.argv[1]?.replaceAll('\\', '/').endsWith('scripts/setup.mjs');
if (invokedDirectly) {
  setup()
    .then(({ modelReady }) => {
      if (!modelReady && process.env.LTTS_SKIP_MODEL_DOWNLOAD !== '1') {
        throw new BootstrapError('Setup finished, but the default voice model is missing.', [
          'Re-run `npm run setup` once you are online, or install it from Settings.',
        ]);
      }
      ok('Setup complete. Start the app with `npm run dev`.');
    })
    .catch((error) => {
      printFailure(error);
      process.exit(1);
    });
}
