// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The library's side rail: the views, the collections and the folder tree.
 * Scope: All documents, Continue reading, Favourites and Recently added with their counts; each
 *   collection and each folder (nested, collapsible) with a menu to rename, move or delete it and to
 *   add a subfolder; dropping a dragged document on a folder moves it there (on All documents, out
 *   of its folder). On phones the same choices are a single select.
 * Does NOT belong: Which documents a view shows (views.ts) or the dialogs' forms (RailDialogs.tsx).
 */
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderClosed,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Plus,
  Star,
} from 'lucide-react';
import type { DragEvent, ReactNode } from 'react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useOrganize } from '@/api/libraryQueries';
import type { Collection, DocumentSummary, Folder } from '@/api/types';
import { IconButton } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import {
  CollectionDialog,
  DeleteCollectionDialog,
  DeleteFolderDialog,
  FolderDialog,
  folderPath,
} from './RailDialogs';
import type { LibraryView } from './views';
import { DOCUMENT_DRAG_TYPE, sameView, selectDocuments, viewSearch } from './views';

type RailDialog =
  | { kind: 'folder'; folder: Folder | null; parentId: string | null }
  | { kind: 'delete-folder'; folder: Folder }
  | { kind: 'collection'; collection: Collection | null }
  | { kind: 'delete-collection'; collection: Collection };

interface RailProps {
  view: LibraryView;
  documents: readonly DocumentSummary[];
  folders: readonly Folder[];
  collections: readonly Collection[];
}

const FIXED: readonly { view: LibraryView; label: string; icon: ReactNode }[] = [
  { view: { kind: 'all' }, label: 'All documents', icon: <BookOpen size={16} /> },
  { view: { kind: 'continue' }, label: 'Continue reading', icon: <Clock size={16} /> },
  { view: { kind: 'favorites' }, label: 'Favourites', icon: <Star size={16} /> },
  { view: { kind: 'recent' }, label: 'Recently added', icon: <Plus size={16} /> },
];

function draggedDocument(event: DragEvent): string | null {
  if (!event.dataTransfer.types.includes(DOCUMENT_DRAG_TYPE)) return null;
  event.preventDefault();
  return event.dataTransfer.getData(DOCUMENT_DRAG_TYPE) || '';
}

/** One rail entry: a link to its view, optionally a drop target for dragged documents and a menu. */
function RailItem({
  item,
  active,
  label,
  icon,
  count,
  depth = 0,
  onDrop,
  menu,
  toggle,
}: Readonly<{
  item: LibraryView;
  active: boolean;
  label: string;
  icon: ReactNode;
  count: number;
  depth?: number;
  onDrop?: ((documentId: string) => void) | undefined;
  menu?: ReactNode;
  toggle?: ReactNode;
}>) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded-[var(--radius-md)] pr-1',
        over && 'bg-accent-soft outline-2 outline-accent',
      )}
      style={{ paddingLeft: depth * 14 }}
      onDragOver={onDrop ? (event) => setOver(draggedDocument(event) !== null) : undefined}
      onDragLeave={onDrop ? () => setOver(false) : undefined}
      onDrop={
        onDrop
          ? (event) => {
              const documentId = draggedDocument(event);
              setOver(false);
              if (documentId) onDrop(documentId);
            }
          : undefined
      }
    >
      {toggle ?? <span className="w-6 shrink-0" />}
      <Link
        to={{ pathname: '/library', search: viewSearch(item) }}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] px-2 text-sm',
          active
            ? 'bg-accent-soft font-medium text-accent-text'
            : 'text-muted hover:bg-surface-2 hover:text-text',
        )}
      >
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="text-xs text-subtle tabular-nums">{count}</span>
      </Link>
      {menu}
    </div>
  );
}

function ItemMenu({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <Popover
      label={label}
      side="bottom"
      align="end"
      trigger={
        <IconButton
          label={label}
          icon={<MoreHorizontal size={15} />}
          size="sm"
          className="opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 sm:data-[state=open]:opacity-100"
        />
      }
    >
      <div className="flex min-w-44 flex-col">{children}</div>
    </Popover>
  );
}

const menuItem =
  'flex min-h-9 items-center rounded-[var(--radius-sm)] px-2.5 text-left text-sm hover:bg-surface-2';

function FolderNode({
  folder,
  folders,
  depth,
  view,
  collapsed,
  onToggle,
  onDrop,
  onDialog,
}: Readonly<{
  folder: Folder;
  folders: readonly Folder[];
  depth: number;
  view: LibraryView;
  collapsed: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onDrop: (folderId: string | null, documentId: string) => void;
  onDialog: (dialog: RailDialog) => void;
}>) {
  const children = folders.filter((other) => other.parentId === folder.id);
  const open = !collapsed.has(folder.id);
  const item: LibraryView = { kind: 'folder', id: folder.id };
  return (
    <>
      <RailItem
        item={item}
        active={sameView(view, item)}
        label={folder.name}
        icon={<FolderClosed size={16} />}
        count={folder.documentCount}
        depth={depth}
        onDrop={(documentId) => onDrop(folder.id, documentId)}
        toggle={
          children.length ? (
            <IconButton
              label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
              icon={open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              size="sm"
              className="size-6"
              onClick={() => onToggle(folder.id)}
            />
          ) : undefined
        }
        menu={
          <ItemMenu label={`Options for ${folder.name}`}>
            <button
              type="button"
              className={menuItem}
              onClick={() => onDialog({ kind: 'folder', folder, parentId: folder.parentId })}
            >
              Rename or move…
            </button>
            <button
              type="button"
              className={menuItem}
              onClick={() => onDialog({ kind: 'folder', folder: null, parentId: folder.id })}
            >
              New subfolder…
            </button>
            <button
              type="button"
              className={cn(menuItem, 'text-danger')}
              onClick={() => onDialog({ kind: 'delete-folder', folder })}
            >
              Delete…
            </button>
          </ItemMenu>
        }
      />
      {open
        ? children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              folders={folders}
              depth={depth + 1}
              view={view}
              collapsed={collapsed}
              onToggle={onToggle}
              onDrop={onDrop}
              onDialog={onDialog}
            />
          ))
        : null}
    </>
  );
}

function SectionHeading({ title, action }: Readonly<{ title: string; action: ReactNode }>) {
  return (
    <div className="mt-5 mb-1 flex items-center justify-between pr-1 pl-8">
      <h2 className="text-[11px] font-semibold tracking-wider text-subtle uppercase">{title}</h2>
      {action}
    </div>
  );
}

export function LibraryRail({ view, documents, folders, collections }: Readonly<RailProps>) {
  const organize = useOrganize();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<RailDialog | null>(null);
  const toggle = (id: string) =>
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const drop = (folderId: string | null, documentId: string) =>
    organize.mutate({ documentIds: [documentId], folderId });
  const closeDialog = () => setDialog(null);
  /** After deleting what is being viewed, show All documents. */
  const closeAndLeave = (gone: LibraryView) => {
    closeDialog();
    if (sameView(view, gone)) void navigate('/library');
  };

  return (
    <nav aria-label="Library views" className="flex flex-col gap-0.5">
      {FIXED.map((fixed) => (
        <RailItem
          key={fixed.label}
          item={fixed.view}
          active={sameView(view, fixed.view)}
          label={fixed.label}
          icon={fixed.icon}
          count={selectDocuments(documents, fixed.view).length}
          onDrop={fixed.view.kind === 'all' ? (documentId) => drop(null, documentId) : undefined}
        />
      ))}
      <SectionHeading
        title="Collections"
        action={
          <IconButton
            label="New collection"
            icon={<Plus size={15} />}
            size="sm"
            onClick={() => setDialog({ kind: 'collection', collection: null })}
          />
        }
      />
      {collections.length === 0 ? (
        <p className="pl-8 text-[13px] text-subtle">Group documents any way you like.</p>
      ) : null}
      {collections.map((collection) => {
        const item: LibraryView = { kind: 'collection', id: collection.id };
        return (
          <RailItem
            key={collection.id}
            item={item}
            active={sameView(view, item)}
            label={collection.name}
            icon={<Layers size={16} />}
            count={collection.documentCount}
            menu={
              <ItemMenu label={`Options for ${collection.name}`}>
                <button
                  type="button"
                  className={menuItem}
                  onClick={() => setDialog({ kind: 'collection', collection })}
                >
                  Edit…
                </button>
                <button
                  type="button"
                  className={cn(menuItem, 'text-danger')}
                  onClick={() => setDialog({ kind: 'delete-collection', collection })}
                >
                  Delete…
                </button>
              </ItemMenu>
            }
          />
        );
      })}
      <SectionHeading
        title="Folders"
        action={
          <IconButton
            label="New folder"
            icon={<FolderPlus size={15} />}
            size="sm"
            onClick={() => setDialog({ kind: 'folder', folder: null, parentId: null })}
          />
        }
      />
      {folders.length === 0 ? (
        <p className="pl-8 text-[13px] text-subtle">Give each document a place of its own.</p>
      ) : null}
      {folders
        .filter((folder) => !folder.parentId)
        .map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            folders={folders}
            depth={0}
            view={view}
            collapsed={collapsed}
            onToggle={toggle}
            onDrop={drop}
            onDialog={setDialog}
          />
        ))}
      {dialog?.kind === 'folder' ? (
        <FolderDialog
          folder={dialog.folder}
          parentId={dialog.parentId}
          folders={folders}
          onClose={closeDialog}
        />
      ) : null}
      {dialog?.kind === 'delete-folder' ? (
        <DeleteFolderDialog
          folder={dialog.folder}
          folders={folders}
          onClose={() => closeAndLeave({ kind: 'folder', id: dialog.folder.id })}
        />
      ) : null}
      {dialog?.kind === 'collection' ? (
        <CollectionDialog collection={dialog.collection} onClose={closeDialog} />
      ) : null}
      {dialog?.kind === 'delete-collection' ? (
        <DeleteCollectionDialog
          collection={dialog.collection}
          onClose={() => closeAndLeave({ kind: 'collection', id: dialog.collection.id })}
        />
      ) : null}
    </nav>
  );
}

/** The rail's choices as one select, for phones. */
export function RailSelect({ view, folders, collections }: Readonly<Omit<RailProps, 'documents'>>) {
  const navigate = useNavigate();
  return (
    <select
      aria-label="Show"
      className="h-10 w-full rounded-[var(--radius-md)] border border-line-strong bg-surface px-3 text-sm lg:hidden"
      value={viewSearch(view)}
      onChange={(event) => void navigate(`/library${event.target.value}`)}
    >
      {FIXED.map((fixed) => (
        <option key={fixed.label} value={viewSearch(fixed.view)}>
          {fixed.label}
        </option>
      ))}
      {collections.length ? (
        <optgroup label="Collections">
          {collections.map((collection) => (
            <option
              key={collection.id}
              value={viewSearch({ kind: 'collection', id: collection.id })}
            >
              {collection.name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {folders.length ? (
        <optgroup label="Folders">
          {folders.map((folder) => (
            <option key={folder.id} value={viewSearch({ kind: 'folder', id: folder.id })}>
              {folderPath(folders, folder.id)}
            </option>
          ))}
        </optgroup>
      ) : null}
    </select>
  );
}
