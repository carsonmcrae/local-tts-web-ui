// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Add a web page to the library by its address.
 * Scope: The "Import a web page" dialog: a forgiving address field (a missing https:// is added),
 *   an inline hint for addresses that can't work, the server's explanation when a page can't be
 *   imported, and opening the new document.
 * Does NOT belong: Fetching or reading pages (the server does both, with its own safety checks).
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { api, describeError } from '@/api/client';
import { keys } from '@/api/queries';
import type { DocumentDetail } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';

/** The address to import, with https:// added when no scheme was typed; null when it can't be one. */
export function webAddress(input: string): string | null {
  const trimmed = input.trim();
  const candidate = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.')
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function useImportWebPage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (url: string) =>
      api<DocumentDetail>('/api/documents/url', { method: 'POST', json: { url } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.documents }),
  });
}

export function WebPageDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const importPage = useImportWebPage();
  const navigate = useNavigate();
  const formId = useId();
  const [address, setAddress] = useState('');
  const [problem, setProblem] = useState<string | undefined>();

  // The dialog has no trigger of its own, so it only ever reports being closed.
  const close = () => {
    setAddress('');
    setProblem(undefined);
    importPage.reset();
    onOpenChange(false);
  };
  const submit = () => {
    const url = webAddress(address);
    if (!url) {
      setProblem('Enter a full web address, like https://example.com/article.');
      return;
    }
    setProblem(undefined);
    importPage.mutate(url, {
      onSuccess: (document) => {
        close();
        void navigate(`/read/${document.id}`);
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Import a web page"
      description="The page is downloaded once and only its readable text is kept on this computer."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            variant="primary"
            type="submit"
            form={formId}
            loading={importPage.isPending}
            disabled={!address.trim()}
          >
            Import page
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field
          label="Page address"
          hint="Public articles and blog posts work best. Pages behind a sign-in or paywall can't be read."
          error={problem}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              type="url"
              inputMode="url"
              autoComplete="url"
              spellCheck={false}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="https://example.com/article"
            />
          )}
        </Field>
        {importPage.isError ? (
          <Banner tone="error" title="That page couldn't be imported">
            {describeError(importPage.error)}
          </Banner>
        ) : null}
      </form>
    </Dialog>
  );
}
