/**
 * Purpose: The guided "Create voice" flow.
 * Scope: Five steps — understand, capture, review, name & consent, test — with a progress header,
 *   step gating (errors block, warnings don't), profile creation, a test generation with the new
 *   voice (or an install prompt when the cloning engine is missing) and "use for reading".
 * Does NOT belong: Step internals (CaptureStep, ReviewSteps) or the profile list.
 */
import { ArrowLeft, ArrowRight, Check, Play, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';
import { describeError } from '@/api/client';
import { useCreateProfile, useEngines, usePreferences, useSavePreferences } from '@/api/queries';
import type { VoiceProfile } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Banner } from '@/components/ui/Feedback';
import { Textarea } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import { EnginePanel } from '@/features/engines/EngineSetup';
import { usePlayer } from '@/features/player/PlayerProvider';
import { useVoicePreview } from '@/features/voices/useVoicePreview';
import type { CapturedClip } from './CaptureStep';
import { CaptureStep } from './CaptureStep';
import { DetailsStep, ReviewStep } from './ReviewSteps';
import { ReferenceExplainer } from './ReferenceExplainer';

const STEPS = ['Before you start', 'Record', 'Check', 'Name & consent', 'Try it'] as const;
const TEST_TEXT =
  'Hello! This is my new reading voice. It was created on this computer from a short recording.';

function Stepper({ step }: Readonly<{ step: number }>) {
  return (
    <ol className="mb-6 grid grid-cols-5 gap-1.5" aria-label="Progress">
      {STEPS.map((label, index) => (
        <li
          key={label}
          aria-current={index === step ? 'step' : undefined}
          className="flex flex-col gap-1.5"
        >
          <span className={cn('h-1 rounded-full', index <= step ? 'bg-accent' : 'bg-surface-3')} />
          <span
            className={cn(
              'hidden text-xs sm:block',
              index === step ? 'font-medium text-text' : 'text-subtle',
            )}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function TestStep({ profile }: Readonly<{ profile: VoiceProfile }>) {
  const engines = useEngines();
  const preview = useVoicePreview();
  const preferences = usePreferences();
  const save = useSavePreferences();
  const { controller } = usePlayer();
  const [text, setText] = useState(TEST_TEXT);
  const engine = engines.data?.find((item) => item.id === profile.engineId);
  const isDefault = preferences.data?.defaultVoiceId === profile.voiceId;

  if (engine && engine.status !== 'ready') {
    return (
      <div className="flex flex-col gap-4">
        <Banner tone="success" title={`“${profile.name}” is saved`}>
          To hear it, install the voice-cloning engine below. Your recording stays safe in the
          meantime.
        </Banner>
        <EnginePanel engine={engine} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <Banner tone="success" title={`“${profile.name}” is saved`}>
        Generate a sample to hear it. The first generation loads the model and can take a little
        while.
      </Banner>
      <Textarea
        aria-label="Test sentence"
        value={text}
        maxLength={400}
        onChange={(event) => setText(event.target.value)}
        className="font-serif"
      />
      {preview.state.error ? <Banner tone="error">{preview.state.error.message}</Banner> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={<Play size={15} fill="currentColor" />}
          loading={preview.state.status === 'loading'}
          onClick={() => void preview.play(profile.voiceId, text)}
        >
          {preview.state.status === 'loading' ? 'Generating…' : 'Generate sample'}
        </Button>
        <Button
          icon={isDefault ? <Check size={15} /> : undefined}
          disabled={isDefault}
          onClick={() => {
            void controller.setVoice(profile.voiceId);
            if (preferences.data)
              save.mutate({ ...preferences.data, defaultVoiceId: profile.voiceId });
          }}
        >
          {isDefault ? 'Used for reading' : 'Use for reading'}
        </Button>
      </div>
    </div>
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
  const create = useCreateProfile();
  const onVerdict = useCallback((ok: boolean, wav: Blob) => setVerdict({ ok, wav }), []);

  const reset = () => {
    setStep(0);
    setClip(null);
    setVerdict(null);
    setName('');
    setConsent(false);
    create.reset();
  };
  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };
  const submit = () => {
    if (!verdict || !clip) return;
    create.mutate(
      { name: name.trim(), wav: verdict.wav, source: clip.source },
      { onSuccess: () => setStep(4) },
    );
  };

  const canContinue = [
    true,
    Boolean(clip),
    Boolean(verdict?.ok),
    Boolean(name.trim() && consent),
    true,
  ][step];
  const footer =
    step === 4 ? (
      <Button variant="primary" onClick={() => close(false)}>
        Done
      </Button>
    ) : (
      <>
        {step > 0 ? (
          <Button
            icon={<ArrowLeft size={15} />}
            onClick={() => setStep(step - 1)}
            disabled={create.isPending}
          >
            Back
          </Button>
        ) : null}
        {step === 3 ? (
          <Button
            variant="primary"
            icon={<Sparkles size={15} />}
            onClick={submit}
            disabled={!canContinue}
            loading={create.isPending}
          >
            Create voice
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setStep(step + 1)} disabled={!canContinue}>
            Continue <ArrowRight size={15} />
          </Button>
        )}
      </>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={close}
      title="Create a voice"
      description={STEPS[step]}
      size="lg"
      footer={footer}
    >
      <Stepper step={step} />
      {step === 0 ? <ReferenceExplainer /> : null}
      {step === 1 ? (
        <CaptureStep
          onCaptured={(captured) => {
            setClip(captured);
            setVerdict(null);
            setStep(2);
          }}
        />
      ) : null}
      {step === 2 && clip ? (
        <ReviewStep clip={clip} onRetake={() => setStep(1)} onVerdict={onVerdict} />
      ) : null}
      {step === 3 ? (
        <>
          <DetailsStep name={name} onName={setName} consent={consent} onConsent={setConsent} />
          {create.isError ? (
            <Banner tone="error" className="mt-4">
              {describeError(create.error)}
            </Banner>
          ) : null}
        </>
      ) : null}
      {step === 4 && create.data ? <TestStep profile={create.data} /> : null}
    </Dialog>
  );
}
