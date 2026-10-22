// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Render one section's text for reading along, with the spoken sentence highlighted.
 * Scope: Groups segments into headings and paragraphs in the reader's chosen size, spacing and
 *   typeface, highlights the active segment (sentence-level timing is exact because each segment is
 *   its own audio clip), marks bookmarked sentences, sentences with their own voice or effect and
 *   sentences that carry a sound effect (each with an accessible description) and shows skipped
 *   ones muted and labelled "skipped" (in their accessible name too), starts
 *   playback from any clicked or keyboard-activated sentence (the text is a single tab stop; arrow
 *   keys move between sentences, Enter or Space plays), and keeps the active sentence in view
 *   without fighting a user who scrolls away.
 * Does NOT belong: Section navigation or player controls.
 */
import type { KeyboardEvent, ReactNode } from 'react';
import { useEffect, useId, useMemo, useRef } from 'react';
import type { SegmentOut } from '@/api/types';
import { readingTextStyle, useReadingText } from '@/lib/readingText';

interface Block {
  key: number;
  kind: 'heading' | 'paragraph';
  segments: SegmentOut[];
}

export function toBlocks(segments: readonly SegmentOut[]): Block[] {
  const blocks: Block[] = [];
  for (const segment of segments) {
    const last = blocks.at(-1);
    if (last?.key === segment.paragraphIndex) last.segments.push(segment);
    else blocks.push({ key: segment.paragraphIndex, kind: segment.kind, segments: [segment] });
  }
  return blocks;
}

/** What follows a sentence that isn't the last in its block: a line break where the text had one. */
const separator = (segment: SegmentOut): ReactNode => (segment.boundary === 'line' ? <br /> : ' ');

/** Arrow keys move focus between sentences (reading order); Enter and Space play from one. */
const MOVES: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

interface SentenceProps {
  segment: SegmentOut;
  active: boolean;
  bookmarked: boolean;
  /** "Sound effect: …" when a sound effect is placed on this sentence. */
  effect: string | undefined;
  /** The ids of the hidden texts describing it: "Bookmarked", its voice or effect, and its sound effect. */
  describedBy: string | undefined;
  /** How the sentence is styled ("Read by Sam · Telephone call"), when it is. */
  styled: string | undefined;
  /** Left out when reading aloud. */
  skipped: boolean;
  tabStop: boolean;
  onSelect: (index: number) => void;
  onMove: (index: number, step: number) => void;
}

function Sentence({
  segment,
  active,
  bookmarked,
  effect,
  describedBy,
  styled,
  skipped,
  tabStop,
  onSelect,
  onMove,
}: Readonly<SentenceProps>) {
  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(segment.index);
      return;
    }
    const step = MOVES[event.key];
    if (step === undefined) return;
    event.preventDefault();
    onMove(segment.index, step);
  };
  return (
    // A <button> always renders as an inline-block box, so a long sentence would no longer wrap
    // with the rest of its paragraph. A span with the button role and keyboard support keeps the
    // text flowing.
    <span // NOSONAR(typescript:S6819): inline sentence control, see the comment above
      role="button"
      tabIndex={tabStop ? 0 : -1}
      className={skipped ? 'reader-seg text-muted' : 'reader-seg'}
      data-index={segment.index}
      data-active={active}
      data-bookmarked={bookmarked}
      data-effect={effect !== undefined}
      data-styled={styled !== undefined}
      data-skipped={skipped}
      title={skipped ? [styled, 'Skipped when reading aloud'].filter(Boolean).join(' · ') : styled}
      aria-describedby={describedBy}
      aria-current={active ? 'true' : undefined}
      // Dragging across text to select it (to give it a voice or effect) mustn't start playback.
      onClick={() => {
        if (document.getSelection()?.isCollapsed !== false) onSelect(segment.index);
      }}
      onKeyDown={onKeyDown}
    >
      {segment.text}
      {skipped ? (
        // Not colour alone: a visible label, also part of the sentence's accessible name.
        <>
          {' '}
          <span className="inline-block rounded-[3px] border border-line px-1 align-[0.12em] font-sans text-[0.62em] leading-snug font-medium tracking-wide uppercase select-none">
            skipped
          </span>
        </>
      ) : null}
    </span>
  );
}

interface DocumentTextProps {
  segments: readonly SegmentOut[];
  activeIndex: number | null;
  bookmarked: ReadonlySet<number>;
  /** Descriptions of the sentences with their own voice or effect, by segment index. */
  styled?: ReadonlyMap<number, string>;
  /** Sentences left out when reading aloud. */
  skipped?: ReadonlySet<number>;
  /** Descriptions of the sentences that carry a sound effect, by segment index. */
  effects?: ReadonlyMap<number, string> | undefined;
  autoScroll: boolean;
  onSelect: (index: number) => void;
}

export function DocumentText({
  segments,
  activeIndex,
  bookmarked,
  styled,
  skipped,
  effects,
  autoScroll,
  onSelect,
}: Readonly<DocumentTextProps>) {
  const blocks = useMemo(() => toBlocks(segments), [segments]);
  const [readingText] = useReadingText();
  const bookmarkLabel = useId();
  const styleLabel = useId();
  const effectLabel = useId();
  const container = useRef<HTMLDivElement>(null);
  const lastUserScroll = useRef(0);

  useEffect(() => {
    const scroller = container.current?.closest('main');
    if (!scroller) return undefined;
    const mark = () => {
      lastUserScroll.current = Date.now();
    };
    scroller.addEventListener('wheel', mark, { passive: true });
    scroller.addEventListener('touchmove', mark, { passive: true });
    return () => {
      scroller.removeEventListener('wheel', mark);
      scroller.removeEventListener('touchmove', mark);
    };
  }, []);

  useEffect(() => {
    if (!autoScroll || activeIndex === null || Date.now() - lastUserScroll.current < 4000) return;
    const element = container.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const margin = window.innerHeight * 0.2;
    if (rect.top < margin || rect.bottom > window.innerHeight - margin * 1.6) {
      const reduce = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      element.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [activeIndex, autoScroll]);

  // The text is one tab stop: the sentence being spoken, or the first one in this section.
  const tabStop = segments.some((segment) => segment.index === activeIndex)
    ? activeIndex
    : segments[0]?.index;
  const focusNeighbour = (index: number, step: number) => {
    const target = segments[segments.findIndex((segment) => segment.index === index) + step];
    if (!target) return;
    container.current?.querySelector<HTMLElement>(`[data-index="${target.index}"]`)?.focus();
  };

  return (
    <div
      ref={container}
      className="reader-text mx-auto"
      style={readingTextStyle(readingText)}
      data-typeface={readingText.typeface}
    >
      <span id={bookmarkLabel} hidden>
        Bookmarked
      </span>
      {blocks.map((block) => {
        const content = block.segments.map((segment, position) => {
          const style = styled?.get(segment.index);
          const effect = effects?.get(segment.index);
          const described = [
            bookmarked.has(segment.index) ? bookmarkLabel : '',
            style ? `${styleLabel}-${segment.index}` : '',
            effect ? `${effectLabel}-${segment.index}` : '',
          ].filter(Boolean);
          return (
            <span key={segment.index}>
              {style ? (
                <span id={`${styleLabel}-${segment.index}`} hidden>
                  {style}
                </span>
              ) : null}
              {effect ? (
                <span id={`${effectLabel}-${segment.index}`} hidden>
                  {effect}
                </span>
              ) : null}
              <Sentence
                segment={segment}
                active={segment.index === activeIndex}
                bookmarked={bookmarked.has(segment.index)}
                effect={effect}
                describedBy={described.length ? described.join(' ') : undefined}
                styled={style}
                skipped={skipped?.has(segment.index) ?? false}
                tabStop={segment.index === tabStop}
                onSelect={onSelect}
                onMove={focusNeighbour}
              />
              {position < block.segments.length - 1 ? separator(segment) : null}
            </span>
          );
        });
        return block.kind === 'heading' ? (
          <h2
            key={block.key}
            className="mt-10 mb-4 font-sans text-[1.35em] leading-snug font-semibold tracking-tight first:mt-0"
          >
            {content}
          </h2>
        ) : (
          <p key={block.key} className="mb-[1.1em]">
            {content}
          </p>
        );
      })}
    </div>
  );
}
