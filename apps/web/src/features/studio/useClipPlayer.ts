/**
 * Purpose: Play one short audio clip at a time from a URL (a reference recording or a test sample).
 * Scope: A single private Audio element; `toggle(src)` starts that clip (stopping any other) or stops
 *   it if it's already playing; `playing` is the URL being played, cleared when it ends or pauses.
 * Does NOT belong: Document playback (the player).
 */
import { useEffect, useState } from 'react';

export function useClipPlayer() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [audio] = useState(() => new Audio());
  useEffect(() => {
    const stop = () => setPlaying(null);
    audio.addEventListener('ended', stop);
    audio.addEventListener('pause', stop);
    return () => {
      audio.pause();
      audio.removeEventListener('ended', stop);
      audio.removeEventListener('pause', stop);
    };
  }, [audio]);
  const toggle = (src: string) => {
    const wasPlaying = playing === src;
    audio.pause();
    if (wasPlaying) return;
    audio.setAttribute('src', src);
    void audio.play().then(
      () => setPlaying(src),
      () => setPlaying(null),
    );
  };
  return { playing, toggle };
}
