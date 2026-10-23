// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Accessible modal dialogs and confirmation prompts.
 * Scope: Radix Dialog with focus trapping, Escape/overlay dismissal, a consistent header/footer
 *   layout, responsive sizing (bottom sheet on phones), `ConfirmDialog` for destructive actions, and
 *   `closeOnly`, the `onOpenChange` of a dialog that has no trigger and so can only ever close.
 * Does NOT belong: Dialog-specific business logic.
 */
import { X } from 'lucide-react';
import { Dialog as RadixDialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './Button';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

/**
 * The `onOpenChange` of a dialog without a trigger (its parent's state opens it): Radix only ever
 * asks such a dialog to close, so a true here is ignored rather than re-opening it.
 */
export function closeOnly(close: () => void): (open: boolean) => void {
  return (open) => {
    if (!open) close();
  };
}

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: Readonly<DialogProps>) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" />
        <RadixDialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] w-full flex-col rounded-t-[var(--radius-xl)] border border-line bg-surface shadow-overlay',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[85dvh] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[var(--radius-xl)]',
            WIDTHS[size],
          )}
          style={{ animation: 'ltts-fade-in 160ms ease-out' }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 pt-5 pb-4 sm:px-6">
            <div className="min-w-0">
              <RadixDialog.Title className="text-lg font-semibold tracking-tight">
                {title}
              </RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-sm text-muted">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <IconButton label="Close" icon={<X size={18} />} size="sm" className="-mt-1 -mr-2" />
            </RadixDialog.Close>
          </div>
          <div className="min-h-0 flex-1 scrollbar-thin overflow-y-auto px-5 py-5 sm:px-6">
            {children}
          </div>
          {footer ? (
            <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:px-6">
              {footer}
            </div>
          ) : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** The dismiss button's text, when "Cancel" would be ambiguous (e.g. cancelling an export). */
  cancelLabel?: string;
  onConfirm: () => void;
  busy?: boolean;
  destructive?: boolean;
  /** Keeps the confirm button off until the dialog's own condition is met (e.g. a tick box). */
  confirmDisabled?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  busy = false,
  destructive = true,
  confirmDisabled = false,
}: Readonly<ConfirmDialogProps>) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={busy}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-muted">{description}</div>
    </Dialog>
  );
}
