// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Voice Studio — create and manage custom voices.
 * Scope: Cloning-engine status (with install), the list of local voice profiles, empty/loading/error
 *   states, studio sessions in progress (continue or discard), and the entry point that chooses
 *   between the quick and studio creation wizards. On a paired phone or tablet the page only lists
 *   the voices to choose from: creating, importing and the engine stay on the computer.
 * Does NOT belong: Wizard steps or built-in voice browsing.
 */
import { Mic, Plus } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useDeleteSession, useEngines, useProfiles, useVoiceSessions } from '@/api/queries';
import type { VoiceSession } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Banner, EmptyState, Skeleton, StatusRegion } from '@/components/ui/Feedback';
import { PageHeader, Section } from '@/components/ui/Layout';
import { EnginePanel } from '@/features/engines/EngineSetup';
import { onThisComputer } from '@/features/lan/LanIndicator';
import { CreateVoiceChooser, type CreationRoute } from './CreateVoiceChooser';
import { ImportVoiceButton } from './VoiceSharing';
import { CreateVoiceWizard } from './CreateVoiceWizard';
import { ProfileCard } from './ProfileCard';
import { StudioVoiceWizard } from './session/StudioVoiceWizard';

function DraftSession({
  session,
  onContinue,
}: Readonly<{ session: VoiceSession; onContinue: () => void }>) {
  const discard = useDeleteSession();
  const [confirm, setConfirm] = useState(false);
  const minutes = (session.usableSpeechS / 60).toFixed(1);
  return (
    <Banner
      tone="info"
      title="Studio session in progress"
      action={
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={onContinue}>
            Continue
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            Discard
          </Button>
        </div>
      }
    >
      {session.takes.length} takes, {minutes} minutes of usable speech.
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Discard this studio session?"
        description="This permanently deletes the session's recordings from this computer. It can't be undone."
        confirmLabel="Discard session"
        busy={discard.isPending}
        onConfirm={() =>
          discard.mutate({ sessionId: session.id }, { onSuccess: () => setConfirm(false) })
        }
      />
    </Banner>
  );
}

function ProfileList({
  profiles,
  engineReady,
  onCreate,
}: Readonly<{
  profiles: ReturnType<typeof useProfiles>;
  engineReady: boolean;
  onCreate?: (() => void) | undefined; // absent on a paired phone: voices are made on the computer
}>) {
  if (profiles.isPending) {
    return (
      <StatusRegion label="Loading voices" className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </StatusRegion>
    );
  }
  if (profiles.isError) {
    return (
      <Banner tone="error" title="Couldn't load your voices">
        {describeError(profiles.error)}
      </Banner>
    );
  }
  if (profiles.data.length === 0) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-dashed border-line-strong">
        <EmptyState
          icon={<Mic size={26} />}
          title="No custom voices yet"
          actions={
            onCreate ? (
              <Button variant="primary" icon={<Plus size={16} />} onClick={onCreate}>
                Create your first voice
              </Button>
            ) : undefined
          }
        >
          {onCreate
            ? 'Read a short passage for a quick voice, or record a guided studio session for your most faithful voice. Your recordings never leave this computer.'
            : 'Voices are created on the computer running TTSNative; they appear here to choose from.'}
        </EmptyState>
      </div>
    );
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {profiles.data.map((profile) => (
        <ProfileCard key={profile.id} profile={profile} engineReady={engineReady} />
      ))}
    </ul>
  );
}

export default function VoiceStudioPage() {
  const profiles = useProfiles();
  const engines = useEngines();
  const sessions = useVoiceSessions();
  const [choosing, setChoosing] = useState(false);
  const [route, setRoute] = useState<CreationRoute | null>(null);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const cloning = engines.data?.find((engine) => engine.supportsCloning);
  const here = onThisComputer(); // a paired phone only chooses a voice (LAN mode refuses the rest)
  const ready = cloning?.status === 'ready';
  const choose = (next: CreationRoute) => {
    setChoosing(false);
    setResumeId(null);
    setRoute(next);
  };
  const resume = (id: string) => {
    setResumeId(id);
    setRoute('studio');
  };
  // The wizards only ever ask to close.
  const closeWizard = () => setRoute(null);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title="Voice Studio"
        description="Create a narration voice from a short recording of yourself, or of someone who has given you permission."
        actions={
          here ? (
            <div className="flex flex-wrap gap-2">
              <ImportVoiceButton />
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setChoosing(true)}>
                Create voice
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted">
              Voices are created, imported and changed on the computer running TTSNative.
            </p>
          )
        }
      />
      {here && cloning && (!ready || cloning.updateAvailable) ? (
        <div className="mb-8">
          <Section
            title="Voice-cloning engine"
            description="Optional. Recording works now; you need the engine to hear custom voices."
          >
            <EnginePanel engine={cloning} />
          </Section>
        </div>
      ) : null}

      {sessions.data?.length ? (
        <div className="mb-8 flex flex-col gap-3">
          {sessions.data.map((session) => (
            <DraftSession
              key={session.id}
              session={session}
              onContinue={() => resume(session.id)}
            />
          ))}
        </div>
      ) : null}

      <h2 className="mb-3 text-base font-semibold tracking-tight">Your voices</h2>
      <ProfileList
        profiles={profiles}
        engineReady={ready}
        onCreate={here ? () => setChoosing(true) : undefined}
      />
      <CreateVoiceChooser open={choosing} onOpenChange={setChoosing} onChoose={choose} />
      <CreateVoiceWizard open={route === 'quick'} onOpenChange={closeWizard} />
      {route === 'studio' ? (
        <StudioVoiceWizard
          key={resumeId ?? 'new'}
          open
          onOpenChange={closeWizard}
          resumeId={resumeId}
        />
      ) : null}
    </div>
  );
}
