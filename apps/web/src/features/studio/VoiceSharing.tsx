// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Share a custom voice with someone else's TTSNative, and import a voice shared with you.
 * Scope: "Share" explains what the .ttsvoice file holds (the built voice, its styles and a short
 *   reference; never the session recordings) and what anyone holding it can do, and downloads it
 *   only after an explicit confirmation. "Import a voice" takes a .ttsvoice file, shows what it holds
 *   once the server has checked it (VoiceFilePreview), then takes an optional new name and the
 *   importer's own consent and adds it to the voice list (never replacing a voice).
 * Does NOT belong: Packaging or checking voices (the server) or the rest of the profile card.
 */
import { Download, Share2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { describeError } from '@/api/client';
import {
  exportVoiceUrl,
  useConsentStatement,
  useImportVoice,
  usePreviewVoice,
} from '@/api/studioQueries';
import type { VoiceProfile } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { closeOnly, Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Checkbox, Field, Input } from '@/components/ui/Field';
import { VoiceFilePreview } from './VoiceFilePreview';

const MAX_PACKAGE_BYTES = 40 * 1024 * 1024;

export function ShareVoiceButton({ profile }: Readonly<{ profile: VoiceProfile }>) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const close = () => {
    setOpen(false);
    setConfirmed(false);
  };
  return (
    <>
      <Button size="sm" icon={<Share2 size={13} />} onClick={() => setOpen(true)}>
        Share
      </Button>
      <Dialog
        open={open}
        onOpenChange={closeOnly(close)}
        title={`Share “${profile.name}”`}
        description="Save the voice as a .ttsvoice file that another TTSNative can import."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {confirmed ? (
              <a
                href={exportVoiceUrl(profile.id)}
                download
                onClick={close}
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-3.5 text-[13px] font-medium text-accent-fg hover:bg-accent-hover"
              >
                <Download size={14} aria-hidden />
                Download voice file
              </a>
            ) : (
              <Button variant="primary" icon={<Download size={14} />} disabled>
                Download voice file
              </Button>
            )}
          </div>
        }
      >
        <div className="flex flex-col gap-4 text-sm leading-relaxed">
          <p className="text-muted">
            The file holds the built voice, its speaking styles and one short reference clip. Your
            session recordings stay on this computer.
          </p>
          <Banner tone="warning" title="Anyone with this file can make this voice say anything">
            Only share your own voice, or one whose owner agreed to it being shared, and only with
            people you trust. Speech made with it carries an inaudible watermark.
          </Banner>
          <Checkbox
            checked={confirmed}
            onCheckedChange={setConfirmed}
            label="This is my voice, or its owner has agreed to me sharing it with the person I’m sending it to."
          />
        </div>
      </Dialog>
    </>
  );
}

export function ImportVoiceButton() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const statement = useConsentStatement();
  const importer = useImportVoice();
  const preview = usePreviewVoice();
  const close = () => {
    setOpen(false);
    setFile(null);
    setName('');
    setConsent(false);
    setProblem(null);
    importer.reset();
    preview.reset();
  };
  const choose = (chosen: File) => {
    setProblem(null);
    setFile(null);
    preview.reset();
    if (!chosen.name.toLowerCase().endsWith('.ttsvoice')) setProblem('Choose a .ttsvoice file.');
    else if (chosen.size > MAX_PACKAGE_BYTES) setProblem('That file is larger than 40 MB.');
    else {
      setFile(chosen);
      preview.mutate(chosen);
    }
  };
  const submit = (chosen: File) =>
    importer.mutate({ file: chosen, name: name.trim() }, { onSuccess: close });
  return (
    <>
      <Button icon={<Upload size={15} />} onClick={() => setOpen(true)}>
        Import a voice
      </Button>
      <Dialog
        open={open}
        onOpenChange={closeOnly(close)}
        title="Import a voice"
        description="Add a voice someone shared with you as a .ttsvoice file."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              variant="primary"
              icon={<Upload size={14} />}
              disabled={!file || !consent || !preview.isSuccess}
              loading={importer.isPending}
              onClick={file ? () => submit(file) : undefined} // disabled without a file
            >
              Import voice
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={() => input.current?.click()}>
              Choose file
            </Button>
            <span className="text-sm text-muted">{file ? file.name : 'No file chosen'}</span>
            <input
              ref={input}
              type="file"
              accept=".ttsvoice"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a voice file"
              data-testid="voice-import-input"
              onChange={(event) => {
                const chosen = event.target.files?.[0];
                if (chosen) choose(chosen);
                event.target.value = '';
              }}
            />
          </div>
          {preview.isPending ? (
            <p className="text-sm text-muted" role="status">
              Checking the voice file…
            </p>
          ) : null}
          {preview.isError ? <Banner tone="error">{describeError(preview.error)}</Banner> : null}
          {preview.data ? <VoiceFilePreview preview={preview.data} /> : null}
          <Field label="Name (optional)" hint="Leave empty to keep the name it was shared with.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={name}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          {statement.data ? (
            <Checkbox
              checked={consent}
              onCheckedChange={setConsent}
              label={statement.data.statement}
            />
          ) : null}
          {problem ? <Banner tone="error">{problem}</Banner> : null}
          {importer.isError ? <Banner tone="error">{describeError(importer.error)}</Banner> : null}
        </div>
      </Dialog>
    </>
  );
}
