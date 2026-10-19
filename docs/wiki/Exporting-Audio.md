# Exporting audio

You can save a document's narration as an audio file to play anywhere. Open the document, then press
**Export audio** (the download icon) in the player bar. The export uses the voice and speaking pace
you're currently listening with.

## Options

| Option         | Choices                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| Format         | **MP3**: smaller files that play everywhere. **WAV**: lossless, larger files.                                   |
| Files          | **Single file**: one continuous file. **One file per chapter**: a ZIP with one file per chapter and a playlist. |
| What to export | **Whole document**, **Current section only**, or **A range of sections** (choose **From** and **To**).          |

The format starts with your choice in **Settings → Playback → Export format**, which is MP3 unless
you change it.

## Running an export

Press **Start export**. A progress bar shows how many passages have been generated. Exports run at a
lower priority than live playback, so you can keep listening while one runs.

- **Keep running in background** closes the dialog while the export carries on.
- **Cancel** stops it.

When it finishes, the dialog shows **Your audio is ready** with the file name, size and duration, and a
**Download** button.

How long an export takes depends on your computer. On the machine used for the
[performance measurements](https://github.com/carsonmcrae/local-tts-web-ui/blob/main/docs/guides/performance.md),
Kokoro generated speech about five times faster than real time.

## File names

| Layout               | You get                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Single file          | One file named after the document, for example `My Book.mp3`                                                         |
| One file per chapter | `My Book (MP3 chapters).zip`, containing `01 - Chapter title.mp3`, `02 - …` and so on, plus a `My Book.m3u` playlist |

## Where exports go

**Download** saves the file wherever your browser saves downloads.

The app also keeps its own copy in `data/exports/`, in one folder per export. **Settings → Storage**
shows how much space these use under **Exports**. There's no button to delete them in the app; delete
the folders yourself when you no longer need them.

## Resuming

If an export is cancelled or fails, the dialog shows **Export stopped** or **Export failed** with a
**Resume** button. Sentences already generated are reused, so resuming carries on quickly rather than
starting again.

This works because every sentence is cached as it's generated. The same cache means that listening to
a document first, or exporting it a second time with the same voice and pace, also saves work, as long
as that audio is still in the cache (see [Settings and Models](Settings-and-Models#storage)).

## Tips

- To make an audiobook, choose **One file per chapter**; the playlist keeps the chapters in order.
- **Current section only** exports the section at the current playback position. To export a
  particular chapter, choose it in **Contents** first.
- Long WAV exports can be large. Check free space in **Settings → Storage** before exporting a whole
  book.
