# Reading documents

## Supported formats

| Format       | Extensions         | How it's read                                                                                                 |
| ------------ | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| PDF          | `.pdf`             | Text PDFs. Running headers, footers and page numbers are removed, and lines are joined back into paragraphs.  |
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
- **Click a sentence** to play from there.
- **Player bar.** Previous and next sentence, previous and next section, and the position slider.
- **Keyboard.** See [Keyboard Shortcuts](Keyboard-Shortcuts).

While narration plays, the reader follows it into the next section.

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

## Reading text

Settings → Appearance changes how the text looks on this device: **Text size** (Small to Extra
large), **Line spacing** (Compact, Normal, Relaxed) and **Typeface** (Serif or Sans serif), with a
preview.

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
