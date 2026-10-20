// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Guided recording passages written for voice capture.
 * Scope: Original passages (no third-party text) covering varied vowels and consonant clusters,
 *   questions, exclamations, numbers and natural pauses, sized for 15–25 seconds of reading.
 * Does NOT belong: Recording logic.
 */
export interface RecordingScript {
  id: string;
  title: string;
  seconds: string;
  text: string;
}

export const SCRIPTS: readonly RecordingScript[] = [
  {
    id: 'morning-walk',
    title: 'A morning walk',
    seconds: '≈ 20 seconds',
    text:
      "Hello! I'm recording a short sample so this app can learn the sound of my voice. " +
      'On quiet mornings, I like to walk past the old bakery, where warm bread and fresh coffee fill the air. ' +
      'Have you ever noticed how a single song can bring back an entire summer? ' +
      "Six thick thistle sticks, a bright yellow jacket, and the number forty-two: that's all I need today.",
  },
  {
    id: 'harbour',
    title: 'The harbour',
    seconds: '≈ 18 seconds',
    text:
      'The harbour was calm when the boats returned, just after seven. ' +
      'Gulls circled overhead, and a fisherman called out, "Who wants the last of the oysters?" ' +
      'Nobody answered at first. Then a child laughed, pointed at the bucket, and quietly said, "Me, please."',
  },
];
