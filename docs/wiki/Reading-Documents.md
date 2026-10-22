# Reading documents

## Supported formats

| Format       | Extensions         | How it's read                                                                                                 |
| ------------ | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| PDF          | `.pdf`             | Text PDFs. Lines are joined back into paragraphs; running headers, page numbers and footnotes are skipped.    |
| Word         | `.docx`            | Paragraphs and tables in document order; tables are read row by row. Macros and embedded objects are ignored. |
| EPUB 2 and 3 | `.epub`            | The book's files in reading order. Scripts and styles are ignored.                                            |
| Markdown     | `.md`, `.markdown` | Links are read as their text and images as their alt text. Code blocks are skipped with a short spoken note.  |
| Plain text   | `.txt`             | UTF-8, UTF-16 and Windows-1252 text.                                                                          |
| Pasted text  | none               | Treated like plain text.                                                                                      |

A file's contents must match its extension: a text file renamed to `.pdf`, for example, is refused.
Password-protected PDFs are refused too; remove the password and upload the file again.

TTSNative doesn't keep the uploaded file. It extracts the text on your computer, stores that in its
library, and deletes the upload.

## Limits

| Limit                    | Default                                    | Environment variable        |
| ------------------------ | ------------------------------------------ | --------------------------- |
| File size                | 25 MB                                      | `LTTS_MAX_UPLOAD_MB`        |
| Extracted text           | 2,000,000 characters (about 330,000 words) | `LTTS_MAX_TEXT_CHARS`       |
| PDF pages                | 2,000                                      | `LTTS_MAX_PDF_PAGES`        |
| Documents in the library | 500                                        | `LTTS_MAX_DOCUMENTS`        |
| Time to process a file   | 90 seconds                                 | `LTTS_EXTRACTION_TIMEOUT_S` |

The server enforces these limits; see [Settings and Models](Settings-and-Models#configuration) for how
to change them. The web app also checks for 25 MB itself before uploading, so a higher
`LTTS_MAX_UPLOAD_MB` doesn't currently let larger files through the upload button.

Text-based books are small: a 400-page novel PDF is typically 1–5 MB. Files over 25 MB are almost
always scanned images or image-heavy layouts.

## Chapters, sections and pages

Each document is split into sections, which appear in the **Contents** list.

| Format            | Where sections come from                                                                                                                                                                                                                                                      |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PDF               | The PDF's outline (bookmarks), when it has at least two top-level entries. Each chapter starts at its heading line, even partway down a page. Pages before the first entry become "Opening pages". Without an outline, each page is a section ("Page 1", "Page 2" and so on). |
| DOCX              | Paragraphs styled Title, Heading 1 or Heading 2. Deeper headings are read as headings inside a section.                                                                                                                                                                       |
| EPUB              | Each file in the book's reading order, named from the table of contents (or its first heading).                                                                                                                                                                               |
| Markdown          | `#` and `##` headings. Deeper headings are read as headings inside a section.                                                                                                                                                                                                 |
| Text, pasted text | Short lines on their own that start with Chapter, Part, Book, Section, Prologue or Epilogue (such as "Chapter 3" or "Part Two"), or a Roman numeral on its own, such as "IV".                                                                                                 |

Within each section, the text is split into sentences (very long sentences are split into shorter
parts). Each one is generated, played and highlighted on its own, which is why the highlight always
matches what you hear.

### Fixing a chapter

If a chapter starts in the wrong place, for example with the last lines of the previous chapter, or
has the wrong name, press **Adjust this section** above the text.

- **Title** renames the section.
- **Starts at** lists the end of the previous section and the start of this one. Pick the sentence
  the section should start with; the previous section then ends just before it. The first section
  always starts at the beginning of the document.

The change is saved with the document, and the player and the longer pause between chapters follow
it at once. Documents added before chapter detection improved can be fixed this way without
uploading them again.

## Scanned PDFs

TTSNative reads the text layer of a PDF. It doesn't support OCR (reading text from images) yet.

- If no page has text, the PDF is refused with a message that it has no text layer and looks like
  scanned images.
- If only some pages have no text, the rest is added and a warning at the top of the reader says how
  many pages were skipped.

To listen to a scanned PDF, export the text from the original document, or run OCR on it with another
tool first.

## Headers, page numbers and footnote markers

Printed pages repeat things that sound wrong read aloud. When a document is added, TTSNative looks
for them and skips them when reading. Nothing is deleted, and you can undo it.

- **Running headers and footers** (PDFs): a line at the top or bottom of the page that repeats on at
  least 40% of the pages, and on three pages or more, such as the book's title or
  "The Silent Harbour 57". The numbers in it don't matter.
- **Page numbers**: "12", "Page 12", "12 of 300", "- 12 -" or Roman numerals at the top or bottom of
  a PDF page, when they count along with the pages. In other formats, paragraphs that only say
  "Page 12", "12 of 300" or "- 12 -", when at least three of them count up through the document.
- **Footnotes** (PDFs): the lines a page ends with when they're set in noticeably smaller type than
  the text, sit below all of it, and start with a number or symbol ("1", "12.", "\*", "†") that marks a
  word on the same page ("ended.1", "war¹"). Each note is kept as a paragraph of its own after the
  page's text. A note continued from the previous page, or set in the text's own size, is read.
- **Footnote markers**: a superscript number after a word ("war¹") isn't spoken, though the word is.
  A number glued after punctuation ("ended.12") is left out only when the document has a Notes
  section, or a PDF footnote, holding that note.
- **Citation markers**: numbers in brackets after a word or a punctuation mark, such as "[12]",
  "[3, 4]", "[5–7]" or "[12, 15–17]", followed by a space, punctuation or the end of the sentence. The
  document must have a References or Bibliography section, or at least three of them.

It errs on the side of reading: PDFs of fewer than three pages get no header or page-number finds,
and years, measurements (20 m², 3.5 kg), decimals, list numbers, chapter numbers, chapter titles from
the PDF's outline, verse numbers and a heading that appears on a couple of pages are kept. Brackets
in code and mathematics are always read: `array[3]`, `x[i+1]`, `matrix[2][3]`, `list[-1]`, an
interval such as [0, 1], "returns [3]", a reference list's own "[1] Smith", and any sentence with
operators such as `=` or `+` in it, where superscripts aren't footnote markers either (a² + b² = c²).

Skipped sentences stay in the text, greyed out and labelled **skipped**. Playback and exports both
leave them out, and footnote and citation markers stay in the text too: only what's spoken changes. A
note at the top of the reader says what was skipped. Open it (**Review**) to see everything by reason
and choose any sentence to show it in the text, press **Read them all again** to undo the cleanup, or
**Skip them again** to put it back.

To skip any sentence yourself, select it, choose **Voice & effect** and press **Skip when reading**.
**Read this sentence** brings back a skipped one, including one the cleanup skipped. Sentences you
skip yourself stay skipped when you undo the cleanup.

The listening time on library cards and in the reader counts only what is read aloud, and changes as
soon as you skip a sentence, read one again or undo the cleanup.

Documents added before this version aren't searched again. Numbers in brackets such as "[12]" are now
read aloud in them (they used to be dropped, and array indexes with them); add a document again to
have its citation markers and footnotes found.

## Pasting text

**Paste text** in the Library opens a dialog with an optional **Title** and a **Text** box that counts
characters. **Add to library** saves it like any other document. Blank lines separate paragraphs; text
without blank lines is read one paragraph per line. Pasted text is stored only on your computer.

## Getting around

- **Contents.** On wide screens, the list of sections sits beside the text. On narrower screens, use
  the **Contents** button next to Play. A speaker icon marks the section being read. Choosing a
  section shows it and moves the playback position to its start.
- **Section pager.** The line above the text shows "Section N of M", with **Adjust this section**
  beside it (see [Fixing a chapter](#fixing-a-chapter)); the buttons below the text go to the
  previous and next section.
- **Click a sentence** to play from there (selecting text doesn't start playback).
- **Player bar.** Previous and next sentence, previous and next section, and the position slider.
- **Keyboard.** See [Keyboard Shortcuts](Keyboard-Shortcuts).

While narration plays, the reader follows it into the next section.

## Voices and effects

Give characters their own voices, and announcements, calls or broadcasts the sound they'd have:

- **Select any text** in the document and choose **Voice & effect** beside it. For the sentences you
  selected, pick a **Voice** (any built-in voice, for example a British or American accent, or one of
  your custom voices), an **Effect** (**Loudspeaker announcement**, **Telephone call**, **Radio**,
  **Large hall**, **Far away** or **Robot**) and, for custom voices, a **Sound before it** (a laugh,
  a sigh, a gasp…; experimental). When the sentences differ, **Keep as they are** leaves that choice
  alone. **Clear styling** returns them to the reading voice.
- **Voices & effects** (above the text) chooses a **Dialogue voice** that reads every sentence with
  quoted speech, styles the sentence being read (handy on a phone or with the keyboard), and clears
  all styling.

Styled sentences are underlined with a soft tint; hover over one, or use a screen reader, to hear
how it's styled. A sentence's own voice comes first, then the dialogue voice for quoted speech, then
your reading voice. Exports sound the same as playback. A whole sentence is styled, so in
`"Run!" she shouted.` the narration is read in the dialogue voice too. Deleting a custom voice hands
its sentences back to the reading voice.

## Fixing a word's pronunciation

When a voice says a name or word wrongly, select it in the text and choose **Fix pronunciation**
(offered for a word or a phrase of up to six words). In the dialog:

- **Say it as**: write the word the way it sounds. No phonetic symbols are needed: gnocchi →
  NYOH-kee, quinoa → KEEN-wah, Nguyen → Win. Join syllables with hyphens and put the stressed one in
  capitals; the voice reads it as one word and never spells the capitals out letter by letter. To
  have letters spelled, separate them with spaces (U S A).
- **Hear as written** and **Hear respelling** play the word and your respelling side by side in your
  reading voice, before anything is saved. The word is played exactly as written, ignoring any saved
  pronunciation.
- **Use it in**: **This document** (the default) or **All documents**. A word saved for this document
  wins over the one for all documents, here only. Saving for all documents replaces this document's
  own pronunciation of the word, so it says it the new way too.

If the word already has a pronunciation, the dialog starts from it. The text itself never changes,
only what is spoken: playback and exports both use the fix, and only the sentences containing the
word are generated again. A document's pronunciations are deleted with it. Every pronunciation is
listed, and can be changed, in [Settings → Pronunciation](Settings-and-Models#pronunciation).

## How English voices read numbers, money and abbreviations

Before an English voice speaks a sentence, a few things are rewritten the way a narrator would read
them, whichever engine the voice uses. Each rule applies only where the meaning is clear; anything
ambiguous is read as before.

- **Money**: £1,284.50 is "1,284 pounds 50", $1 is "1 dollar", €0.99 is "99 cents", $3bn is
  "3 billion dollars". Ranges ($5-10), other formats (€1.234,56) and ¥ are left alone.
- **Clock times**: after words such as "at", "from", "until" or "opens", or before AM or PM: 4:45 p.m.
  is "4 45 PM", 9:00 is "9 o'clock", 4:05 is "4 oh 5". Ratios (1:25), Bible verses (John 3:16), race
  times and scores are left alone.
- **Phone and account numbers**: read digit by digit, with a short pause between groups, when they
  start with + or 0 (020 7946 0321), follow the US pattern (555-123-4567), or follow a word such as
  "call", "account", "order" or "ISBN". Lists of numbers, scores and dates are left alone.
- **Years**: after words such as "in", "since", "before" or a month, when the next word shows it is a
  year: "in 1998 the firm" is "in nineteen ninety-eight the firm", but "in 1500 copies" stays a number.
  The 1980s are "the nineteen eighties", and citations such as (Smith, 1998) read the year.
- **Chapter numbers**: Chapter IV is "Chapter 4", and World War II is "World War 2". Lettered parts
  and appendices (Part C, Appendix I) are left alone.
- **Abbreviations**: Mr., Mrs., Ms., Prof., Lt., Col., Rev., Gen. and similar titles before a name;
  Dr. and St. as Doctor and Saint before a name, Drive and Street after a street name; Mt., Rd., Ave.,
  approx., dept., No. 5, e.g., i.e., vs., ft., lb., oz. and °C. "no." used as a word stays a word.
- **Code and formulas**: a sentence that looks like code or a formula (with =, <, >, braces, paths or
  function calls) is read exactly as before.

The text you see never changes, only what is spoken: highlighting, search, word counts and the
subtitles in an export all use the written text. Playback, exports, previews and the local speech API
all say the same thing. These rules apply to English voices only, and a pronunciation you save for a
word wins over them.

## Searching a document

Press the magnifying glass next to Play (**Search this document**) and type a word, name or phrase.
Results appear as you type, in reading order, each with its section and the words found marked. Case
and extra spaces don't matter. Choosing a result shows that sentence and moves the playback position
to it. The first 200 matches are listed, with the total count above them.

## Bookmarks and notes

- **Bookmark a sentence** while listening with the bookmark button in the player bar or the `B` key;
  press it again to remove the bookmark. Bookmarked sentences have a dotted underline in the text.
- **The Bookmarks tab**, next to **Contents** in the side panel (or in the **Contents** dialog on
  smaller screens), lists them in reading order. Choose one to jump back to it.
- **Notes.** **Add a note** (or **Edit note**) keeps up to 2,000 characters with a bookmark.
- **Export notes** saves every bookmark and note as a Markdown file, grouped by section.

Bookmarks are stored with the document on your computer, are deleted with it, and stay on the right
sentence when you [fix a chapter](#fixing-a-chapter).

## Sleep timer

The moon button in the player bar stops playback after 5, 10, 15, 30, 45 or 60 minutes, or at the end
of the section being read. While a timer runs, the button shows the minutes left (or "End of
section"). Playback always stops between sentences, ready to carry on from the next one; **Off**
cancels the timer.

## Background music and the audio mixer

The sliders button in the player bar opens the audio mixer: the narration's volume and, beneath it,
background music that plays quietly under the narration once you turn it on. See
[Background Music and the Audio Mixer](Background-Music).

## Reading text

Settings → Appearance changes how the text looks on this device: **Text size** (Small to Extra
large), **Line spacing** (Compact, Normal, Relaxed), **Typeface** (Serif or Sans serif) and **Letter
and word spacing** (Normal or Wider, which many readers with dyslexia find easier), with a preview.
**Contrast → High** darkens text and lines and outlines the sentence being read; it also turns on by
itself when your system asks for more contrast. In Windows high-contrast themes the app uses your
theme's colours, and the sentence being read keeps a visible highlight.

## Resume

Your position in each document is saved automatically as you listen. Library cards show how much
you've heard ("New" if you haven't started), and the **Continue listening** card offers **Resume** for
your most recent unfinished document. Opening a document puts you back where you stopped; press
**Resume** to carry on.

## Playback speed and speaking pace

TTSNative has two ways to change how fast you hear the text:

|                 | Playback speed                                                   | Speaking pace                          |
| --------------- | ---------------------------------------------------------------- | -------------------------------------- |
| What it changes | How fast the audio plays; pitch is preserved                     | How quickly the voice itself speaks    |
| Range           | 0.75×, 0.9×, 1×, 1.1×, 1.25×, 1.5×, 1.75×, 2×                    | 0.70× to 1.40×, in steps of 0.05       |
| Where           | Speed button in the player bar, `[` and `]`, Settings → Playback | Settings → Playback                    |
| Applies to      | Every voice                                                      | Kokoro voices                          |
| When it applies | Immediately                                                      | New audio is generated at the new pace |

## Your library

With more than one document, the Library has a search box (titles and file names) and a **Sort by**
menu: **Last read or added** (the default), **Title**, **Date added** or **Least listened**. The
sort is remembered on this device.

## Deleting a document

Use the bin icon on a document's card in the Library and confirm. The document, its reading
progress and its bookmarks are permanently removed from your computer.
