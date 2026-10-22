// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Server state for LAN mode: using TTSNative from phones and tablets on the same Wi-Fi.
 * Scope: On this computer: the status (polled every few seconds only while the settings are open
 *   and LAN mode is on, to show newly paired devices, and every 15 s while it is on, so the sidebar
 *   notices when it turns itself off), turning it on or off, a new pairing code and removing one or
 *   all paired devices. On a phone or tablet: pairing with a code and asking whether this device is
 *   paired, or why it no longer is.
 * Does NOT belong: Presentation (features/settings/LanSection, features/lan/PairPage) or the
 *   pairing rules (the server's lan/ package).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { components } from './schema.gen';

export type LanStatus = components['schemas']['LanStatus'];
export type LanUpdate = components['schemas']['LanUpdate'];
export type LanDevice = components['schemas']['DeviceOut'];
export type NetworkAddress = components['schemas']['NetworkAddress'];
export type PairingCode = components['schemas']['PairingOut'];
export type PairRequest = components['schemas']['PairRequest'];
export type ThisDevice = components['schemas']['ThisDevice'];

const LAN = ['lan'] as const;
const THIS_DEVICE = ['lan', 'this-device'] as const;
const POLL_MS = 3000;
const WATCH_MS = 15_000;

/** The status; `watch` polls it while LAN mode is on (the settings are open). */
export function useLan(watch: boolean) {
  return useQuery({
    queryKey: LAN,
    queryFn: () => api<LanStatus>('/api/lan'),
    refetchInterval: (query) => (watch && query.state.data?.enabled ? POLL_MS : false),
  });
}

/** On this computer only: whether LAN mode is on, checked every 15 s while it is (for the sidebar). */
export function useLanWhileOn(enabled: boolean) {
  return useQuery({
    queryKey: LAN,
    queryFn: () => api<LanStatus>('/api/lan'),
    enabled,
    retry: false,
    refetchInterval: (query) => (query.state.data?.enabled ? WATCH_MS : false),
  });
}

/**
 * Every change on this computer refreshes the status, or replaces it with the answer; a failed one
 * refreshes it too (the network, or LAN mode itself, may have changed).
 */
function useLanChange<Input, Output>(
  run: (input: Input) => Promise<Output>,
  merge?: (status: LanStatus, output: Output) => LanStatus,
) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: LAN });
  return useMutation({
    mutationFn: run,
    gcTime: 0, // pairing codes don't linger in the mutation cache
    onSuccess: (output) => {
      const current = client.getQueryData<LanStatus>(LAN);
      if (merge && current) client.setQueryData(LAN, merge(current, output));
      else refresh();
    },
    onError: refresh,
  });
}

export function useUpdateLan() {
  return useLanChange(
    (input: LanUpdate) => api<LanStatus>('/api/lan', { method: 'PUT', json: input }),
    (_status, answer) => answer,
  );
}

export function useNewPairingCode() {
  return useLanChange(
    () => api<PairingCode>('/api/lan/pairing', { method: 'POST' }),
    (status, pairing) => ({ ...status, pairing }),
  );
}

export function useRemoveDevice() {
  return useLanChange((id: string) => api<void>(`/api/lan/devices/${id}`, { method: 'DELETE' }));
}

export function useRemoveAllDevices() {
  return useLanChange(() => api<void>('/api/lan/devices', { method: 'DELETE' }));
}

/** On a phone or tablet: whether it is paired already (always "no" on this computer). */
export function useThisDevice() {
  return useQuery({
    queryKey: THIS_DEVICE,
    queryFn: () => api<ThisDevice>('/api/lan/device'),
  });
}

/** Pairs this device; afterwards every query is fetched again, now with the device's cookie. */
export function usePairDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PairRequest) =>
      api<LanDevice>('/api/lan/pair', { method: 'POST', json: input }),
    gcTime: 0,
    onSuccess: () => void client.resetQueries(),
  });
}
