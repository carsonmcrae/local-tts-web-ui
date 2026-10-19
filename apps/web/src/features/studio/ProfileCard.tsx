/**
 * Purpose: One custom voice profile in Voice Studio.
 * Scope: Name, source, length, creation date, consent timestamp, what is stored; play the stored
 *   reference, rename, use for reading, and permanent deletion with an explicit confirmation.
 * Does NOT belong: Creation (CreateVoiceWizard).
 */
import { Check, Pencil, Play, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  useDeleteProfile,
  usePreferences,
  useRenameProfile,
  useSavePreferences,
} from '@/api/queries';
import type { VoiceProfile } from '@/api/types';
import { Button, IconButton } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Feedback';
import { Field, Input } from '@/components/ui/Field';
import { useToast } from '@/components/ui/Toast';
import { usePlayer } from '@/features/player/PlayerProvider';
import { useReadingVoice } from '@/features/player/useReadingVoice';
import { formatRelativeDate } from '@/lib/format';

function useReferencePlayer(src: string) {
  const [playing, setPlaying] = useState(false);
  const [audio] = useState(() => (typeof Audio === 'undefined' ? null : new Audio()));
  useEffect(() => {
    if (!audio) return undefined;
    const stop = () => setPlaying(false);
    audio.addEventListener('ended', stop);
    audio.addEventListener('pause', stop);
    return () => {
      audio.pause();
      audio.removeEventListener('ended', stop);
      audio.removeEventListener('pause', stop);
    };
  }, [audio]);
  const toggle = () => {
    if (!audio) return;
    if (playing) {
      audio.pause();
      return;
    }
    audio.setAttribute('src', src);
    void audio.play().then(
      () => setPlaying(true),
      () => setPlaying(false),
    );
  };
  return { playing, toggle };
}

export function ProfileCard({
  profile,
  engineReady,
}: Readonly<{ profile: VoiceProfile; engineReady: boolean }>) {
  const remove = useDeleteProfile();
  const rename = useRenameProfile();
  const preferences = usePreferences();
  const save = useSavePreferences();
  const toast = useToast();
  const { controller, state } = usePlayer();
  const reading = useReadingVoice();
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const reference = useReferencePlayer(`/api/voice-profiles/${profile.id}/reference`);
  const playing = reference.playing;
  const toggleReference = reference.toggle;
  const isDefault = preferences.data?.defaultVoiceId === profile.voiceId;

  const deleteProfile = () =>
    remove.mutate(profile.id, {
      onSuccess: () => {
        if (isDefault && preferences.data)
          save.mutate({ ...preferences.data, defaultVoiceId: 'kokoro:af_heart' });
        if (state.voiceId === profile.voiceId) void controller.setVoice('kokoro:af_heart');
        setConfirm(false);
        toast.notify(
          'success',
          `Deleted “${profile.name}”`,
          'The recording and its generated audio were removed.',
        );
      },
    });

  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-soft">
      <div className="flex items-start gap-3">
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-sm font-semibold text-success"
          aria-hidden="true"
        >
          {profile.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 font-medium">
            <span className="truncate">{profile.name}</span>
            {isDefault ? <Badge tone="accent">Reading voice</Badge> : null}
          </h3>
          <p className="text-[13px] text-muted">
            {profile.durationS.toFixed(0)} s{' '}
            {profile.source === 'import' ? 'imported clip' : 'recording'} · created{' '}
            {formatRelativeDate(profile.createdAt).toLowerCase()}
          </p>
        </div>
        <IconButton
          label={`Rename ${profile.name}`}
          icon={<Pencil size={15} />}
          size="sm"
          onClick={() => setEditing(true)}
        />
        <IconButton
          label={`Delete ${profile.name}`}
          icon={<Trash2 size={15} />}
          size="sm"
          onClick={() => setConfirm(true)}
        />
      </div>
      <p className="text-xs leading-relaxed text-subtle">
        Stores: {profile.stores} Consent confirmed{' '}
        {new Date(profile.consentedAt).toLocaleDateString()}.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={
            playing ? (
              <Square size={13} fill="currentColor" />
            ) : (
              <Play size={13} fill="currentColor" />
            )
          }
          onClick={toggleReference}
        >
          {playing ? 'Stop' : 'Play recording'}
        </Button>
        <Button
          size="sm"
          variant={isDefault ? 'subtle' : 'ghost'}
          icon={isDefault ? <Check size={14} /> : undefined}
          disabled={isDefault || !engineReady}
          title={engineReady ? undefined : 'Install the cloning engine to use this voice'}
          onClick={() => reading.choose(profile.voiceId)}
        >
          {isDefault ? 'Used for reading' : 'Use for reading'}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Permanently delete “${profile.name}”?`}
        description="This deletes the reference recording, the profile and all cached audio generated with this voice from this computer. Files you exported are kept. It can't be undone."
        confirmLabel="Delete voice"
        busy={remove.isPending}
        onConfirm={deleteProfile}
      />
      <Dialog
        open={editing}
        onOpenChange={setEditing}
        title="Rename voice"
        size="sm"
        footer={
          <>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!name.trim()}
              loading={rename.isPending}
              onClick={() =>
                rename.mutate(
                  { id: profile.id, name: name.trim() },
                  { onSuccess: () => setEditing(false) },
                )
              }
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="Voice name">
          {({ id }) => (
            <Input
              id={id}
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
      </Dialog>
    </li>
  );
}
