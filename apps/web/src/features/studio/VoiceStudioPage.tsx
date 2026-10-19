/**
 * Purpose: Voice Studio — create and manage custom voices.
 * Scope: Cloning-engine status (with install), the list of local voice profiles, empty/loading/error
 *   states, and the entry point to the guided creation wizard.
 * Does NOT belong: Wizard steps or built-in voice browsing.
 */
import { Mic, Plus } from 'lucide-react';
import { useState } from 'react';
import { describeError } from '@/api/client';
import { useEngines, useProfiles } from '@/api/queries';
import { Button } from '@/components/ui/Button';
import { Banner, EmptyState, Skeleton } from '@/components/ui/Feedback';
import { PageHeader, Section } from '@/components/ui/Layout';
import { EnginePanel } from '@/features/engines/EngineSetup';
import { CreateVoiceWizard } from './CreateVoiceWizard';
import { ProfileCard } from './ProfileCard';

export default function VoiceStudioPage() {
  const profiles = useProfiles();
  const engines = useEngines();
  const [wizardOpen, setWizardOpen] = useState(false);
  const cloning = engines.data?.find((engine) => engine.supportsCloning);
  const ready = cloning?.status === 'ready';
  const list = profiles.data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <PageHeader
        title="Voice Studio"
        description="Create a narration voice from a short recording of yourself, or of someone who has given you permission."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setWizardOpen(true)}>
            Create voice
          </Button>
        }
      />
      {cloning && !ready ? (
        <div className="mb-8">
          <Section title="Voice-cloning engine" description="Optional. Recording works now; you need the engine to hear custom voices.">
            <EnginePanel engine={cloning} />
          </Section>
        </div>
      ) : null}

      <h2 className="mb-3 text-base font-semibold tracking-tight">Your voices</h2>
      {profiles.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading voices">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : profiles.isError ? (
        <Banner tone="error" title="Couldn't load your voices">
          {describeError(profiles.error)}
        </Banner>
      ) : list.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-dashed border-line-strong">
          <EmptyState
            icon={<Mic size={26} />}
            title="No custom voices yet"
            actions={
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setWizardOpen(true)}>
                Create your first voice
              </Button>
            }
          >
            Read a 20-second passage, check the quality, confirm permission and name it. Your recording never leaves this computer.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((profile) => (
            <ProfileCard key={profile.id} profile={profile} engineReady={ready} />
          ))}
        </ul>
      )}
      <CreateVoiceWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
