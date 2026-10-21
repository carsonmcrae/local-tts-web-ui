// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Drive the desktop start-up screen from the app's backend status.
 * Scope: Polls `backend_status` until the server is ready (the app then loads the reader itself) or
 *   failed (shows the reason and the Try again / Open log folder / Quit actions).
 * Does NOT belong: Starting the server (src-tauri/src/backend.rs).
 */
const { invoke } = window.__TAURI__.core;

const element = (id) => document.getElementById(id);
const SLOW_AFTER_MS = 20_000;
const started = Date.now();

function showFailure(status) {
  element('spinner').hidden = true;
  element('status').textContent = '';
  element('failure').hidden = false;
  element('failure-message').textContent = status.message;
  element('failure-details').hidden = !status.detail;
  element('failure-detail').textContent = status.detail ?? '';
  element('retry').focus();
}

async function poll() {
  let status;
  try {
    status = await invoke('backend_status');
  } catch {
    status = { state: 'starting' };
  }
  if (status.state === 'failed') {
    showFailure(status);
    return;
  }
  if (status.state === 'starting' && Date.now() - started > SLOW_AFTER_MS) {
    element('status').textContent =
      'Still starting… The first start after installing can take a minute while Windows checks the new files.';
  }
  setTimeout(poll, 400);
}

element('retry').addEventListener('click', () => {
  element('failure').hidden = true;
  element('spinner').hidden = false;
  element('status').textContent = 'Starting the reading engine…';
  void invoke('backend_retry').then(() => setTimeout(poll, 400));
});
element('logs').addEventListener('click', () => void invoke('open_folder', { which: 'logs' }));
element('quit').addEventListener('click', () => void invoke('app_quit'));

void poll();
