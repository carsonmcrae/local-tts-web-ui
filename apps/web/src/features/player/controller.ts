/**
 * Purpose: Framework-free playback engine for continuous, progressive document narration.
 * Scope: Plays one segment (sentence) at a time through a single audio element, prefetches the next
 *   few segments at lower server priority, aborts work that's no longer needed, advances
 *   automatically, applies voice/pace/rate changes, and persists reading progress. Every async
 *   step is guarded by a generation counter so rapid skipping can never play stale audio.
 * Does NOT belong: React bindings (PlayerProvider) or UI.
 */

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error';

export interface PlayerDocument {
  id: string;
  title: string;
  segmentCount: number;
  estimatedSeconds: number;
  sections: readonly { index: number; title: string; startSegment: number; segmentCount: number }[];
}

export interface PlayerError {
  code: string;
  message: string;
}

export interface PlayerState {
  document: PlayerDocument | null;
  segmentIndex: number;
  status: PlayerStatus;
  error: PlayerError | null;
  voiceId: string;
  rate: number;
  pace: number;
  currentTime: number;
  duration: number;
}

export interface SegmentAudio {
  url: string;
  duration: number;
}

export interface MediaLike {
  src: string;
  currentTime: number;
  playbackRate: number;
  preservesPitch?: boolean;
  play(): Promise<void>;
  pause(): void;
  addEventListener(
    type: 'ended' | 'timeupdate' | 'error' | 'pause' | 'play',
    listener: () => void,
  ): void;
}

export interface ControllerDeps {
  media: MediaLike;
  fetchSegment: (
    documentId: string,
    index: number,
    voiceId: string,
    pace: number,
    prefetch: boolean,
    signal: AbortSignal,
  ) => Promise<SegmentAudio>;
  revoke: (url: string) => void;
  saveProgress: (documentId: string, index: number, voiceId: string) => void;
  toError: (error: unknown) => PlayerError;
}

const PREFETCH_AHEAD = 3;
const KEEP_BEHIND = 1;

interface CacheEntry {
  key: string;
  controller: AbortController;
  promise: Promise<SegmentAudio>;
  audio?: SegmentAudio;
}

type Listener = (state: PlayerState) => void;

export class PlaybackController {
  private state: PlayerState;
  private readonly listeners = new Set<Listener>();
  private readonly cache = new Map<number, CacheEntry>();
  private generation = 0;
  /** Cache key of the audio currently loaded into the media element. */
  private loadedKey: string | null = null;

  constructor(
    private readonly deps: ControllerDeps,
    initial: { voiceId: string; rate: number; pace: number },
  ) {
    this.state = {
      document: null,
      segmentIndex: 0,
      status: 'idle',
      error: null,
      currentTime: 0,
      duration: 0,
      ...initial,
    };
    deps.media.addEventListener('ended', () => this.onEnded());
    deps.media.addEventListener('timeupdate', () =>
      this.set({ currentTime: deps.media.currentTime }),
    );
    deps.media.addEventListener('pause', () => {
      if (this.state.status === 'playing') this.set({ status: 'paused' });
    });
    deps.media.addEventListener('play', () => {
      if (this.state.status === 'paused') this.set({ status: 'playing' });
    });
  }

  // -- subscription ----------------------------------------------------------
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(): PlayerState {
    return this.state;
  }

  private set(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  // -- public commands -------------------------------------------------------
  load(document: PlayerDocument, startIndex: number, autoplay: boolean): Promise<void> {
    if (this.state.document?.id !== document.id) this.clearCache();
    this.set({ document, error: null });
    return this.goTo(startIndex, autoplay);
  }

  async play(): Promise<void> {
    const { document, status, segmentIndex } = this.state;
    if (!document) return;
    if (status === 'ended') {
      await this.goTo(0, true);
      return;
    }
    if (status === 'error' || this.loadedKey !== this.key(segmentIndex)) {
      await this.goTo(segmentIndex, true);
      return;
    }
    await this.startMedia(this.generation);
  }

  pause(): void {
    this.deps.media.pause();
    if (this.state.status === 'playing' || this.state.status === 'loading')
      this.set({ status: 'paused' });
    this.persist();
  }

  toggle(): Promise<void> {
    if (this.state.status === 'playing' || this.state.status === 'loading') {
      this.pause();
      return Promise.resolve();
    }
    return this.play();
  }

  next(): Promise<void> {
    return this.goTo(this.state.segmentIndex + 1, this.isActive());
  }

  previous(): Promise<void> {
    // Like music players: restart the sentence unless we're at its very beginning.
    const target =
      this.deps.media.currentTime > 2 ? this.state.segmentIndex : this.state.segmentIndex - 1;
    return this.goTo(target, this.isActive());
  }

  nextSection(): Promise<void> {
    const section = this.sectionAt(this.state.segmentIndex);
    const next = this.state.document?.sections.find((s) => s.index === (section?.index ?? -1) + 1);
    return next ? this.goTo(next.startSegment, this.isActive()) : Promise.resolve();
  }

  previousSection(): Promise<void> {
    const section = this.sectionAt(this.state.segmentIndex);
    if (!section) return Promise.resolve();
    const atStart = this.state.segmentIndex - section.startSegment < 2;
    const target = atStart
      ? this.state.document?.sections.find((s) => s.index === section.index - 1)
      : section;
    return this.goTo(target?.startSegment ?? 0, this.isActive());
  }

  seek(index: number): Promise<void> {
    return this.goTo(index, this.isActive());
  }

  setRate(rate: number): void {
    this.deps.media.playbackRate = rate;
    this.set({ rate });
  }

  setVoice(voiceId: string): Promise<void> {
    if (voiceId === this.state.voiceId) return Promise.resolve();
    this.set({ voiceId });
    return this.restartWithNewAudio();
  }

  setPace(pace: number): Promise<void> {
    if (pace === this.state.pace) return Promise.resolve();
    this.set({ pace });
    return this.restartWithNewAudio();
  }

  unload(): void {
    this.generation += 1;
    this.deps.media.pause();
    this.loadedKey = null;
    this.clearCache();
    this.set({
      document: null,
      status: 'idle',
      segmentIndex: 0,
      error: null,
      currentTime: 0,
      duration: 0,
    });
  }

  sectionAt(index: number) {
    return this.state.document?.sections.find(
      (s) => index >= s.startSegment && index < s.startSegment + s.segmentCount,
    );
  }

  // -- internals ---------------------------------------------------------------
  private isActive(): boolean {
    return this.state.status === 'playing' || this.state.status === 'loading';
  }

  private key(index: number): string {
    return `${index}|${this.state.voiceId}|${this.state.pace}`;
  }

  private restartWithNewAudio(): Promise<void> {
    this.loadedKey = null;
    this.clearCache();
    if (!this.state.document) return Promise.resolve();
    return this.goTo(this.state.segmentIndex, this.isActive());
  }

  private request(index: number, prefetch: boolean): CacheEntry {
    const key = this.key(index);
    const existing = this.cache.get(index);
    if (existing?.key === key) return existing;
    if (existing) this.drop(index);
    const controller = new AbortController();
    const documentId = this.state.document?.id ?? '';
    const entry: CacheEntry = {
      key,
      controller,
      promise: this.deps.fetchSegment(
        documentId,
        index,
        this.state.voiceId,
        this.state.pace,
        prefetch,
        controller.signal,
      ),
    };
    entry.promise.then(
      (audio) => {
        entry.audio = audio;
        if (this.cache.get(index) !== entry) this.deps.revoke(audio.url);
      },
      () => undefined,
    );
    this.cache.set(index, entry);
    return entry;
  }

  private drop(index: number): void {
    const entry = this.cache.get(index);
    if (!entry) return;
    this.cache.delete(index);
    entry.controller.abort();
    if (entry.audio) this.deps.revoke(entry.audio.url);
  }

  private clearCache(): void {
    for (const index of [...this.cache.keys()]) this.drop(index);
  }

  private prefetchAround(index: number): void {
    const count = this.state.document?.segmentCount ?? 0;
    for (const cached of [...this.cache.keys()]) {
      if (cached < index - KEEP_BEHIND || cached > index + PREFETCH_AHEAD) this.drop(cached);
    }
    for (let ahead = 1; ahead <= PREFETCH_AHEAD && index + ahead < count; ahead += 1) {
      this.request(index + ahead, true).promise.catch(() => undefined);
    }
  }

  private async goTo(rawIndex: number, autoplay: boolean): Promise<void> {
    const document = this.state.document;
    if (!document) return;
    const index = Math.min(Math.max(rawIndex, 0), Math.max(document.segmentCount - 1, 0));
    const generation = ++this.generation;
    this.deps.media.pause();
    this.set({
      segmentIndex: index,
      status: autoplay ? 'loading' : 'paused',
      error: null,
      currentTime: 0,
    });
    this.persist();
    this.loadedKey = null;
    if (!autoplay) return;
    const entry = this.request(index, false);
    this.prefetchAround(index);
    try {
      const audio = await entry.promise;
      if (generation !== this.generation) return;
      this.deps.media.src = audio.url;
      this.loadedKey = this.key(index);
      this.deps.media.playbackRate = this.state.rate;
      this.deps.media.preservesPitch = true;
      this.set({ duration: audio.duration });
      await this.startMedia(generation);
    } catch (error) {
      if (
        generation !== this.generation ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        return;
      this.set({ status: 'error', error: this.deps.toError(error) });
    }
  }

  private async startMedia(generation: number): Promise<void> {
    try {
      this.deps.media.playbackRate = this.state.rate;
      await this.deps.media.play();
      if (generation === this.generation) this.set({ status: 'playing' });
    } catch (error) {
      if (generation !== this.generation) return;
      // Browsers reject play() without a user gesture; stay ready instead of erroring.
      if (error instanceof DOMException && error.name === 'NotAllowedError')
        this.set({ status: 'paused' });
      else if (!(error instanceof DOMException && error.name === 'AbortError')) {
        this.set({ status: 'error', error: this.deps.toError(error) });
      }
    }
  }

  private onEnded(): void {
    const document = this.state.document;
    if (!document) return;
    if (this.state.segmentIndex + 1 >= document.segmentCount) {
      this.set({ status: 'ended' });
      this.persist();
      return;
    }
    void this.goTo(this.state.segmentIndex + 1, true);
  }

  private persist(): void {
    const { document, segmentIndex, voiceId } = this.state;
    if (document) this.deps.saveProgress(document.id, segmentIndex, voiceId);
  }
}
