/**
 * Purpose: The reading voice: which voice narrates documents, and choosing a different one.
 * Scope: Reads the saved default voice; choosing a voice switches the player to it and saves it as the
 *   default (preferences live on the server, so every browser shares them).
 * Does NOT belong: Voice lists or previews (features/voices) or playback itself (controller.ts).
 */
import { usePreferences, useSavePreferences } from '@/api/queries';
import { usePlayer } from './PlayerProvider';

export function useReadingVoice() {
  const preferences = usePreferences();
  const save = useSavePreferences();
  const { controller } = usePlayer();
  return {
    current: preferences.data?.defaultVoiceId,
    choose(voiceId: string) {
      void controller.setVoice(voiceId);
      if (preferences.data) save.mutate({ ...preferences.data, defaultVoiceId: voiceId });
    },
  };
}
