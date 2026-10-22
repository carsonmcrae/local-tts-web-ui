// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: The choices for an export: format, which part of the document, files and subtitles.
 * Scope: Format (MP3, WAV, M4B audiobook, read-along EPUB) with a one-line hint each; the chapter
 *   range (whole document, current section or a range in either order); one file or one per
 *   chapter, and sentence-timed subtitles, shown only for the formats they apply to; and turning
 *   the choices into the request's format, layout, range and subtitle fields.
 * Does NOT belong: Starting the export or showing its progress (ExportDialog, ExportStatus).
 */
import type { ExportFormat, ExportRequest, SectionOut } from '@/api/types';
import { Field, Select, Switch } from '@/components/ui/Field';
import { FORMATS, HAS_LAYOUT, HAS_SUBTITLES } from '@/features/exports/exportText';
import { pluralize } from '@/lib/format';

type Range = 'all' | 'current' | 'custom';

export interface ExportChoices {
  format: ExportFormat;
  layout: 'single' | 'chapters';
  captions: boolean;
  range: Range;
  first: number;
  last: number;
}

type Sections = readonly Pick<SectionOut, 'index' | 'title'>[];

function bounds(choices: ExportChoices, currentSection: number): [number | null, number | null] {
  const { range, first, last } = choices;
  if (range === 'current') return [currentSection, currentSection];
  if (range === 'custom') return [Math.min(first, last), Math.max(first, last)];
  return [null, null];
}

/** The request fields these choices produce; layout and subtitles only where they apply. */
export function choicesToRequest(
  choices: ExportChoices,
  currentSection: number,
): Pick<ExportRequest, 'format' | 'layout' | 'captions' | 'firstSection' | 'lastSection'> {
  const { format } = choices;
  const [firstSection, lastSection] = bounds(choices, currentSection);
  return {
    format,
    layout: HAS_LAYOUT.has(format) ? choices.layout : 'single',
    captions: HAS_SUBTITLES.has(format) && choices.captions,
    firstSection,
    lastSection,
  };
}

function SectionSelect({
  label,
  value,
  sections,
  onChange,
}: Readonly<{ label: string; value: number; sections: Sections; onChange: (n: number) => void }>) {
  return (
    <Field label={label}>
      {({ id }) => (
        <Select id={id} value={value} onChange={(event) => onChange(Number(event.target.value))}>
          {sections.map((section) => (
            <option key={section.index} value={section.index}>
              {section.index + 1}. {section.title}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );
}

export function ExportOptions({
  choices,
  onChange,
  sections,
}: Readonly<{
  choices: ExportChoices;
  onChange: (change: Partial<ExportChoices>) => void;
  sections: Sections;
}>) {
  const { format, layout, captions, range } = choices;
  return (
    <div className="flex flex-col gap-5">
      <Field label="Format" hint={FORMATS[format].hint}>
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={format}
            onChange={(event) => onChange({ format: event.target.value as ExportFormat })}
          >
            {(Object.keys(FORMATS) as ExportFormat[]).map((value) => (
              <option key={value} value={value}>
                {FORMATS[value].label}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="What to export">
        {({ id }) => (
          <Select
            id={id}
            value={range}
            onChange={(event) => onChange({ range: event.target.value as Range })}
          >
            <option value="all">Whole document ({pluralize(sections.length, 'section')})</option>
            <option value="current">Current section only</option>
            <option value="custom">A range of sections</option>
          </Select>
        )}
      </Field>
      {range === 'custom' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SectionSelect
            label="From"
            value={choices.first}
            sections={sections}
            onChange={(first) => onChange({ first })}
          />
          <SectionSelect
            label="To"
            value={choices.last}
            sections={sections}
            onChange={(last) => onChange({ last })}
          />
        </div>
      ) : null}
      {HAS_LAYOUT.has(format) ? (
        <Field
          label="Files"
          hint={
            layout === 'chapters'
              ? 'A ZIP with one file per chapter and a playlist.'
              : 'One continuous file.'
          }
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={layout}
              onChange={(event) =>
                onChange({ layout: event.target.value as ExportChoices['layout'] })
              }
            >
              <option value="single">Single file</option>
              <option value="chapters">One file per chapter</option>
            </Select>
          )}
        </Field>
      ) : null}
      {HAS_SUBTITLES.has(format) ? (
        <Switch
          checked={captions}
          onCheckedChange={(value) => onChange({ captions: value })}
          label="Subtitles"
          description="Adds a sentence-timed subtitle file (SRT) next to the audio, for video editors and players that show captions."
        />
      ) : null}
    </div>
  );
}
