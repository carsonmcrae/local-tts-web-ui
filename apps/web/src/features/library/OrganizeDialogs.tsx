// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The dialogs that organise one document or several at once.
 * Scope: Move to a folder (one choice), add to or remove from collections (with a new collection
 *   made on the spot), edit details (type, genres and tags, with the library's existing tags a click
 *   away; for several documents the type and genres are set and tags added) and delete with a
 *   confirmation that says what goes. One `OrganizeDialog` picks the right one for an action.
 * Does NOT belong: Opening them (DocumentCard's menu, LibraryList's bulk bar) or the server's rules.
 */
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useCreateCollection, useOrganize, useTags, useUpdateShelf } from '@/api/libraryQueries';
import { useDeleteDocument } from '@/api/queries';
import type { Collection, DocumentSummary, Folder, Genre, WorkType } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { OptionList } from '@/components/ui/Menu';
import { usePlayer } from '@/features/player/PlayerProvider';
import { pluralize } from '@/lib/format';
import { folderPath } from './RailDialogs';
import { GENRES, WORK_TYPES } from './vocabulary';

export type OrganizeAction = 'move' | 'collect' | 'edit' | 'delete';
const MAX_GENRES = 6;
const MAX_TAGS = 30;
const SUGGESTED_TAGS = 12;

interface DialogProps {
  documents: readonly DocumentSummary[];
  folders: readonly Folder[];
  collections: readonly Collection[];
  onClose: () => void;
}

/** "this document" or "these 3 documents". */
function these(documents: readonly DocumentSummary[]): string {
  return documents.length === 1 ? 'this document' : `these ${documents.length} documents`;
}

/** Tags typed as "one, two" without blanks, each spelling once, at most MAX_TAGS. */
export function parseTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    if (!tag || seen.has(tag.toLocaleLowerCase())) continue;
    seen.add(tag.toLocaleLowerCase());
    tags.push(tag);
  }
  return tags.slice(0, MAX_TAGS);
}

function MoveDialog({ documents, folders, onClose }: Readonly<DialogProps>) {
  const organize = useOrganize();
  const [only] = documents;
  const [folderId, setFolderId] = useState(
    documents.length === 1 && only ? (only.shelf.folderId ?? '') : '',
  );
  const options = [
    { value: '', label: 'No folder' },
    ...folders.map((folder) => ({ value: folder.id, label: folderPath(folders, folder.id) })),
  ];
  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={`Move ${these(documents)}`}
      description="A document has one place in your folders."
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={organize.isPending}
            onClick={() =>
              organize.mutate(
                { documentIds: documents.map((doc) => doc.id), folderId: folderId || null },
                { onSuccess: onClose },
              )
            }
          >
            Move
          </Button>
        </>
      }
    >
      <OptionList options={options} value={folderId} onSelect={setFolderId} label="Folder" />
      {folders.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">
          There are no folders yet. Make one from the library’s rail.
        </p>
      ) : null}
      {organize.isError ? (
        <Banner tone="error" className="mt-3">
          {describeError(organize.error)}
        </Banner>
      ) : null}
    </Dialog>
  );
}

function CollectDialog({ documents, collections, onClose }: Readonly<DialogProps>) {
  const organize = useOrganize();
  const create = useCreateCollection();
  // Checked when every chosen document is in the collection. Only boxes the reader changes count on
  // save, so a collection that holds some of several documents is left as it is unless ticked.
  const [initial] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        collections
          .filter((c) => documents.every((doc) => doc.shelf.collectionIds.includes(c.id)))
          .map((c) => c.id),
      ),
  );
  const [checked, setChecked] = useState(initial);
  const [newName, setNewName] = useState('');
  const toggle = (id: string, on: boolean) =>
    setChecked((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const save = () => {
    const add = [...checked].filter((id) => !initial.has(id)); // includes collections made here
    const remove = [...initial].filter((id) => !checked.has(id));
    organize.mutate(
      {
        documentIds: documents.map((doc) => doc.id),
        addToCollections: add,
        removeFromCollections: remove,
      },
      { onSuccess: onClose },
    );
  };
  const addNew = () =>
    create.mutate(
      { name: newName.trim(), description: '' },
      {
        onSuccess: (collection) => {
          toggle(collection.id, true);
          setNewName('');
        },
      },
    );
  const error = organize.error ?? create.error;
  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={`Collections for ${these(documents)}`}
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={organize.isPending} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {collections.map((collection) => (
          <Checkbox
            key={collection.id}
            checked={checked.has(collection.id)}
            onCheckedChange={(on) => toggle(collection.id, on)}
            label={collection.name}
          />
        ))}
        <div className="flex items-end gap-2 border-t border-line pt-3">
          <Field label="New collection" className="flex-1">
            {({ id }) => (
              <Input
                id={id}
                value={newName}
                maxLength={80}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && newName.trim()) {
                    event.preventDefault();
                    addNew();
                  }
                }}
              />
            )}
          </Field>
          <Button onClick={addNew} disabled={!newName.trim()} loading={create.isPending}>
            Add
          </Button>
        </div>
        {error ? <Banner tone="error">{describeError(error)}</Banner> : null}
      </div>
    </Dialog>
  );
}

function EditDialog({ documents, onClose }: Readonly<DialogProps>) {
  const shelf = useUpdateShelf();
  const organize = useOrganize();
  const existing = useTags();
  const [only] = documents;
  const single = documents.length === 1 ? only : undefined;
  const [type, setType] = useState<WorkType | ''>(single?.shelf.documentType ?? '');
  const [genres, setGenres] = useState<ReadonlySet<Genre>>(new Set(single?.shelf.genres ?? []));
  const [tags, setTags] = useState(single?.shelf.tags.join(', ') ?? '');
  // Tags already in the library that aren't typed yet, to add with a click.
  const typed = new Set(parseTags(tags).map((tag) => tag.toLocaleLowerCase()));
  const suggestions = (existing.data ?? [])
    .map((entry) => entry.tag)
    .filter((tag) => !typed.has(tag.toLocaleLowerCase()))
    .slice(0, SUGGESTED_TAGS);
  const toggleGenre = (genre: Genre, on: boolean) =>
    setGenres((previous) => {
      const next = new Set(previous);
      if (on) next.add(genre);
      else next.delete(genre);
      return next;
    });
  const save = () => {
    if (single) {
      shelf.mutate(
        {
          documentId: single.id,
          documentType: type || null,
          genres: [...genres],
          tags: parseTags(tags),
        },
        { onSuccess: onClose },
      );
      return;
    }
    organize.mutate(
      {
        documentIds: documents.map((doc) => doc.id),
        ...(type ? { documentType: type } : {}),
        ...(genres.size ? { genres: [...genres] } : {}),
        addTags: parseTags(tags),
      },
      { onSuccess: onClose },
    );
  };
  const error = shelf.error ?? organize.error;
  return (
    <Dialog
      open
      onOpenChange={onClose}
      title={single ? `Details of “${single.title}”` : `Details of ${documents.length} documents`}
      description={
        single
          ? 'Type, genres and tags help you find it again.'
          : 'The type and genres you set replace each document’s; tags are added to what each has.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={shelf.isPending || organize.isPending} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Type">
          {({ id }) => (
            <Select
              id={id}
              value={type}
              onChange={(event) => setType(event.target.value as WorkType | '')}
            >
              <option value="">{single ? 'Not set' : 'Leave as it is'}</option>
              {WORK_TYPES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Genres <span className="font-normal text-muted">(up to {MAX_GENRES})</span>
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {GENRES.map((genre) => (
              <Checkbox
                key={genre.id}
                checked={genres.has(genre.id)}
                onCheckedChange={(on) => {
                  if (!on || genres.size < MAX_GENRES) toggleGenre(genre.id, on);
                }}
                label={genre.label}
              />
            ))}
          </div>
        </fieldset>
        <Field label={single ? 'Tags' : 'Add tags'} hint="Separate tags with commas.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="evening, book club"
            />
          )}
        </Field>
        {suggestions.length ? (
          <div className="-mt-3 flex flex-wrap items-center gap-1.5" aria-label="Your tags">
            <span className="text-[13px] text-muted">Your tags:</span>
            {suggestions.map((tag) => (
              <Button
                key={tag}
                size="sm"
                variant="subtle"
                className="h-7 px-2.5 text-xs"
                onClick={() =>
                  setTags(tags.trim() ? `${tags.trim().replace(/,$/, '')}, ${tag}` : tag)
                }
              >
                {tag}
              </Button>
            ))}
          </div>
        ) : null}
        {error ? <Banner tone="error">{describeError(error)}</Banner> : null}
      </div>
    </Dialog>
  );
}

function DeleteDialog({ documents, onClose }: Readonly<DialogProps>) {
  const remove = useDeleteDocument();
  const { controller, state } = usePlayer();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const [only] = documents;
  const confirm = async () => {
    setBusy(true);
    try {
      for (const doc of documents) {
        await remove.mutateAsync(doc.id);
        if (state.document?.id === doc.id) controller.unload();
      }
      onClose();
    } catch (error) {
      setFailure(error);
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      open
      onOpenChange={onClose}
      title={
        documents.length === 1 ? 'Delete this document?' : `Delete ${documents.length} documents?`
      }
      description={
        <>
          {documents.length === 1 && only
            ? only.bundledWorkId
              ? `“${only.title}” and its reading progress will be removed from your library. The book stays in Explore, so you can open it again later.`
              : `“${only.title}” and its reading progress will be permanently removed from this computer.`
            : `${pluralize(documents.length, 'document')} and their reading progress will be permanently removed from this computer.`}
          {failure ? (
            <span role="alert" className="mt-2 block text-danger">
              {describeError(failure)}
            </span>
          ) : null}
        </>
      }
      confirmLabel="Delete"
      busy={busy}
      onConfirm={() => void confirm()}
    />
  );
}

export function OrganizeDialog({
  action,
  ...props
}: Readonly<DialogProps & { action: OrganizeAction }>) {
  if (action === 'move') return <MoveDialog {...props} />;
  if (action === 'collect') return <CollectDialog {...props} />;
  if (action === 'edit') return <EditDialog {...props} />;
  return <DeleteDialog {...props} />;
}
