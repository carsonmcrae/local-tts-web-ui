// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Add documents to the library by file picker, drag-and-drop, pasting text or a web page.
 * Scope: Client-side pre-checks (type and size, for fast feedback only — the server re-validates
 *   everything), upload progress, server error display, and the paste-text dialog.
 * Does NOT belong: Extraction rules (server) or library listing.
 */
import { ClipboardPaste, FileUp, Globe, UploadCloud } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { describeError } from '@/api/client';
import { usePasteText, useUploadDocument } from '@/api/queries';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner, StatusRegion } from '@/components/ui/Feedback';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { IndeterminateBar } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';

const ACCEPTED = '.txt,.md,.markdown,.pdf,.docx,.epub,.html,.htm,.fb2,.fb2.zip,.mobi,.azw,.azw3';
const ACCEPTED_EXTENSIONS = new Set(ACCEPTED.split(','));
const CLIENT_MAX_BYTES = 25 * 1024 * 1024;

/** The extension that decides a file's format; FB2 books are often zipped as ".fb2.zip". */
function extensionOf(name: string): string {
  const lower = name.toLowerCase();
  return lower.endsWith('.fb2.zip') ? '.fb2.zip' : lower.slice(lower.lastIndexOf('.'));
}

export function precheck(file: File, maxBytes = CLIENT_MAX_BYTES): string | null {
  if (!ACCEPTED_EXTENSIONS.has(extensionOf(file.name)))
    return `“${file.name}” isn't a supported format. Use TXT, Markdown, PDF, DOCX, EPUB, HTML, FB2 or MOBI.`;
  if (file.size === 0) return `“${file.name}” is empty.`;
  if (file.size > maxBytes)
    return `“${file.name}” is larger than the ${Math.round(maxBytes / 1048576)} MB limit.`;
  return null;
}

export function useDocumentIntake() {
  const upload = useUploadDocument();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);

  const submit = useCallback(
    (file: File) => {
      const problem = precheck(file);
      setError(problem);
      if (problem) return;
      setCurrent(file.name);
      upload.mutate(file, {
        onSuccess: (document) => void navigate(`/read/${document.id}`),
        onError: (failure) => setError(describeError(failure)),
        onSettled: () => setCurrent(null),
      });
    },
    [navigate, upload],
  );
  return { submit, error, clearError: () => setError(null), uploading: current };
}

export function PasteTextDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const paste = usePasteText();
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const submit = () =>
    paste.mutate(
      { text, ...(title.trim() ? { title: title.trim() } : {}) },
      {
        onSuccess: (document) => {
          onOpenChange(false);
          setText('');
          setTitle('');
          void navigate(`/read/${document.id}`);
        },
      },
    );
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Paste text"
      description="Anything you paste is stored only on this computer."
      size="lg"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={paste.isPending}
            disabled={!text.trim()}
          >
            Add to library
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title (optional)">
          {({ id }) => (
            <Input
              id={id}
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled"
            />
          )}
        </Field>
        <Field label="Text" hint={`${text.length.toLocaleString()} characters`}>
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="min-h-64 font-serif text-[15px]"
              placeholder="Paste or type the text you want to hear…"
            />
          )}
        </Field>
        {paste.isError ? <Banner tone="error">{describeError(paste.error)}</Banner> : null}
      </div>
    </Dialog>
  );
}

interface DropTargetProps {
  onFile: (file: File) => void;
  children: ReactNode;
  className?: string;
}

/** The drag's data when it carries files (other drags, such as selected text, are ignored). */
function fileTransfer(event: DragEvent): DataTransfer | null {
  const transfer = event.dataTransfer;
  if (!transfer?.types.includes('Files')) return null;
  event.preventDefault();
  return transfer;
}

/**
 * Tracks files dragged over `element` and hands a dropped file to `onFile`. Dropping is a pointer
 * shortcut only (the "Upload document" button is the keyboard path), so the element stays a plain,
 * non-interactive container and the drag listeners are attached to it directly.
 */
function useFileDrop(element: HTMLElement | null, onFile: (file: File) => void): boolean {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  useEffect(() => {
    if (!element) return undefined;
    const move = (event: DragEvent, change: number) => {
      if (!fileTransfer(event)) return;
      depth.current += change;
      setDragging(depth.current > 0);
    };
    const onEnter = (event: DragEvent) => move(event, 1);
    const onLeave = (event: DragEvent) => move(event, -1);
    const onOver = (event: DragEvent) => move(event, 0);
    const onDrop = (event: DragEvent) => {
      const transfer = fileTransfer(event);
      depth.current = 0;
      setDragging(false);
      const file = transfer?.files[0];
      if (file) onFile(file);
    };
    element.addEventListener('dragenter', onEnter);
    element.addEventListener('dragleave', onLeave);
    element.addEventListener('dragover', onOver);
    element.addEventListener('drop', onDrop);
    return () => {
      element.removeEventListener('dragenter', onEnter);
      element.removeEventListener('dragleave', onLeave);
      element.removeEventListener('dragover', onOver);
      element.removeEventListener('drop', onDrop);
    };
  }, [element, onFile]);
  return dragging;
}

export function DropTarget({ onFile, children, className }: Readonly<DropTargetProps>) {
  const [zone, setZone] = useState<HTMLDivElement | null>(null);
  const dragging = useFileDrop(zone, onFile);
  return (
    <div ref={setZone} className={cn('relative', className)}>
      {children}
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[var(--radius-xl)] border-2 border-dashed border-accent bg-accent-soft/90">
          <p className="flex items-center gap-2 text-base font-medium text-accent-text">
            <UploadCloud size={22} /> Drop to add to your library
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function UploadButtons({
  onFile,
  onPaste,
  onWebPage,
}: Readonly<{ onFile: (file: File) => void; onPaste: () => void; onWebPage: () => void }>) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button variant="ghost" icon={<Globe size={16} />} onClick={onWebPage}>
        Import a web page
      </Button>
      <Button icon={<ClipboardPaste size={16} />} onClick={onPaste}>
        Paste text
      </Button>
      <Button variant="primary" icon={<FileUp size={16} />} onClick={() => input.current?.click()}>
        Upload document
      </Button>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED}
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose a document to upload"
        data-testid="file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = '';
        }}
      />
    </>
  );
}

export function UploadStatus({
  uploading,
  error,
  onDismiss,
}: Readonly<{ uploading: string | null; error: string | null; onDismiss: () => void }>) {
  if (uploading) {
    return (
      <StatusRegion className="mb-6 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
        <p className="mb-3 text-sm">
          Reading <span className="font-medium">{uploading}</span>… Large PDFs and books can take a
          few seconds.
        </p>
        <IndeterminateBar />
      </StatusRegion>
    );
  }
  if (error) {
    return (
      <Banner
        tone="error"
        title="That document couldn't be added"
        className="mb-6"
        action={
          <Button size="sm" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        }
      >
        {error}
      </Banner>
    );
  }
  return null;
}
