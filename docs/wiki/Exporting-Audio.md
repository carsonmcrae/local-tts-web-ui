# Exporting audio

You can save a document's narration to play anywhere: as an audio file, an M4B audiobook with
chapters, or a read-along EPUB. Open the document, then press **Export audio** (the download icon) in
the player bar. The export uses the voice and speaking pace you're currently listening with, and every
character voice, effect, pause and pronunciation you've set, so it sounds exactly like playback.

## Formats

| Format              | What you get                                                                                                                                             |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MP3**             | Smaller files that play everywhere.                                                                                                                      |
| **WAV**             | Lossless, larger files.                                                                                                                                  |
| **M4B audiobook**   | One file with chapters, the title, author, narrator, description and cover, for audiobook apps. Needs ffmpeg (see below).                                |
| **Read-along EPUB** | An EPUB 3 book with the audio inside: readers that support read-aloud (Media Overlays), such as Thorium Reader, can highlight each sentence as it plays. |

## Options

| Option         | Choices                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| Files          | MP3 and WAV: **Single file**, or **One file per chapter** (a ZIP with one file per chapter and a playlist). |
| What to export | **Whole document**, **Current section only**, or **A range of sections** (choose **From** and **To**).      |
| Subtitles      | MP3, WAV and M4B: adds a sentence-timed subtitle file (SRT). The download is then a ZIP with both.          |

**Audiobook details** (closed at first) holds the **author**, **narrator**, **description** and a
**cover** (a JPEG or PNG up to 5 MB). They're saved with the document and used by M4B, EPUB and
Audiobookshelf.

The format starts with your choice in **Settings → Playback → Export format**, which is MP3 unless you
change it.

## Running, pausing and resuming

Press **Start export**. A progress bar shows how many sentences are done. Exports run at a lower
priority than live playback, so you can keep listening while one runs.

- **Pause** stops after the current sentence and keeps everything made so far. **Resume** carries on
  with only the missing sentences.
- An export interrupted by closing the app, a crash or a restart is listed as **Interrupted**, with
  **Resume**.
- If a sentence fails, the export stops as **Failed**, keeping what was made, and **Resume** tries again.
- If you change a sentence while an export is paused (another voice, an effect, a pronunciation), that
  sentence is made again when you resume.
- Skipped sentences (page furniture the [cleanup](Reading-Documents#headers-page-numbers-and-footnote-markers)
  found, or ones you skip) are left out, just as playback leaves them out.
- **Cancel export** (it asks first) stops and discards the sentences made so far. Everything it made is
  removed as soon as it stops.

The **Exports** page (in the navigation) lists every export: the ones ready to resume first, then those
in progress, then earlier ones, with **Download**, **Send to Audiobookshelf** and **Delete file**.

## One at a time, and a short queue

One export is made at a time. Start more and they wait their turn, in order: their card says
**Waiting**, its place in line (**Next in line**, **2nd in line**) and how many exports are ahead.
Up to four can wait. With one being made and four waiting, the queue is full: a new export, or a
**Resume**, is refused with a note saying so, and the Exports page explains why. To make room, wait
for one to finish, or pause or cancel one (a waiting export stops at once). These limits are the same
for everyone using the app, this computer and paired phones and tablets alike.

Building or fine-tuning a studio voice uses the same engine. Only one of those runs at a time, and an
export can run beside it, more slowly. The Exports page says so while that happens.

## Disk space

Before an export starts or resumes, TTSNative estimates the space it needs: the sentences it saves
along the way plus the finished files. It refuses the export if that would leave less than the space
it always keeps free (500 MB unless you change `LTTS_MIN_FREE_DISK_MB`), counting what the waiting
exports still need too. The Exports page warns when the disk is nearly full. While an export runs it
checks again every few sentences. If space runs out it stops as **Failed** with a note, keeping what it
made: free up space, then press **Resume**. WAV and M4B need the most room. MP3, or fewer chapters,
need less.

## After a crash, and exports left unfinished

When TTSNative starts after a crash or a forced close, exports that were running are marked
**Interrupted**. Their saved sentences are kept for **Resume**. Half-built files and temporary files
are removed, and so is anything left by canceled exports.

Stopped exports are never deleted for you, however long they wait. An export left for two weeks or more
shows a reminder of the space its saved sentences use, so you can resume it or cancel it to free the
space.

## M4B and ffmpeg

TTSNative builds M4B files with **ffmpeg**, a free program you install yourself; the app never
downloads it. If it's missing, an M4B export stops with a note saying so (the sentences made so far
are kept), and you can resume after installing it.

- **Windows:** `winget install Gyan.FFmpeg`, then restart TTSNative.
- **macOS:** `brew install ffmpeg`.
- **Linux:** your distribution's `ffmpeg` package.

The app looks for `ffmpeg` on your `PATH`, or at the path in the `LTTS_FFMPEG` environment variable.
Or export MP3 instead.

## Send to Audiobookshelf

If you run an [Audiobookshelf](https://www.audiobookshelf.org/) server, set it up once in **Settings →
Audiobookshelf**: its address, an API key, then **Test connection** (nothing is saved until you press
**Save**) and choose the library and folder. A finished single-file M4B, MP3 or WAV export then shows
**Send to Audiobookshelf**, which uploads it with its title, author and cover to that folder. The key is
stored on this computer (encrypted on Windows) and is never shown again; **Forget** removes it. Files go
only to the server you set.

## File names

| Layout               | You get                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Single file          | One file named after the document, for example `My Book.mp3`, `My Book.m4b` or `My Book.epub`                        |
| One file per chapter | `My Book (MP3 chapters).zip`, containing `01 - Chapter title.mp3`, `02 - …` and so on, plus a `My Book.m3u` playlist |

Each audio file is tagged with a title (the chapter, or the document), the document as the album, a
track number for chapter files, and a comment naming the app it was made with.

## Where exports go

**Download** saves the file wherever your browser saves downloads. The app also keeps its own copy in
`data/exports/`, one folder per export; **Settings → Storage** shows how much space they use. **Delete
file** on the Exports page removes an export and its folder.

## Tips

- For an audiobook app, choose **M4B audiobook**; for a plain player, **MP3** with **One file per
  chapter** keeps the chapters in order.
- **Current section only** exports the section at the current playback position. To export a
  particular chapter, choose it in **Contents** first.
- Long WAV exports can be large. Check free space in **Settings → Storage** before exporting a whole
  book.
