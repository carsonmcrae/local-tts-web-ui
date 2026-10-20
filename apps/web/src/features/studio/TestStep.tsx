/**
 * Purpose: Try a newly created voice, choose its delivery, and use it for reading.
 * Scope: The wizards' last step: an install prompt when the cloning engine is missing, otherwise a
 *   test sentence to generate, the delivery picker, and "use for reading". `DeliveryPicker` is also
 *   used on each profile card.
 * Does NOT belong: Creating the voice (the wizards).
 */
import { Check, Play } from 'lucide-react';
import { useState } from 'react';
import { useEngines, useUpdateProfile } from '@/api/queries';
import type { Delivery, VoiceProfile } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { EnginePanel } from '@/features/engines/EngineSetup';
import { useReadingVoice } from '@/features/player/useReadingVoice';
import { useVoicePreview } from '@/features/voices/useVoicePreview';

const TEST_TEXT =
  'Hello! This is my new reading voice. It was created on this computer from my own recordings.';

const DELIVERIES: readonly { value: Delivery; label: string; hint: string }[] = [
  { value: 'steady', label: 'Steady', hint: 'Even and calm. Good for long reading sessions.' },
  { value: 'natural', label: 'Natural', hint: 'The voice’s own rise and fall.' },
  {
    value: 'expressive',
    label: 'Expressive',
    hint: 'More rise and fall. Livelier, but less even from sentence to sentence.',
  },
];

export function DeliveryPicker({ profile }: Readonly<{ profile: VoiceProfile }>) {
  const update = useUpdateProfile();
  const [value, setValue] = useState<Delivery>(profile.delivery);
  const choose = (next: Delivery) => {
    setValue(next);
    update.mutate(
      { id: profile.id, delivery: next },
      { onError: () => setValue(profile.delivery) },
    );
  };
  return (
    <Field label="Delivery" hint={DELIVERIES.find((option) => option.value === value)?.hint}>
      {({ id, describedBy }) => (
        <Select
          id={id}
          aria-describedby={describedBy}
          value={value}
          disabled={update.isPending}
          onChange={(event) => choose(event.target.value as Delivery)}
        >
          {DELIVERIES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function TestStep({ profile }: Readonly<{ profile: VoiceProfile }>) {
  const engines = useEngines();
  const preview = useVoicePreview();
  const reading = useReadingVoice();
  const [text, setText] = useState(TEST_TEXT);
  const engine = engines.data?.find((item) => item.id === profile.engineId);
  const isDefault = reading.current === profile.voiceId;

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
      <DeliveryPicker profile={profile} />
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
          onClick={() => reading.choose(profile.voiceId)}
        >
          {isDefault ? 'Used for reading' : 'Use for reading'}
        </Button>
      </div>
    </div>
  );
}
