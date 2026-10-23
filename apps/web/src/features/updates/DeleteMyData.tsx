// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Settings → About in the desktop app: delete everything TTSNative keeps for this Windows
 *   account.
 * Scope: A button, then one confirmation that names what is deleted and needs a tick before its button
 *   works; the app closes to delete the folders. A Microsoft Store install says that uninstalling keeps
 *   the data, since the Store's uninstaller can't ask the way the direct installer does.
 * Does NOT belong: The deletion itself (the desktop app's erase.rs) or the rest of About (AboutUpdates).
 */
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { closeOnly, ConfirmDialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { desktop } from '@/lib/desktop';

export function DeleteMyData({ store }: Readonly<{ store: boolean }>) {
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setSure(false);
    setError(null);
    setOpen(false);
  };

  // On success the app closes, so only a failure comes back here.
  const erase = async () => {
    setBusy(true);
    setError(null);
    try {
      await desktop.deleteUserData();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setOpen(true)}>
        Delete my data…
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={closeOnly(close)}
        title="Delete all your TTSNative data?"
        description={
          <div className="flex flex-col gap-3">
            <p>
              This permanently deletes, for this Windows account, the documents in your library,
              your custom voices and recordings, exported audio kept by TTSNative, downloaded
              models, settings and logs. TTSNative closes to delete them. Files you saved elsewhere,
              such as downloaded MP3s, stay where they are.
            </p>
            <p>
              {store
                ? 'Uninstalling TTSNative from Windows keeps this data, so delete it here first if you want it gone.'
                : 'Uninstalling TTSNative keeps this data unless you choose to delete it there too.'}
            </p>
            <label className="flex items-center gap-2 font-medium text-text">
              <input
                type="checkbox"
                className="size-4 accent-[var(--color-danger)]"
                checked={sure}
                onChange={(event) => setSure(event.target.checked)}
              />
              <span>I understand this can’t be undone</span>
            </label>
            {error ? <Banner tone="error">{error}</Banner> : null}
          </div>
        }
        confirmLabel="Delete and close TTSNative"
        confirmDisabled={!sure}
        busy={busy}
        onConfirm={() => void erase()}
      />
    </>
  );
}
