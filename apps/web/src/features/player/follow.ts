// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Let a companion of the narration (background music, sound effects) follow the player.
 * Scope: The player as its companions see it (its state, and a subscription to changes), and
 *   attaching a follower that is let go together with its own cleanup.
 * Does NOT belong: The player itself (controller.ts) or what a follower does with the state.
 */
import type { PlayerState } from './controller';

export interface PlayerSource {
  getState(): PlayerState;
  subscribe(listener: (state: PlayerState) => void): () => void;
}

/** Follow the player; the returned function stops following and then runs `cleanup`. */
export function followPlayer(
  player: PlayerSource,
  follow: (state: PlayerState) => void,
  cleanup: () => void,
): () => void {
  const unsubscribe = player.subscribe(follow);
  return () => {
    unsubscribe();
    cleanup();
  };
}
