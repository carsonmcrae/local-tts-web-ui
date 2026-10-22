# What works where

TTSNative is one app that you can reach in several ways:

- **Windows app**: the installed app on a Windows 11 computer (from version 2.1.0, not published yet).
- **Browser on the computer**: the app in a browser on the computer running TTSNative, at
  `http://127.0.0.1:…` (how you use it from source).
- **Phone or tablet**: a phone or tablet's browser on your home network, paired in LAN mode (see
  [Other Devices](Other-Devices)). The computer does all the work, so it must be on, with TTSNative
  running and LAN mode on.
- **Website**: [ttsnative.com](https://ttsnative.com), which describes TTSNative and offers the
  download. It doesn't run TTSNative.

The Windows app and the browser on the computer run the same web app from the same local server, so
they work the same, apart from a few things that belong to the Windows app itself. A phone or tablet
uses the same server too, but some things stay on the computer on purpose. The server enforces those
limits, and the app says so on the phone (for example, **Do this on the computer running TTSNative.**)

✓ works · ✗ not available there (the reason is below the table) · – doesn't apply

## Reading and the library

| Feature                                                                  | Windows app | Browser on the computer | Phone or tablet | Website |
| ------------------------------------------------------------------------ | ----------- | ----------------------- | --------------- | ------- |
| Read and listen, with the sentence highlighted                           | ✓           | ✓                       | ✓               | –       |
| Upload, drop or paste a document                                         | ✓           | ✓                       | ✓ (1)           | –       |
| Import a web page by its address                                         | ✓           | ✓                       | ✗ (2)           | –       |
| Open or hide the included books (Explore)                                | ✓           | ✓                       | ✓ (1)           | –       |
| Organise the library: folders, collections, favourites, genres, tags     | ✓           | ✓                       | ✓               | –       |
| Delete a document                                                        | ✓           | ✓                       | ✗ (3)           | –       |
| Bookmarks and notes, search, sleep timer, chapter fixes                  | ✓           | ✓                       | ✓               | –       |
| Characters, dialogue voice, saved casts, effects and reading experiences | ✓           | ✓                       | ✓ (1)           | –       |
| Remove a saved cast                                                      | ✓           | ✓                       | ✗ (3)           | –       |
| Sound effects: suggestions, adding and adjusting                         | ✓           | ✓                       | ✓               | –       |
| Background music and the audio mixer (plays on the device you're using)  | ✓           | ✓                       | ✓               | –       |
| Pronunciation rules: add, change, remove                                 | ✓           | ✓                       | ✓               | –       |
| Pronunciation: hear a word before saving the rule                        | ✓           | ✓                       | ✗ (4)           | –       |

Playback preferences (voice, speed, pace, export format) and pronunciations are kept by the server,
so they are the same everywhere. Appearance, reading text, music and sound-effect volumes are kept per
device.

## Voices

| Feature                                                                   | Windows app | Browser on the computer | Phone or tablet | Website |
| ------------------------------------------------------------------------- | ----------- | ----------------------- | --------------- | ------- |
| Choose a voice for reading, preview voices                                | ✓           | ✓                       | ✓ (1)           | –       |
| Record with the microphone                                                | ✓           | ✓                       | ✗ (5)           | –       |
| Create, import, share, blend, fine-tune or delete voices; studio sessions | ✓           | ✓                       | ✗ (6)           | –       |
| Install, repair or update engines (Kokoro, voice cloning)                 | ✓           | ✓                       | ✗ (7)           | –       |

## Exports

| Feature                                        | Windows app | Browser on the computer | Phone or tablet | Website |
| ---------------------------------------------- | ----------- | ----------------------- | --------------- | ------- |
| Start, pause and resume an export              | ✓           | ✓                       | ✓ (1)           | –       |
| Download a finished export                     | ✓           | ✓                       | ✓               | –       |
| Cancel an export, or delete one                | ✓           | ✓                       | ✗ (3)           | –       |
| Send an export to Audiobookshelf; its settings | ✓           | ✓                       | ✗ (8)           | –       |

## Settings, updates and the app itself

| Feature                                                          | Windows app        | Browser on the computer | Phone or tablet | Website                |
| ---------------------------------------------------------------- | ------------------ | ----------------------- | --------------- | ---------------------- |
| LAN mode: turn it on, pair and remove devices                    | ✓                  | ✓ (9)                   | ✗ (7)           | –                      |
| Local speech API: settings and tokens                            | ✓                  | ✓                       | ✗ (7)           | –                      |
| Local speech API: programs make speech                           | ✓ (10)             | ✓ (10)                  | If allowed (10) | ✗ (10)                 |
| Clear the audio cache                                            | ✓                  | ✓                       | ✗ (7)           | –                      |
| Storage sizes                                                    | ✓                  | ✓                       | ✓ (11)          | –                      |
| Check for and install updates                                    | ✓                  | – (12)                  | – (12)          | –                      |
| Open the data and log folders, third-party notices               | ✓                  | ✗ (13)                  | ✗ (13)          | –                      |
| What's new and the release history                               | ✓                  | ✓                       | ✓               | ✓ (release notes page) |
| Install as a browser app; screens open while TTSNative is closed | – (an app already) | ✓ (9)                   | ✗ (5)           | –                      |
| Download the Windows installer                                   | –                  | –                       | –               | ✓ (14)                 |

## Notes and reasons

1. **Limited per device**, so one phone or tablet can't keep the computer busy. Adding a document or a
   cover, opening an included book, and starting or resuming an export count together: up to 20 in any
   10 minutes. Voice previews and new takes of a sentence have their own allowance: up to 60 in any 10
   minutes. Past either, requests are refused for a while, and the phone says why.
2. **The computer would fetch the page from the internet**, so only someone at the computer can ask
   it to.
3. **It throws work away**: deleting a document removes everything made from it, cancelling or
   deleting an export discards minutes or hours of narration, and removing a saved cast discards the
   voices you assigned. Pausing an export works on a phone.
4. **Not opened to phones yet.** New features stay on the computer until they are added to the list of
   what paired devices may do.
5. **Browsers allow these only on secure (HTTPS) pages.** On the computer, `127.0.0.1` counts as
   secure; LAN mode uses plain HTTP, so a phone can't record or install TTSNative as an app. In the
   Windows app, a permission prompt asks before the microphone is used.
6. **Voices and their recordings stay on the computer.** LAN traffic isn't encrypted, so LAN mode
   keeps voice recordings off the network, and voices are created and managed only on the computer.
   Phones list your voices and read with them.
7. **The computer's own settings** (LAN mode, the speech API, engines, the cache) change what the
   computer opens to the network or runs, or throw its work away, so they stay with whoever is at the
   computer.
8. **It uses the computer's Audiobookshelf account** and sends files to another server.
9. **From source, LAN mode and the screens that open while TTSNative is closed need the built app**
   (`npm run start`), not `npm run dev`.
10. **The speech API is for programs on the computer.** It needs a token, refuses web pages (so
    websites can never use it), and refuses other devices unless you allow them in its settings, and
    then only while LAN mode or network mode is on. See the
    [local speech API guide](https://github.com/carsonmcrae/ttsnative/blob/main/docs/guides/local-speech-api.md).
11. **Sizes only**: the data folder's path isn't shown to other devices.
12. **The browser and phones use whatever version runs on the computer.** From source, you update
    with `git pull`; the Windows app updates itself.
13. **These open folders on the computer**, which only the Windows app's own window can do.
14. **The website only describes and offers what the newest published release has.** Until 2.1.0 is
    published, its download page says the installer isn't out yet.

## The website

[ttsnative.com](https://ttsnative.com) shows the features, the videos, privacy, install steps and the
release notes, and offers the Windows installer once a release includes it. Its speech demo uses your
browser's built-in voices, not TTSNative's, and says so. Nothing you do on the website reaches your
copy of TTSNative.

## Network mode

The older [network mode](Other-Devices#advanced-network-mode-from-the-command-line), started from the
command line with `--allow-network`, has none of the phone limits above: any device with its token can
do everything, including deleting documents and changing settings. Prefer LAN mode.
