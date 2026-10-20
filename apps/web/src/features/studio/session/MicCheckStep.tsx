/**
 * Purpose: Check the microphone before a studio session, hear it, and fix its tone automatically.
 * Scope: Lists the inputs and picks the likeliest studio microphone until the speaker chooses one;
 *   records an 8-second check (two seconds of quiet, then one line); shows the server's verdict on
 *   level, noise, clipping and tone with fixes; plays the recording back; and, for a bright or thin
 *   microphone, offers an automatic tone correction (on by default) with a before-and-after preview.
 * Does NOT belong: Recording session takes (SessionRecorder) or applying the correction (the server).
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { Mic, Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import { describeError } from '@/api/client';
import { checkMicrophone, previewTone } from '@/api/queries';
import type { MicCheck, ToneCorrection } from '@/api/types';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { Field, Select, Switch } from '@/components/ui/Field';
import { listInputs, preferredInput } from '@/lib/audio/pcmRecorder';
import { encodeWav } from '@/lib/audio/wav';
import { IssueList } from '../IssueList';
import { LevelMeter } from '../LevelMeter';
import { useClipPlayer } from '../useClipPlayer';
import { blobId, readAsDataUrl, useDataUrl } from '../useDataUrl';
import { describeTone } from './tone';
import { useTakeRecorder } from './useTakeRecorder';

const CHECK_S = 8;
const QUIET_S = 2;
const LINE =
  'Six bright yellow jackets hung by the cottage door, swaying gently in the evening breeze.';

function ListenButton({
  label,
  src,
  player,
}: Readonly<{ label: string; src: string | undefined; player: ReturnType<typeof useClipPlayer> }>) {
  const playing = src !== undefined && player.playing === src;
  return (
    <Button
      size="sm"
      disabled={!src}
      icon={
        playing ? <Square size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />
      }
      onClick={() => src && player.toggle(src)}
    >
      {playing ? 'Stop' : label}
    </Button>
  );
}

/** The verdict, a way to hear the recording, and the automatic tone correction when it's needed. */
function CheckResult({
  result,
  recording,
  tone,
  onTone,
}: Readonly<{
  result: MicCheck;
  recording: Blob;
  tone: ToneCorrection | null;
  onTone: (tone: ToneCorrection | null) => void;
}>) {
  const player = useClipPlayer();
  const original = useDataUrl(recording);
  const { suggested } = result;
  const corrected = useQuery({
    queryKey: ['tone-preview', blobId(recording), suggested?.trebleDb, suggested?.bassDb],
    queryFn: async () => readAsDataUrl(await previewTone(recording, suggested as ToneCorrection)),
    enabled: suggested !== null,
    staleTime: Infinity,
  });
  return (
    <div className="flex flex-col gap-3">
      {result.report.issues.length === 0 ? (
        <Banner tone="success" title="Your microphone sounds good">
          Clear level, little background noise and a natural, full tone. Listen back to be sure.
        </Banner>
      ) : (
        <IssueList issues={result.report.issues} />
      )}
      {suggested ? (
        <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line p-4">
          <Switch
            checked={tone !== null}
            onCheckedChange={(on) => onTone(on ? suggested : null)}
            label="Correct the tone automatically"
            description={`Your takes are kept as recorded; the voice is built from copies with the ${describeTone(suggested)}.`}
          />
          {corrected.isError ? (
            <Banner tone="error">{describeError(corrected.error)}</Banner>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <ListenButton label="Play your recording" src={original} player={player} />
        {suggested ? (
          <ListenButton label="Play it corrected" src={corrected.data} player={player} />
        ) : null}
      </div>
    </div>
  );
}

export function MicCheckStep({
  deviceId,
  onDevice,
  tone,
  onTone,
}: Readonly<{
  /** The chosen input: null until the speaker or the automatic pick chooses one, '' for the system default. */
  deviceId: string | null;
  onDevice: (deviceId: string) => void;
  tone: ToneCorrection | null;
  onTone: (tone: ToneCorrection | null) => void;
}>) {
  // Labels (and sometimes the list itself) appear once the browser has microphone permission.
  const inputs = useQuery({ queryKey: ['audio-inputs'], queryFn: listInputs });
  const preferred = preferredInput(inputs.data ?? []);
  const [recording, setRecording] = useState<Blob | null>(null);
  const check = useMutation({
    mutationFn: checkMicrophone,
    onSuccess: (result) => onTone(result.suggested),
  });
  const take = useTakeRecorder(CHECK_S, (clip) => {
    const wav = encodeWav(clip.samples, clip.sampleRate, 24);
    setRecording(wav);
    check.mutate(wav);
    void inputs.refetch();
  });

  // Until the speaker picks one, use the input that looks most like a studio microphone.
  useEffect(() => {
    if (deviceId === null && preferred) onDevice(preferred.deviceId);
  }, [deviceId, preferred, onDevice]);

  return (
    <div className="flex flex-col gap-5">
      <Field label="Microphone" hint="Choose your USB or XLR microphone if it’s listed.">
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={deviceId ?? ''}
            disabled={take.recording}
            onChange={(event) => onDevice(event.target.value)}
          >
            <option value="">System default</option>
            {(inputs.data ?? []).map((input) => (
              <option key={input.deviceId} value={input.deviceId}>
                {input.label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-line p-5 text-center">
        <p className="text-sm text-muted" aria-live="polite">
          {take.recording && take.elapsed < QUIET_S ? 'Stay quiet for a moment…' : null}
          {take.recording && take.elapsed >= QUIET_S ? 'Now read the line aloud.' : null}
          {take.recording ? null : 'Press Check, stay quiet for two seconds, then read this line:'}
        </p>
        <p className="font-serif text-lg leading-relaxed">{LINE}</p>
        {take.recording ? <LevelMeter level={take.level} /> : null}
        {take.recording ? (
          <Button
            variant="danger"
            icon={<Square size={14} fill="currentColor" />}
            onClick={() => void take.stop()}
          >
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            icon={<Mic size={16} />}
            loading={check.isPending}
            onClick={() => void take.start(deviceId || undefined)}
          >
            {recording ? 'Check again' : 'Check microphone'}
          </Button>
        )}
      </div>
      {take.error ? <Banner tone="error">{take.error}</Banner> : null}
      {check.isError ? <Banner tone="error">{describeError(check.error)}</Banner> : null}
      {check.data && recording && !take.recording ? (
        <CheckResult result={check.data} recording={recording} tone={tone} onTone={onTone} />
      ) : null}
    </div>
  );
}
