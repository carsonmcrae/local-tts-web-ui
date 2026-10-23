// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: `npm run sonar:gate` — make the SonarQube server judge this project by the project's own
 *   policy instead of the server's default gate (80 % coverage on new code, up to 3 % duplication).
 * Scope: Creates or updates a quality gate named "TTSNative" with 100 % coverage, no duplication, no
 *   open issue and every security hotspot reviewed, on new code and on the whole project, and selects
 *   it for the project. Safe to run again. The release gate checks the same thresholds on the recorded
 *   measures (QUALITY_POLICY in lib/gate.mjs), so a server reset can't loosen a release.
 * Does NOT belong: Scanning (`npm run sonar`) or recording the result (sonar-evidence.mjs).
 */
import { BootstrapError, ok, printFailure } from '../lib/log.mjs';
import { sonarApi, sonarSettings } from '../lib/sonar.mjs';

const GATE = 'TTSNative';
/** The policy as SonarQube conditions: a condition fails the gate when its metric is beyond `error`. */
const CONDITIONS = [
  { metric: 'new_coverage', op: 'LT', error: '100' },
  { metric: 'coverage', op: 'LT', error: '100' },
  { metric: 'new_duplicated_lines_density', op: 'GT', error: '0' },
  { metric: 'duplicated_lines_density', op: 'GT', error: '0' },
  { metric: 'new_violations', op: 'GT', error: '0' },
  { metric: 'violations', op: 'GT', error: '0' },
  { metric: 'new_security_hotspots_reviewed', op: 'LT', error: '100' },
  { metric: 'security_hotspots_reviewed', op: 'LT', error: '100' },
];

async function main() {
  const sonar = sonarSettings();
  const show = `/api/qualitygates/show?name=${encodeURIComponent(GATE)}`;
  if (!(await sonarApi(sonar, show)))
    await sonarApi(sonar, '/api/qualitygates/create', { name: GATE });
  const gate = await sonarApi(sonar, show);
  if (!gate) throw new BootstrapError(`SonarQube didn't create the "${GATE}" gate.`, []);
  /** @type {{ id: string, metric: string }[]} */
  const existing = gate.conditions ?? [];
  for (const wanted of CONDITIONS) {
    const current = existing.find((condition) => condition.metric === wanted.metric);
    if (current)
      await sonarApi(sonar, '/api/qualitygates/update_condition', { id: current.id, ...wanted });
    else await sonarApi(sonar, '/api/qualitygates/create_condition', { gateName: GATE, ...wanted });
  }
  for (const extra of existing.filter((c) => !CONDITIONS.some((w) => w.metric === c.metric))) {
    await sonarApi(sonar, '/api/qualitygates/delete_condition', { id: extra.id });
  }
  await sonarApi(sonar, '/api/qualitygates/select', { gateName: GATE, projectKey: sonar.project });
  ok(`SonarQube judges ${sonar.project} by the "${GATE}" gate (${CONDITIONS.length} conditions)`);
}

try {
  await main();
} catch (error) {
  printFailure(error);
  process.exit(1);
}
