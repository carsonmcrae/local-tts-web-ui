// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The documents of a library view, with search, filters, sorting, selection and bulk actions.
 * Scope: The view's title and count, the filter bar once there is more than one document, a Select
 *   mode with checkboxes and a bar of actions for the chosen documents (move, collections, details,
 *   favourite, delete), the cards, and what an empty view or an empty search says.
 * Does NOT belong: Choosing the view (LibraryRail), uploading (UploadArea) or a card (DocumentCard).
 */
import { CheckSquare, Star, X } from 'lucide-react';
import { useState } from 'react';
import { useOrganize } from '@/api/libraryQueries';
import type { Collection, DocumentSummary, Folder } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { DocumentCard } from './DocumentCard';
import { applyFilters, defaultFilters, hasNarrowing, LibraryFilterBar } from './LibraryFilters';
import type { OrganizeAction } from './OrganizeDialogs';
import { OrganizeDialog } from './OrganizeDialogs';
import type { LibraryView } from './views';
import { emptyCopy, viewTitle } from './views';

interface ListProps {
  documents: readonly DocumentSummary[]; // the view's documents
  view: LibraryView;
  folders: readonly Folder[];
  collections: readonly Collection[];
  total: number; // every document in the library
}

function BulkBar({
  chosen,
  onAction,
  onDone,
}: Readonly<{
  chosen: readonly DocumentSummary[];
  onAction: (action: OrganizeAction) => void;
  onDone: () => void;
}>) {
  const organize = useOrganize();
  const allFavourite = chosen.length > 0 && chosen.every((doc) => doc.shelf.favorite);
  return (
    <div
      role="toolbar"
      aria-label="Selected documents"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-accent/40 bg-accent-soft/60 p-2 pl-3"
    >
      <span className="mr-auto text-sm font-medium">{chosen.length} selected</span>
      <Button size="sm" onClick={() => onAction('move')} disabled={!chosen.length}>
        Move to folder…
      </Button>
      <Button size="sm" onClick={() => onAction('collect')} disabled={!chosen.length}>
        Collections…
      </Button>
      <Button size="sm" onClick={() => onAction('edit')} disabled={!chosen.length}>
        Edit details…
      </Button>
      <Button
        size="sm"
        icon={<Star size={14} />}
        disabled={!chosen.length}
        loading={organize.isPending}
        onClick={() =>
          organize.mutate({ documentIds: chosen.map((doc) => doc.id), favorite: !allFavourite })
        }
      >
        {allFavourite ? 'Remove favourite' : 'Favourite'}
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => onAction('delete')}
        disabled={!chosen.length}
      >
        Delete…
      </Button>
      <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={onDone}>
        Done
      </Button>
    </div>
  );
}

export function LibraryList({ documents, view, folders, collections, total }: Readonly<ListProps>) {
  const [filters, setFilters] = useState(defaultFilters);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<{
    action: OrganizeAction;
    documents: DocumentSummary[];
  } | null>(null);
  const shown = applyFilters(documents, filters);
  const chosen = documents.filter((doc) => selected.has(doc.id));
  const tools = total > 1;
  const title = viewTitle(view, folders, collections);
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };
  const select = (id: string, on: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-muted">
            {documents.length === total
              ? `${total} total · drag files anywhere to add`
              : `${documents.length} of ${total}`}
          </span>
          {tools ? (
            <Button
              size="sm"
              variant={selecting ? 'subtle' : 'ghost'}
              icon={<CheckSquare size={14} />}
              aria-pressed={selecting}
              onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
            >
              Select
            </Button>
          ) : null}
        </div>
      </div>
      {tools ? <LibraryFilterBar filters={filters} onChange={setFilters} /> : null}
      {selecting ? (
        <BulkBar
          chosen={chosen}
          onAction={(action) => setDialog({ action, documents: chosen })}
          onDone={stopSelecting}
        />
      ) : null}
      {documents.length === 0 ? (
        <EmptyState icon={<CheckSquare size={24} />} title={emptyCopy(view).title}>
          {emptyCopy(view).hint}
        </EmptyState>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong p-8 text-center text-sm text-muted">
          <p>
            {filters.query.trim()
              ? `No documents match “${filters.query.trim()}”.`
              : 'No documents match these filters.'}
          </p>
          <Button size="sm" onClick={() => setFilters({ ...defaultFilters(), sort: filters.sort })}>
            Clear {hasNarrowing(filters) ? 'filters' : 'search'}
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {shown.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              selectable={selecting}
              selected={selected.has(doc.id)}
              onSelectChange={selecting ? (on) => select(doc.id, on) : undefined}
              onAction={(action, target) => setDialog({ action, documents: [target] })}
            />
          ))}
        </ul>
      )}
      {dialog ? (
        <OrganizeDialog
          action={dialog.action}
          documents={dialog.documents}
          folders={folders}
          collections={collections}
          onClose={() => {
            setDialog(null);
            if (dialog.action === 'delete') stopSelecting();
          }}
        />
      ) : null}
    </>
  );
}
