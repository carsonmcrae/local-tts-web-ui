// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The dialogs that create, rename, move and delete folders and collections.
 * Scope: `FolderDialog` (a name and a place in the tree, for a new folder or an existing one),
 *   `CollectionDialog` (a name and a description), and the two confirmations: deleting a folder moves
 *   its documents up and never deletes them; deleting a collection leaves its documents alone.
 * Does NOT belong: The rail that opens them (LibraryRail.tsx) or document-level organising.
 */
import type { KeyboardEvent, ReactNode } from 'react';
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

/** A text field of a naming dialog: Enter submits it. */
function NameField({
  label,
  value,
  maxLength,
  onChange,
  submit,
}: Readonly<{
  label: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  submit: () => void;
}>) {
  return (
    <Field label={label}>
      {({ id }) => (
        <Input
          id={id}
          value={value}
          maxLength={maxLength}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={submitOnEnter(submit)}
        />
      )}
    </Field>
  );
}

interface NameForm {
  name: string;
  setName: (name: string) => void;
  submit: () => void;
  pending: boolean;
  error: unknown;
  onClose: () => void;
}

/** A small dialog that names something: the name field, the fields given, cancel and save. */
function NameDialog({
  title,
  description,
  saveLabel,
  form,
  children,
}: Readonly<{
  title: string;
  description?: string;
  saveLabel: string;
  form: NameForm;
  children?: ReactNode;
}>) {
  const { name, setName, submit, pending, error, onClose } = form;
  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={title}
      {...(description ? { description } : {})}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={pending} disabled={!name.trim()}>
            {saveLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <NameField label="Name" value={name} maxLength={80} onChange={setName} submit={submit} />
        {children}
        {error ? <Banner tone="error">{describeError(error)}</Banner> : null}
      </div>
    </Dialog>
  );
}

/** The name being typed, and whether the create-or-update pair is saving or failed. */
function useNameForm(
  initial: string,
  create: { isPending: boolean; error: unknown },
  update: { isPending: boolean; error: unknown },
) {
  const [name, setName] = useState(initial);
  const pending = create.isPending || update.isPending;
  return { name, setName, pending, error: create.error ?? update.error };
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
  const { name, setName, pending, error } = useNameForm(folder?.name ?? '', create, update);
  const [parent, setParent] = useState(folder?.parentId ?? parentId ?? '');
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const target = parent || null;
    if (folder) {
      update.mutate(
        {
          id: folder.id,
          name: trimmed,
          ...(target === folder.parentId ? {} : { parentId: target }),
        },
        { onSuccess: onClose },
      );
    } else {
      create.mutate({ name: trimmed, parentId: target }, { onSuccess: onClose });
    }
  };
  return (
    <NameDialog
      title={folder ? 'Rename or move folder' : 'New folder'}
      saveLabel={folder ? 'Save' : 'Create folder'}
      form={{ name, setName, submit, pending, error, onClose }}
    >
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
    </NameDialog>
  );
}

export function CollectionDialog({
  collection,
  onClose,
}: Readonly<{ collection: Collection | null; onClose: () => void }>) {
  const create = useCreateCollection();
  const update = useUpdateCollection();
  const { name, setName, pending, error } = useNameForm(collection?.name ?? '', create, update);
  const [description, setDescription] = useState(collection?.description ?? '');
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const values = { name: trimmed, description: description.trim() };
    if (collection) update.mutate({ id: collection.id, ...values }, { onSuccess: onClose });
    else create.mutate(values, { onSuccess: onClose });
  };
  return (
    <NameDialog
      title={collection ? 'Edit collection' : 'New collection'}
      description="A document can be in any number of collections without being copied."
      saveLabel={collection ? 'Save' : 'Create collection'}
      form={{ name, setName, submit, pending, error, onClose }}
    >
      <NameField
        label="Description (optional)"
        value={description}
        maxLength={500}
        onChange={setDescription}
        submit={submit}
      />
    </NameDialog>
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
