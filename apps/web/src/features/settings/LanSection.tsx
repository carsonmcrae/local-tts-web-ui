// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: "Phones and tablets" in Settings: LAN mode, for reading and listening on other devices.
 * Scope: A collapsed section (an On/Off badge and a one-line summary; a link to #lan opens it) that
 *   says what LAN mode shares before the switch, then the switch, the network address to use (when
 *   this computer has more than one), the pairing card and paired devices while it is on, "Turn
 *   off", and the notes. The status is polled only while the section is open and LAN mode is on.
 *   On a phone or tablet the section only says to manage this on the computer.
 * Does NOT belong: The pieces themselves (LanParts.tsx) or the server's checks.
 */
import { Power } from 'lucide-react';
import { useState } from 'react';
import { ApiError, describeError } from '@/api/client';
import type { LanStatus } from '@/api/lanQueries';
import { useLan, useUpdateLan } from '@/api/lanQueries';
import { Button } from '@/components/ui/Button';
import { Badge, Banner, Skeleton } from '@/components/ui/Feedback';
import { Field, Select, Switch } from '@/components/ui/Field';
import { pluralize } from '@/lib/format';
import { CollapsibleSection, useSectionOpen } from './CollapsibleSection';
import {
  DevelopmentNote,
  LanNotes,
  LanProblem,
  PairedDevices,
  PairingCard,
  WhatLanModeShares,
} from './LanParts';

function summary(status: LanStatus | undefined): string {
  if (!status) return 'Read and listen on a phone or tablet on the same Wi-Fi.';
  if (!status.enabled) return 'Off. Only this computer can open TTSNative.';
  return `On at ${status.url}, ${pluralize(status.devices.length, 'device')} paired.`;
}

function AddressPicker({
  addresses,
  value,
  onChange,
}: Readonly<{ addresses: readonly string[]; value: string; onChange: (value: string) => void }>) {
  return (
    <Field
      label="Network address"
      hint="This computer is on more than one network. Choose the one your phone or tablet uses (often the one starting with 192.168)."
    >
      {({ id, describedBy }) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          value={value}
          className="max-sm:h-11 sm:max-w-xs"
          onChange={(event) => onChange(event.target.value)}
        >
          {addresses.map((address) => (
            <option key={address} value={address}>
              {address}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

function LanPanel({ status, updatedAt }: Readonly<{ status: LanStatus; updatedAt: number }>) {
  const update = useUpdateLan();
  const [picked, setPicked] = useState(status.address ?? '');
  const address = status.addresses.includes(picked) ? picked : (status.addresses[0] ?? '');
  const change = (enabled: boolean, chosen = address) =>
    update.mutate({ enabled, address: enabled && chosen ? chosen : null });
  const pick = (chosen: string) => {
    setPicked(chosen);
    if (status.enabled) change(true, chosen); // move to the other network at once
  };
  return (
    <>
      {import.meta.env.DEV ? <DevelopmentNote /> : null}
      <div className="flex min-h-11 flex-col justify-center">
        <Switch
          label="Turn on LAN mode"
          description="Devices on this Wi-Fi can open TTSNative once you pair them."
          checked={status.enabled}
          onCheckedChange={(enabled) => change(enabled)}
        />
      </div>
      {status.addresses.length > 1 ? (
        <AddressPicker addresses={status.addresses} value={address} onChange={pick} />
      ) : null}
      {status.addresses.length === 0 && !status.enabled ? (
        <p className="text-[13px] text-muted">
          This computer doesn&apos;t seem to be connected to a local network right now.
        </p>
      ) : null}
      {update.isError ? <LanProblem error={update.error} /> : null}
      {status.enabled && status.url ? (
        <PairingCard pairing={status.pairing} url={status.url} updatedAt={updatedAt} />
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
            Stops at once. Paired devices can&apos;t connect until you turn it on again.
          </p>
        </div>
      ) : null}
      <LanNotes />
    </>
  );
}

function Unavailable({ error }: Readonly<{ error: unknown }>) {
  const remote = error instanceof ApiError && error.code === 'not_allowed_remotely';
  return (
    <Banner tone={remote ? 'info' : 'error'}>
      {remote
        ? 'Phones and tablets are managed on the computer running TTSNative.'
        : describeError(error)}
    </Banner>
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
      badge={<Badge tone={enabled ? 'success' : 'neutral'}>{enabled ? 'On' : 'Off'}</Badge>}
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
