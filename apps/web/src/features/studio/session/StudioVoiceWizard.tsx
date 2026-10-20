/**
 * Purpose: The guided "Studio voice" flow: a longer recorded session built into a voice.
 * Scope: Seven steps — understand, microphone check, record (creating the session on the way in),
 *   build, choose, name & consent, try it — with step gating, the microphone check's tone correction
 *   carried into the new session, resuming an existing draft session at
 *   the recording step, and finishing the session into a profile. Closing keeps the draft.
 * Does NOT belong: Step internals (MicCheckStep, SessionRecorder, BuildStep, CandidatePicker) or the
 *   quick route (CreateVoiceWizard).
 */
import { Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { describeError } from '@/api/client';
import { useCreateSession, useFinishSession, useVoiceSession } from '@/api/queries';
import type { ToneCorrection, VoiceSession } from '@/api/types';
import { Dialog } from '@/components/ui/Dialog';
import { Banner, Skeleton } from '@/components/ui/Feedback';
import { DetailsStep } from '../ReviewSteps';
import { TestStep } from '../TestStep';
import { Stepper, WizardFooter } from '../WizardChrome';
import { BuildStep } from './BuildStep';
import { CandidatePicker } from './CandidatePicker';
import { MicCheckStep } from './MicCheckStep';
import { SessionRecorder } from './SessionRecorder';
import { StudioIntro } from './StudioIntro';

const STEPS = [
  'Before you start',
  'Microphone',
  'Record',
  'Build',
  'Choose',
  'Name & consent',
  'Try it',
] as const;
const MICROPHONE = 1;
const RECORD = 2;
const BUILD = 3;
const CHOOSE = 4;
const DETAILS = 5;

/** Whether the current step's requirements are met (errors block; warnings don't). */
function stepDone(
  step: number,
  session: VoiceSession | undefined,
  candidate: number | null,
  details: boolean,
): boolean {
  if (step === RECORD) return Boolean(session && session.usableSpeechS >= session.requiredSpeechS);
  if (step === BUILD) return Boolean(session?.candidates.length);
  if (step === CHOOSE) return candidate !== null;
  if (step === DETAILS) return details;
  return true;
}

/** Why creating the session or the voice failed, if it did. */
function RequestError({ error }: Readonly<{ error: Error | null }>) {
  if (!error) return null;
  return (
    <Banner tone="error" className="mt-4">
      {describeError(error)}
    </Banner>
  );
}

/** The steps that work on the session itself, with a placeholder while it loads. */
function SessionStep({
  step,
  session,
  deviceId,
  candidate,
  onCandidate,
  onBuilt,
}: Readonly<{
  step: number;
  session: VoiceSession | undefined;
  deviceId: string;
  candidate: number | null;
  onCandidate: (index: number) => void;
  onBuilt: () => void;
}>) {
  if (!session) return <Skeleton className="h-64" />;
  if (step === RECORD) return <SessionRecorder session={session} deviceId={deviceId} />;
  if (step === BUILD) return <BuildStep session={session} onBuilt={onBuilt} />;
  return <CandidatePicker session={session} value={candidate} onChange={onCandidate} />;
}

export function StudioVoiceWizard({
  open,
  onOpenChange,
  resumeId,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; resumeId: string | null }>) {
  const [step, setStep] = useState(resumeId ? RECORD : 0);
  const [sessionId, setSessionId] = useState<string | null>(resumeId);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [tone, setTone] = useState<ToneCorrection | null>(null);
  const [candidate, setCandidate] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const session = useVoiceSession(sessionId);
  const create = useCreateSession();
  const finish = useFinishSession();
  const toChoose = useCallback(() => setStep(CHOOSE), []);
  const data = session.data;
  // The best match is chosen until the speaker picks another.
  const chosen = candidate ?? data?.candidates[0]?.index ?? null;

  const close = () => onOpenChange(false);
  const next = () => {
    if (step === MICROPHONE && !sessionId) {
      create.mutate(tone, {
        onSuccess: (created) => {
          setSessionId(created.id);
          setStep(RECORD);
        },
      });
      return;
    }
    setStep(step + 1);
  };
  const canContinue = stepDone(step, data, chosen, Boolean(name.trim() && consent));
  const action =
    step === DETAILS && sessionId && chosen !== null
      ? {
          label: 'Create voice',
          icon: <Sparkles size={15} />,
          run: () =>
            finish.mutate(
              { sessionId, candidate: chosen, name: name.trim() },
              { onSuccess: () => setStep(DETAILS + 1) },
            ),
        }
      : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Create a studio voice"
      description={STEPS[step]}
      size="lg"
      footer={
        <WizardFooter
          step={step}
          last={STEPS.length - 1}
          action={action}
          canContinue={canContinue}
          pending={create.isPending || finish.isPending}
          onBack={() => setStep(step - 1)}
          onNext={next}
          onDone={close}
        />
      }
    >
      <Stepper steps={STEPS} step={step} />
      {step === 0 ? <StudioIntro /> : null}
      {step === MICROPHONE ? (
        <MicCheckStep deviceId={deviceId} onDevice={setDeviceId} tone={tone} onTone={setTone} />
      ) : null}
      {step >= RECORD && step < DETAILS ? (
        <SessionStep
          step={step}
          session={data}
          deviceId={deviceId ?? ''}
          candidate={chosen}
          onCandidate={setCandidate}
          onBuilt={toChoose}
        />
      ) : null}
      {step === DETAILS ? (
        <DetailsStep name={name} onName={setName} consent={consent} onConsent={setConsent} />
      ) : null}
      {step === DETAILS + 1 && finish.data ? <TestStep profile={finish.data} /> : null}
      <RequestError error={create.error ?? finish.error} />
    </Dialog>
  );
}
