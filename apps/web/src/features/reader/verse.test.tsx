// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for verse in the reader: a sentence with the `line` boundary ends its line.
 * Scope: Two verse lines in one paragraph are drawn in one <p> with a line break between them, while
 *   sentences with other boundaries are joined by a space.
 * Does NOT belong: Paragraph grouping (src/test/screens.test.tsx) or playback.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SegmentOut } from '@/api/types';
import { DocumentText } from './DocumentText';

const segment = (index: number, boundary: SegmentOut['boundary'], text: string): SegmentOut => ({
  index,
  sectionIndex: 0,
  paragraphIndex: 0,
  kind: 'paragraph',
  boundary,
  text,
});

describe('Verse in the reader', () => {
  it('breaks the line after a sentence that ends a verse line', () => {
    const { container } = render(
      <DocumentText
        segments={[
          segment(0, 'line', 'Once upon a midnight dreary,'),
          segment(1, 'sentence', 'Over many a quaint volume.'),
          segment(2, 'paragraph', 'Only this and nothing more.'),
        ]}
        activeIndex={null}
        bookmarked={new Set()}
        autoScroll={false}
        onSelect={vi.fn()}
      />,
    );
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.querySelectorAll('br')).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe(
      'Once upon a midnight dreary,Over many a quaint volume. Only this and nothing more.',
    );
  });
});
