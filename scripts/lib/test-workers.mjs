// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: How many Vitest workers a test run starts, from the CPUs that are free when it starts.
 * Scope: Each web test is CPU-bound jsdom work with a 5 s limit, so a worker needs a CPU of its own: the
 *   run uses no more workers than CPUs idle right now (one stays free for Vitest itself) and, on machines
 *   with 8 or more logical CPUs, no more than half of them (about one per physical core). An idle CI
 *   runner gets the usual logical CPUs minus one; a machine busy with other work gets fewer, faster workers.
 * Does NOT belong: The rest of the Vitest configuration (apps/web/vite.config.ts).
 */
import os from 'node:os';

/**
 * @param {number} logical the machine's logical CPUs
 * @param {number} idle how many of them are idle (fractions allowed)
 * @returns {number} the number of workers, at least 1
 */
export function testWorkers(logical, idle) {
  const perCore = logical >= 8 ? Math.floor(logical / 2) : logical - 1;
  return Math.max(1, Math.min(perCore, Math.round(idle) - 1));
}

/**
 * How many CPUs were idle over the next `ms` milliseconds (the sum of each CPU's idle share).
 * @param {number} [ms]
 * @returns {Promise<number>}
 */
export async function idleCpus(ms = 300) {
  const before = os.cpus();
  await new Promise((resolve) => setTimeout(resolve, ms));
  /** @param {os.CpuInfo['times']} times */
  const total = (times) => times.user + times.nice + times.sys + times.idle + times.irq;
  return os.cpus().reduce((sum, cpu, index) => {
    const start = before[index];
    if (!start) return sum;
    const elapsed = total(cpu.times) - total(start.times);
    return sum + (elapsed > 0 ? (cpu.times.idle - start.times.idle) / elapsed : 1);
  }, 0);
}
