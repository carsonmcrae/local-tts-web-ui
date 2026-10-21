// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The optional Audiobookshelf connection in Settings.
 * Scope: The server address and API key (a password field; a saved key is never shown, and an
 *   empty field keeps it), "Test connection" (which tries the address and key as typed, without
 *   saving them, and lists the libraries and folders the key can upload to), choosing a library and
 *   folder, saving, and
 *   forgetting everything after a confirmation, with a short note on where uploads go.
 * Does NOT belong: Sending exports (features/exports/SendToShelf) or storing the key (server).
 */
import { Lock, PlugZap } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import {
  isShelfReady,
  useForgetShelf,
  useSaveShelf,
  useShelfSettings,
  useTestShelf,
} from '@/api/exportQueries';
import type { ShelfLibrary, ShelfSettings, ShelfSettingsInput } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Badge, Banner, Skeleton, StatusRegion } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { Section } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';

function Destination({
  libraries,
  libraryId,
  folderId,
  onChange,
}: Readonly<{
  libraries: readonly ShelfLibrary[];
  libraryId: string;
  folderId: string;
  onChange: (libraryId: string, folderId: string) => void;
}>) {
  if (libraries.length === 0) {
    return (
      <Banner tone="warning" title="Connected, but no libraries">
        This API key can&apos;t see any libraries. Check the key&apos;s permissions in
        Audiobookshelf.
      </Banner>
    );
  }
  const library = libraries.find((item) => item.id === libraryId);
  return (
    <div className="flex flex-col gap-3">
      <StatusRegion className="text-sm font-medium text-success">
        Connected. Choose where new audiobooks go.
      </StatusRegion>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Library">
          {({ id }) => (
            <Select
              id={id}
              value={libraryId}
              onChange={(event) => {
                const chosen = libraries.find((item) => item.id === event.target.value);
                onChange(event.target.value, chosen?.folders[0]?.id ?? '');
              }}
            >
              {libraries.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Folder">
          {({ id }) => (
            <Select
              id={id}
              value={folderId}
              onChange={(event) => onChange(libraryId, event.target.value)}
            >
              {(library?.folders ?? []).map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.path}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </div>
  );
}

function checkInput(url: string, apiKey: string, hasKey: boolean): string | null {
  if (!/^https?:\/\/\S+$/i.test(url)) {
    return 'Enter the server address, starting with http:// or https://.';
  }
  if (!apiKey && !hasKey) return 'Enter the API key.';
  if (apiKey && apiKey.length < 8) return 'That API key looks too short.';
  return null;
}

function ShelfForm({ saved }: Readonly<{ saved: ShelfSettings | undefined }>) {
  const save = useSaveShelf();
  const test = useTestShelf();
  const forget = useForgetShelf();
  const toast = useToast();
  const [url, setUrl] = useState(saved?.url ?? '');
  const [apiKey, setApiKey] = useState('');
  const [libraries, setLibraries] = useState<ShelfLibrary[] | null>(null);
  const [libraryId, setLibraryId] = useState(saved?.libraryId ?? '');
  const [folderId, setFolderId] = useState(saved?.folderId ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const hasKey = Boolean(saved?.hasKey);

  const valid = () => {
    const found = checkInput(url.trim(), apiKey.trim(), hasKey);
    setProblem(found);
    return !found;
  };
  const input = (): ShelfSettingsInput => ({
    url: url.trim(),
    libraryId: libraryId || null,
    folderId: folderId || null,
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  });

  const testConnection = async () => {
    if (!valid()) return;
    setTesting(true);
    try {
      const found = await test.mutateAsync(input()); // nothing is saved until Save
      const library = found.find((item) => item.id === libraryId) ?? found[0];
      const folder = library?.folders.find((item) => item.id === folderId) ?? library?.folders[0];
      setLibraries(found);
      setLibraryId(library?.id ?? '');
      setFolderId(folder?.id ?? '');
    } catch (error) {
      setLibraries(null);
      setProblem(describeError(error));
    } finally {
      setTesting(false);
    }
  };

  const saveAll = () => {
    if (!valid()) return;
    save.mutate(input(), {
      onSuccess: () => {
        setApiKey('');
        toast.notify('success', 'Audiobookshelf saved');
      },
      onError: (error) => setProblem(describeError(error)),
    });
  };

  const forgetAll = () =>
    forget.mutate(undefined, {
      onSuccess: () => {
        setConfirm(false);
        setUrl('');
        setApiKey('');
        setLibraries(null);
        setLibraryId('');
        setFolderId('');
        setProblem(null);
        toast.notify(
          'success',
          'Audiobookshelf forgotten',
          'The address and API key were removed.',
        );
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Server address"
        hint="The address you open Audiobookshelf at, such as http://192.168.1.20:13378."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            maxLength={300}
            onChange={(event) => setUrl(event.target.value)}
          />
        )}
      </Field>
      <Field
        label="API key"
        hint={
          hasKey
            ? 'Saved, leave empty to keep it.'
            : "Create one in your Audiobookshelf server's settings."
        }
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            maxLength={4000}
            onChange={(event) => setApiKey(event.target.value)}
          />
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          icon={<PlugZap size={15} />}
          loading={testing}
          onClick={() => void testConnection()}
        >
          Test connection
        </Button>
        <p className="text-[13px] text-muted">Nothing is saved until you press Save.</p>
      </div>
      {libraries ? (
        <Destination
          libraries={libraries}
          libraryId={libraryId}
          folderId={folderId}
          onChange={(library, folder) => {
            setLibraryId(library);
            setFolderId(folder);
          }}
        />
      ) : null}
      {!libraries && isShelfReady(saved) ? (
        <p className="text-[13px] text-muted">
          A library and folder are saved. Test the connection to change them.
        </p>
      ) : null}
      {problem ? <Banner tone="error">{problem}</Banner> : null}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="primary" loading={save.isPending && !testing} onClick={saveAll}>
          Save
        </Button>
        {saved?.configured || hasKey ? (
          <Button variant="ghost" onClick={() => setConfirm(true)}>
            Forget
          </Button>
        ) : null}
      </div>
      <p className="flex gap-2 text-[13px] leading-relaxed text-muted">
        <Lock size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
        Uploads go only to this server, and only when you choose Send to Audiobookshelf. The API key
        is stored on this computer, encrypted on Windows, and is never shown again.
      </p>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Forget Audiobookshelf?"
        description="The server address and API key are removed from this computer. Books you already sent stay on your server."
        confirmLabel="Forget"
        busy={forget.isPending}
        onConfirm={forgetAll}
      />
    </div>
  );
}

export function AudiobookshelfSection() {
  const settings = useShelfSettings();
  return (
    <Section
      id="audiobookshelf"
      title="Audiobookshelf"
      description="Optional. Send finished audiobooks to your own Audiobookshelf server."
      actions={isShelfReady(settings.data) ? <Badge tone="success">Set up</Badge> : null}
    >
      {settings.isError ? (
        <Banner tone="error" className="mb-4">
          {describeError(settings.error)}
        </Banner>
      ) : null}
      {settings.isPending ? <Skeleton className="h-40" /> : <ShelfForm saved={settings.data} />}
    </Section>
  );
}
