// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: "Phones and tablets" in Settings: LAN mode, for reading and listening on other devices.
 * Scope: A collapsed section (an On/Off badge and a one-line summary; a link to #lan opens it) that
 *   says what LAN mode shares before the switch, then (on macOS and Linux) the trusted-network
 *   confirmation, the switch, the network address to use (when there is a choice, with virtual and
 *   VPN adapters labelled), what is open while it is on, the pairing card and paired devices, "Turn
 *   off", why it turned itself off, and what works over plain HTTP. The status is polled only while
 *   open and on. On a phone or tablet it says to manage this on the computer, and what works there.
 * Does NOT belong: The pieces themselves (LanParts.tsx) or the server's checks.
 */
import { Power } from 'lucide-react';
import { useState } from 'react';
import { ApiError, describeError } from '@/api/client';
import type { LanStatus, NetworkAddress } from '@/api/lanQueries';
import { useLan, useUpdateLan } from '@/api/lanQueries';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, Skeleton } from '@/components/ui/Feedback';
import { Field, Select, Switch } from '@/components/ui/Field';
import { pluralize } from '@/lib/format';
import { CollapsibleSection, useSectionOpen } from './CollapsibleSection';
import {
  DevelopmentNote,
  HttpLimits,
  LanProblem,
  NetworkConfirmation,
  OpenToTheNetwork,
  PairedDevices,
  PairingCard,
  TurnedOff,
  WhatLanModeShares,
} from './LanParts';

const KIND_LABEL = { network: '', virtual: ' (virtual adapter)', vpn: ' (VPN)' } as const;
const KIND_HINT = {
  network: null,
  virtual:
    'This is a virtual adapter. It can be your real network (a Hyper-V switch, or this computer’s mobile hotspot), or reach only virtual machines. Choose it only if your phone is on that network.',
  vpn: 'This is a VPN or virtual network. Devices on it, which may be outside your home, could reach TTSNative and ask to pair. Choose it only if you mean to.',
} as const;

function summary(status: LanStatus | undefined): string {
  if (!status) return 'Read and listen on a phone or tablet on the same Wi-Fi.';
  if (!status.enabled) return 'Off. Only this computer can open TTSNative.';
  return `On at ${status.url}, ${pluralize(status.devices.length, 'device')} paired.`;
}

function AddressPicker({
  addresses,
  value,
  onChange,
}: Readonly<{
  addresses: readonly NetworkAddress[];
  value: NetworkAddress;
  onChange: (value: string) => void;
}>) {
  const hint = KIND_HINT[value.kind];
  return (
    <div className="flex flex-col gap-2">
      <Field
        label="Network address"
        hint="Choose the network your phone or tablet uses (often your Wi-Fi, with an address starting with 192.168)."
      >
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={value.address}
            className="max-sm:h-11 sm:max-w-md"
            onChange={(event) => onChange(event.target.value)}
          >
            {addresses.map((choice) => (
              <option key={choice.address} value={choice.address}>
                {`${choice.address}, ${choice.interface}${KIND_LABEL[choice.kind]}`}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {hint ? <Banner tone="warning">{hint}</Banner> : null}
    </div>
  );
}

/** The address to use: the one picked, else the first that isn't a VPN (they are listed last). */
function choose(addresses: readonly NetworkAddress[], picked: string): NetworkAddress | undefined {
  return (
    addresses.find((choice) => choice.address === picked) ??
    addresses.find((choice) => choice.kind !== 'vpn') ??
    addresses[0]
  );
}

function LanPanel({ status, updatedAt }: Readonly<{ status: LanStatus; updatedAt: number }>) {
  const update = useUpdateLan();
  const [picked, setPicked] = useState(status.address ?? '');
  const [trusted, setTrusted] = useState(false); // asked again every time (macOS and Linux)
  const [wasOn, setWasOn] = useState(status.enabled);
  if (wasOn !== status.enabled) {
    setWasOn(status.enabled);
    if (!status.enabled) setTrusted(false); // it went off: the next time is a new session
  }
  const address = choose(status.addresses, picked);
  const change = (enabled: boolean, chosen = address?.address) =>
    update.mutate({
      enabled,
      address: enabled && chosen ? chosen : null,
      trustedNetwork: enabled && trusted,
    });
  const pick = (chosen: string) => {
    setPicked(chosen);
    if (status.enabled) change(true, chosen); // move to the other network at once
  };
  const choice = status.addresses.length > 1 || (address && address.kind !== 'network');
  return (
    <>
      {import.meta.env.DEV ? <DevelopmentNote /> : null}
      {!status.enabled && status.turnedOff ? <TurnedOff reason={status.turnedOff} /> : null}
      {status.networkCheck === 'confirm' ? (
        <NetworkConfirmation checked={trusted} onCheckedChange={setTrusted} />
      ) : null}
      <div className="flex min-h-11 flex-col justify-center">
        <Switch
          label="Turn on LAN mode"
          description="Devices on this Wi-Fi can open TTSNative once you pair them."
          checked={status.enabled}
          onCheckedChange={(enabled) => change(enabled)}
        />
      </div>
      {choice && address ? (
        <AddressPicker addresses={status.addresses} value={address} onChange={pick} />
      ) : null}
      {status.addresses.length === 0 && !status.enabled ? (
        <p className="text-[13px] text-muted">
          This computer doesn&apos;t seem to be connected to a local network right now.
        </p>
      ) : null}
      {update.isError ? <LanProblem error={update.error} /> : null}
      {status.enabled && status.url ? (
        <>
          <OpenToTheNetwork url={status.url} where={status.interface} category={status.category} />
          <PairingCard pairing={status.pairing} url={status.url} updatedAt={updatedAt} />
        </>
      ) : null}
      {status.enabled || status.devices.length > 0 ? (
        <PairedDevices devices={status.devices} now={updatedAt} />
      ) : null}
      {status.enabled ? (
        <div className="flex flex-col items-start gap-1.5">
          <Button
            icon={<Power size={15} />}
            className="max-sm:h-11"
            loading={update.isPending && update.variables?.enabled === false}
            onClick={() => change(false)}
          >
            Turn off LAN mode
          </Button>
          <p className="text-[13px] text-muted">
            Stops at once, including anything a device is still downloading. Paired devices
            can&apos;t connect until you turn it on again.
          </p>
        </div>
      ) : null}
      <HttpLimits />
    </>
  );
}

function Unavailable({ error }: Readonly<{ error: unknown }>) {
  const remote = error instanceof ApiError && error.code === 'not_allowed_remotely';
  return (
    <>
      <Banner tone={remote ? 'info' : 'error'}>
        {remote
          ? 'Phones and tablets are managed on the computer running TTSNative.'
          : describeError(error)}
      </Banner>
      {remote ? <HttpLimits /> : null}
    </>
  );
}

export function LanSection() {
  const [open, setOpen] = useSectionOpen('lan');
  const status = useLan(open);
  const enabled = Boolean(status.data?.enabled);
  return (
    <CollapsibleSection
      id="lan"
      title="Phones and tablets"
      description="Optional. Read and listen on other devices on the same Wi-Fi (LAN mode)."
      badge={<Badge tone={enabled ? 'warning' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>}
      toggleLabel="LAN mode"
      summary={summary(status.data)}
      open={open}
      onOpenChange={setOpen}
    >
      <WhatLanModeShares />
      {status.isPending ? <Skeleton className="h-24" /> : null}
      {status.isError ? <Unavailable error={status.error} /> : null}
      {status.data ? <LanPanel status={status.data} updatedAt={status.dataUpdatedAt} /> : null}
    </CollapsibleSection>
  );
}
