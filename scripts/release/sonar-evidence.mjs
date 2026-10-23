// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: `npm run sonar:evidence -- <X.Y.Z>` — record SonarQube's result for the release gate.
 * Scope: After a scan (`npm run sonar`) has finished processing, asks the server named in
 *   sonar-project.properties (or SONAR_HOST_URL) for the project's newest analysis, its quality gate
 *   and its measures, and writes docs/readiness/X.Y.Z/quality.json. The token comes only from
 *   SONAR_TOKEN and is never written or printed.
 * Does NOT belong: Running the scan or judging the evidence (lib/gate.mjs).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { QUALITY_METRICS, qualityEvidence, readinessDir } from '../lib/gate.mjs';
import { BootstrapError, ok, printFailure } from '../lib/log.mjs';
import { repoRoot } from '../lib/paths.mjs';
import { sonarApi, sonarSettings } from '../lib/sonar.mjs';

async function main() {
  const version = (process.argv[2] ?? '').replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new BootstrapError('Say which version this evidence is for.', [
      'npm run sonar:evidence -- 2.2.0',
    ]);
  }
  const sonar = sonarSettings();
  const project = encodeURIComponent(sonar.project);
  const analyses = await sonarApi(sonar, `/api/project_analyses/search?project=${project}&ps=1`);
  const gate = await sonarApi(sonar, `/api/qualitygates/project_status?projectKey=${project}`);
  const measures = await sonarApi(
    sonar,
    `/api/measures/component?component=${project}&metricKeys=${QUALITY_METRICS.join(',')}`,
  );
  const analysis = analyses.analyses?.[0];
  if (!analysis)
    throw new BootstrapError('SonarQube has no analysis of this project yet.', ['npm run sonar']);
  const evidence = qualityEvidence(
    version,
    analysis,
    gate.projectStatus,
    measures.component?.measures ?? [],
  );
  const dir = path.join(repoRoot, readinessDir(version));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'quality.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  ok(
    `Recorded SonarQube ${evidence.gate} for ${evidence.commit.slice(0, 7)} in ${readinessDir(version)}/quality.json`,
  );
}

try {
  await main();
} catch (error) {
  printFailure(error);
  process.exit(1);
}
