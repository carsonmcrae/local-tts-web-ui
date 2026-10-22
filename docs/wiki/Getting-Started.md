# Getting started

This page takes you from first launch to hearing a document read aloud. It assumes you've installed
the [Windows app](Windows-App) or followed [Installation](Installation) to run TTSNative from source.

## 1. Open the app

In the Windows app, open **TTSNative** from the Start menu. From source, run `npm run dev`, and your
browser opens the app. Either way you start in the **Library**. The sidebar (a bar along the bottom on
phones) has five pages: **Library**, **Voices**, **Voice Studio**, **Exports** and **Settings**. The
Library has two tabs: **My library** and **Explore included books**.

At the bottom of the sidebar, a status line says **Voices ready** once the Kokoro voice model is
installed; the Windows app comes with it. If you see the banner **Install the voice model to start
listening** instead, use its **Install Kokoro** button (it shows the download size) and wait for it to
finish.

## 2. Add a document

Choose whichever suits you:

- **Upload document** and pick a PDF, Word (DOCX), EPUB, Kindle (MOBI), FB2, HTML, Markdown or plain
  text file, up to 25 MB.
- Drag a file anywhere onto the Library page.
- **Paste text**, give it an optional title, and choose **Add to library**.
- **Import a web page** by its address (on the computer running TTSNative).
- Open one of the public-domain books under **Explore included books**.
- In an empty library, **Try a sample** adds an excerpt from "A Scandal in Bohemia" by Arthur Conan
  Doyle.

The text is extracted on your computer; large PDFs and books can take a few seconds. The reader opens
when it's done. See [Reading Documents](Reading-Documents) for formats, limits and the included books.

## 3. Choose a voice

The default reading voice is **Heart**, a US English voice. To change it:

- click the voice button in the player bar at the bottom of the screen and pick from the list, or
- open **Voices**, preview a few, and choose **Use for reading**.

Either way, your choice becomes the default for every document. Pick a voice in the same language as
your document. See [Voices](Voices).

## 4. Press Play

Press **Play** at the top of the reader, the play button in the player bar, or the **Space** key. The
first sentence usually starts about a second later. Sentences are generated just ahead of you and
cached, so even a whole book starts straight away.

To start from somewhere else, click any sentence in the text.

## 5. Follow along

The sentence being spoken is highlighted, and the page scrolls to keep it in view. If you scroll away
yourself, the reader waits a few seconds before bringing the sentence back. You can turn this off with
**Follow along while listening** in **Settings → Playback**.

The player bar stays at the bottom of every page:

| Control                       | What it does                                                         |
| ----------------------------- | -------------------------------------------------------------------- |
| Previous and next sentence    | Step back or forward one sentence                                    |
| Previous and next section     | Jump between chapters, sections or pages (on wider screens)          |
| Position in document (slider) | Move anywhere in the document; shows elapsed and remaining time      |
| Voice                         | Change the reading voice                                             |
| Speed (for example **1×**)    | Playback speed, from 0.75× to 2×                                     |
| Bookmark                      | Bookmark the sentence being read                                     |
| Sleep timer                   | Stop after a set time or at the end of the section                   |
| Export audio                  | Save the narration as a file; see [Exporting Audio](Exporting-Audio) |
| Keyboard shortcuts            | Show the shortcut list (on wide screens)                             |
| Audio mixer                   | Narration volume, and [background music](Background-Music)           |

Where your browser supports it, the lock screen and other system media controls can play, pause and
skip (the track buttons move one sentence back or forward). See also
[Keyboard Shortcuts](Keyboard-Shortcuts).

## 6. Come back later

Your position is saved automatically as you listen. Next time:

- the Library shows a **Continue listening** card with a **Resume** button for the most recent document
  you haven't finished;
- each document in the library shows how much you've heard;
- opening a document returns you to where you stopped, and the reader's button says **Resume**.
  Playback doesn't start until you press it.

## Next steps

- [Reading Documents](Reading-Documents): chapters, scanned PDFs, navigation, speed and pace.
- [Voices](Voices): compare voices on your own passage.
- [Voice Studio](Voice-Studio): create a voice from your own recordings.
- [Exporting Audio](Exporting-Audio): save narration as MP3, WAV, an M4B audiobook or a read-along
  EPUB.
- [What Works Where](What-Works-Where): what you can do in the Windows app, a browser and on a phone.
