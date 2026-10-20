/**
 * Purpose: The guided "Quick voice" flow: one short recording.
 * Scope: Five steps — understand, capture, review (with the cleanup controls), name & consent, test —
 *   with a progress header, step gating (errors block, warnings don't), profile creation with the
 *   chosen cleanup (remembered for the next recording) and the shared test step.
 * Does NOT belong: Step internals (CaptureStep, ReviewSteps, TestStep), the studio route
 *   (session/StudioVoiceWizard) or the profile list.
 */
import { Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { describeError } from '@/api/client';
import { useCreateProfile } from '@/api/queries';
import type { Cleanup, VoiceProfile } from '@/api/types';
import { Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import type { CapturedClip } from './CaptureStep';
import { CaptureStep } from './CaptureStep';
import { isActive, NO_CLEANUP, rememberCleanup } from './cleanup';
import { DetailsStep, ReviewStep } from './ReviewSteps';
import { ReferenceExplainer } from './ReferenceExplainer';
import { TestStep } from './TestStep';
import { Stepper, WizardFooter } from './WizardChrome';

const STEPS = ['Before you start', 'Record', 'Check', 'Name & consent', 'Try it'] as const;

/** The body of the current step. */
function WizardStepContent({
  step,
  clip,
  profile,
  error,
  name,
  consent,
  onName,
  onConsent,
  onCaptured,
  onRetake,
  onVerdict,
  cleanup,
  onCleanup,
}: Readonly<{
  step: number;
  clip: CapturedClip | null;
  profile: VoiceProfile | undefined;
  error: unknown;
  name: string;
  consent: boolean;
  onName: (name: string) => void;
  onConsent: (consent: boolean) => void;
  onCaptured: (clip: CapturedClip) => void;
  onRetake: () => void;
  onVerdict: (ok: boolean, wav: Blob) => void;
  cleanup: Cleanup;
  onCleanup: (cleanup: Cleanup) => void;
}>) {
  return (
    <>
      {step === 0 ? <ReferenceExplainer /> : null}
      {step === 1 ? <CaptureStep onCaptured={onCaptured} /> : null}
      {step === 2 && clip ? (
        <ReviewStep
          clip={clip}
          onRetake={onRetake}
          onVerdict={onVerdict}
          cleanup={cleanup}
          onCleanup={onCleanup}
        />
      ) : null}
      {step === 3 ? (
        <>
          <DetailsStep name={name} onName={onName} consent={consent} onConsent={onConsent} />
          {error ? (
            <Banner tone="error" className="mt-4">
              {describeError(error)}
            </Banner>
          ) : null}
        </>
      ) : null}
      {step === 4 && profile ? <TestStep profile={profile} /> : null}
    </>
  );
}

export function CreateVoiceWizard({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void }>) {
  const [step, setStep] = useState(0);
  const [clip, setClip] = useState<CapturedClip | null>(null);
  const [verdict, setVerdict] = useState<{ ok: boolean; wav: Blob } | null>(null);
  const [name, setName] = useState('');
  const [consent, setConsent] = useState(false);
  const [cleanup, setCleanup] = useState<Cleanup>(NO_CLEANUP);
  const create = useCreateProfile();
  const onVerdict = useCallback((ok: boolean, wav: Blob) => setVerdict({ ok, wav }), []);

  const reset = () => {
    setStep(0);
    setClip(null);
    setVerdict(null);
    setName('');
    setConsent(false);
    setCleanup(NO_CLEANUP);
    create.reset();
  };
  // The wizard is opened from outside (it has no dialog trigger), so the dialog only ever asks to
  // close; closing starts the next visit from the first step.
  const close = () => {
    onOpenChange(false);
    reset();
  };
  // What "Create voice" uploads: the checked recording and where it came from.
  const upload = verdict && clip ? { wav: verdict.wav, source: clip.source } : null;
  const submit = (input: { wav: Blob; source: CapturedClip['source'] }) =>
    create.mutate(
      { name: name.trim(), ...input, cleanup: isActive(cleanup) ? cleanup : null },
      {
        onSuccess: () => {
          rememberCleanup(cleanup);
          setStep(4);
        },
      },
    );

  const canContinue = [
    true,
    Boolean(clip),
    Boolean(verdict?.ok),
    Boolean(name.trim() && consent),
    true,
  ][step];
  const action =
    step === 3 && upload
      ? { label: 'Create voice', icon: <Sparkles size={15} />, run: () => submit(upload) }
      : undefined;
  const footer = (
    <WizardFooter
      step={step}
      last={STEPS.length - 1}
      action={action}
      canContinue={canContinue}
      pending={create.isPending}
      onBack={() => setStep(step - 1)}
      onNext={() => setStep(step + 1)}
      onDone={close}
    />
  );

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Create a quick voice"
      description={STEPS[step]}
      size="lg"
      footer={footer}
    >
      <Stepper steps={STEPS} step={step} />
      <WizardStepContent
        step={step}
        clip={clip}
        profile={create.data}
        error={create.isError ? create.error : null}
        name={name}
        consent={consent}
        onName={setName}
        onConsent={setConsent}
        onCaptured={(captured) => {
          setClip(captured);
          setVerdict(null);
          setStep(2);
        }}
        onRetake={() => setStep(1)}
        onVerdict={onVerdict}
        cleanup={cleanup}
        onCleanup={setCleanup}
      />
    </Dialog>
  );
}
