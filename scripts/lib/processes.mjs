// @ts-check
// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae - Local TTS Web UI - github.com/carsonmcrae/local-tts-web-ui
/**
 * Purpose: Start long-running child processes with prefixed output and stop them cleanly.
 * Scope: Spawning without a shell, line-prefixing stdout/stderr, killing whole process trees
 *   on Windows (taskkill /T) and POSIX (process groups), and waiting for an HTTP health check.
 * Does NOT belong: Deciding which processes to run (dev.mjs / start.mjs).
 */
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { createInterface } from 'node:readline';

/**
 * @typedef {{ name: string, child: import('node:child_process').ChildProcess }} Managed
 */

/**
 * @param {string} label already-coloured prefix
 * @param {NodeJS.ReadableStream | null} stream
 * @param {(line: string) => void} write
 */
function pipeLines(label, stream, write) {
  if (!stream) return;
  const rl = createInterface({ input: stream });
  rl.on('line', (line) => write(`${label} ${line}`));
}

/**
 * @param {{ name: string, label: string, command: string, args: string[], cwd: string,
 *   env?: NodeJS.ProcessEnv }} options
 * @returns {Managed}
 */
export function startManaged({ name, label, command, args, cwd, env }) {
  const child = spawn(command, args, {
    cwd,
    env: env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  pipeLines(label, child.stdout, (line) => console.log(line));
  pipeLines(label, child.stderr, (line) => console.error(line));
  return { name, child };
}

/**
 * Terminate a child and everything it spawned (uv → python → uvicorn reloader → worker).
 * @param {Managed} managed
 */
export function stopManaged({ child }) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    // Absolute path so a planted taskkill.exe earlier on PATH can never be picked up.
    const taskkill = path.join(
      process.env.SystemRoot ?? String.raw`C:\Windows`,
      'System32',
      'taskkill.exe',
    );
    spawnSync(taskkill, ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

/**
 * Ties this script's lifetime to a managed child: Ctrl+C or SIGTERM stops the child, the script
 * exits with the child's code if it stops on its own, and the child never outlives the script.
 * @param {Managed} managed
 */
export function exitWithChild(managed) {
  const stop = () => {
    stopManaged(managed);
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('exit', () => stopManaged(managed));
  managed.child.on('exit', (code) => process.exit(code ?? 1));
}

/**
 * @param {number} port
 * @param {string} host
 * @returns {Promise<boolean>}
 */
export function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

/**
 * @param {number} preferred
 * @param {number} attempts
 * @returns {Promise<number | null>}
 */
export async function findFreePort(preferred, attempts = 20) {
  for (let port = preferred; port < preferred + attempts; port += 1) {
    if (await isPortFree(port)) return port;
  }
  return null;
}

/**
 * Poll an HTTP URL until it answers 200 or the deadline passes.
 * @param {string} url
 * @param {number} timeoutMs
 * @param {() => boolean} [stillRunning] stop early when the process already died
 * @returns {Promise<boolean>}
 */
export async function waitForHttp(url, timeoutMs, stillRunning = () => true) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && stillRunning()) {
    const ready = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.setTimeout(2_000, () => req.destroy());
      req.on('error', () => resolve(false));
    });
    if (ready) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}
