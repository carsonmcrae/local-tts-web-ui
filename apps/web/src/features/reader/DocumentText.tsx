// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Render one section's text for reading along, with the spoken sentence highlighted.
 * Scope: Groups segments into headings and paragraphs in the reader's chosen size, spacing and
 *   typeface, highlights the active segment (sentence-level timing is exact because each segment is
 *   its own audio clip), marks bookmarked sentences (with an accessible description), starts
 *   playback from any clicked or keyboard-activated sentence (the text is a single tab stop; arrow
 *   keys move between sentences, Enter or Space plays), and keeps the active sentence in view
 *   without fighting a user who scrolls away.
 * Does NOT belong: Section navigation or player controls.
 */
import type { KeyboardEvent } from 'react';
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
  /** The id of the hidden "Bookmarked" text when this sentence is bookmarked. */
  describedBy: string | undefined;
  tabStop: boolean;
  onSelect: (index: number) => void;
  onMove: (index: number, step: number) => void;
}

function Sentence({
  segment,
  active,
  describedBy,
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
      className="reader-seg"
      data-index={segment.index}
      data-active={active}
      data-bookmarked={describedBy !== undefined}
      aria-describedby={describedBy}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(segment.index)}
      onKeyDown={onKeyDown}
    >
      {segment.text}
    </span>
  );
}

interface DocumentTextProps {
  segments: readonly SegmentOut[];
  activeIndex: number | null;
  bookmarked: ReadonlySet<number>;
  autoScroll: boolean;
  onSelect: (index: number) => void;
}

export function DocumentText({
  segments,
  activeIndex,
  bookmarked,
  autoScroll,
  onSelect,
}: Readonly<DocumentTextProps>) {
  const blocks = useMemo(() => toBlocks(segments), [segments]);
  const [readingText] = useReadingText();
  const bookmarkLabel = useId();
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
        const content = block.segments.map((segment, position) => (
          <span key={segment.index}>
            <Sentence
              segment={segment}
              active={segment.index === activeIndex}
              describedBy={bookmarked.has(segment.index) ? bookmarkLabel : undefined}
              tabStop={segment.index === tabStop}
              onSelect={onSelect}
              onMove={focusNeighbour}
            />
            {position < block.segments.length - 1 ? ' ' : null}
          </span>
        ));
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
