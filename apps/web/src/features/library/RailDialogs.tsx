// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The dialogs that create, rename, move and delete folders and collections.
 * Scope: `FolderDialog` (a name and a place in the tree, for a new folder or an existing one),
 *   `CollectionDialog` (a name and a description), and the two confirmations: deleting a folder moves
 *   its documents up and never deletes them; deleting a collection leaves its documents alone.
 * Does NOT belong: The rail that opens them (LibraryRail.tsx) or document-level organising.
 */
import type { KeyboardEvent } from 'react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import {
  useCreateCollection,
  useCreateFolder,
  useDeleteCollection,
  useDeleteFolder,
  useUpdateCollection,
  useUpdateFolder,
} from '@/api/libraryQueries';
import type { Collection, Folder } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Field, Input, Select } from '@/components/ui/Field';
import { pluralize } from '@/lib/format';

/** Enter in a dialog's text field saves it (the dialogs have no form: their buttons sit in the footer). */
function submitOnEnter(submit: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submit();
  };
}

/** Folders a folder may be placed under: every folder except itself and those inside it. */
export function possibleParents(folders: readonly Folder[], folderId: string | null): Folder[] {
  if (!folderId) return [...folders];
  const inside = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && inside.has(folder.parentId) && !inside.has(folder.id)) {
        inside.add(folder.id);
        grew = true;
      }
    }
  }
  return folders.filter((folder) => !inside.has(folder.id));
}

/** A folder's name with its ancestors, for selects ("Fiction / Fantasy"). */
export function folderPath(folders: readonly Folder[], folderId: string): string {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const names: string[] = [];
  for (let current = byId.get(folderId); current; current = byId.get(current.parentId ?? '')) {
    names.unshift(current.name);
  }
  return names.join(' / ');
}

export function FolderDialog({
  folder,
  parentId,
  folders,
  onClose,
}: Readonly<{
  folder: Folder | null; // null: a new folder
  parentId: string | null;
  folders: readonly Folder[];
  onClose: () => void;
}>) {
  const create = useCreateFolder();
  const update = useUpdateFolder();
  const [name, setName] = useState(folder?.name ?? '');
  const [parent, setParent] = useState(folder?.parentId ?? parentId ?? '');
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const target = parent || null;
    if (folder) {
      update.mutate(
        {
          id: folder.id,
          name: trimmed,
          ...(target !== folder.parentId ? { parentId: target } : {}),
        },
        { onSuccess: onClose },
      );
    } else {
      create.mutate({ name: trimmed, parentId: target }, { onSuccess: onClose });
    }
  };
  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={folder ? 'Rename or move folder' : 'New folder'}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={pending} disabled={!name.trim()}>
            {folder ? 'Save' : 'Create folder'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          {({ id }) => (
            <Input
              id={id}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={submitOnEnter(submit)}
            />
          )}
        </Field>
        <Field label="Inside">
          {({ id }) => (
            <Select id={id} value={parent} onChange={(event) => setParent(event.target.value)}>
              <option value="">Top level</option>
              {possibleParents(folders, folder?.id ?? null).map((option) => (
                <option key={option.id} value={option.id}>
                  {folderPath(folders, option.id)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {error ? <Banner tone="error">{describeError(error)}</Banner> : null}
      </div>
    </Dialog>
  );
}

export function CollectionDialog({
  collection,
  onClose,
}: Readonly<{ collection: Collection | null; onClose: () => void }>) {
  const create = useCreateCollection();
  const update = useUpdateCollection();
  const [name, setName] = useState(collection?.name ?? '');
  const [description, setDescription] = useState(collection?.description ?? '');
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const values = { name: trimmed, description: description.trim() };
    if (collection) update.mutate({ id: collection.id, ...values }, { onSuccess: onClose });
    else create.mutate(values, { onSuccess: onClose });
  };
  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={collection ? 'Edit collection' : 'New collection'}
      description="A document can be in any number of collections without being copied."
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={pending} disabled={!name.trim()}>
            {collection ? 'Save' : 'Create collection'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          {({ id }) => (
            <Input
              id={id}
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={submitOnEnter(submit)}
            />
          )}
        </Field>
        <Field label="Description (optional)">
          {({ id }) => (
            <Input
              id={id}
              value={description}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              onKeyDown={submitOnEnter(submit)}
            />
          )}
        </Field>
        {error ? <Banner tone="error">{describeError(error)}</Banner> : null}
      </div>
    </Dialog>
  );
}

export function DeleteFolderDialog({
  folder,
  folders,
  onClose,
}: Readonly<{ folder: Folder; folders: readonly Folder[]; onClose: () => void }>) {
  const remove = useDeleteFolder();
  const inside = folders.filter((other) => other.parentId === folder.id).length;
  const destination = folder.parentId ? folderPath(folders, folder.parentId) : 'All documents';
  return (
    <ConfirmDialog
      open
      onOpenChange={onClose}
      title={`Delete the folder “${folder.name}”?`}
      description={
        <>
          Its {pluralize(folder.documentCount, 'document')}
          {inside ? ` and ${pluralize(inside, 'subfolder')}` : ''} move to{' '}
          <strong>{destination}</strong>. No document is deleted.
        </>
      }
      confirmLabel="Delete folder"
      busy={remove.isPending}
      onConfirm={() => remove.mutate(folder.id, { onSuccess: onClose })}
    />
  );
}

export function DeleteCollectionDialog({
  collection,
  onClose,
}: Readonly<{ collection: Collection; onClose: () => void }>) {
  const remove = useDeleteCollection();
  return (
    <ConfirmDialog
      open
      onOpenChange={onClose}
      title={`Delete the collection “${collection.name}”?`}
      description={`Its ${pluralize(collection.documentCount, 'document')} stay in your library.`}
      confirmLabel="Delete collection"
      busy={remove.isPending}
      onConfirm={() => remove.mutate(collection.id, { onSuccess: onClose })}
    />
  );
}
