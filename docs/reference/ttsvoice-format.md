# The `.ttsvoice` file format

A `.ttsvoice` file is how one TTSNative shares a custom voice with another. It holds what the voice
needs to speak: a short reference recording and, for studio voices, the built voice and its speaking
styles. It never holds the recording session's takes. This page describes version 1 of the format, and
how an import treats a file it is given.

## Layout

A ZIP archive (stored or deflated, never encrypted) holding only these files, each at most once:

| File                         | Size limit | What it is                                                                      |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------- |
| `manifest.json`              | 64 KB      | What the voice is, with a SHA-256 checksum for every other file                 |
| `reference.wav`              | 12 MB      | The playable reference: mono or stereo WAV/FLAC/OGG, 16–48 kHz, at most 30 s    |
| `voice.safetensors`          | 16 MB      | Studio voices: the built Chatterbox conditioning                                |
| `styles/<style>.safetensors` | 2 MB each  | Optional speaking styles: `narration`, `question`, `lively`, `dialogue`, `calm` |

Folders are ignored. Any other file, any file listed twice, an encrypted file, or a file over its
limit means the whole package is refused.

## `manifest.json`

```json
{
  "format": "ttsnative-voice",
  "version": 1,
  "name": "Studio me",
  "description": "Warm and calm, for bedtime stories",
  "creator": "Ana",
  "kind": "studio",
  "engineId": "chatterbox",
  "delivery": "expressive",
  "durationS": 412.5,
  "sampleRate": 48000,
  "consentStatement": "I am the person in these recordings, or I have their permission…",
  "consentedAt": "2026-10-18T09:12:44+00:00",
  "createdAt": "2026-10-18T09:12:44+00:00",
  "exportedAt": "2026-10-20T16:03:10+00:00",
  "appVersion": "2.0.0",
  "files": {
    "reference.wav": "<sha-256 hex>",
    "voice.safetensors": "<sha-256 hex>",
    "styles/question.safetensors": "<sha-256 hex>"
  }
}
```

- `format` and `version` come first: a file whose `format` isn't `ttsnative-voice` isn't a voice file,
  and one whose `version` is newer than the app understands is refused with a message asking to update
  the app (`voice_file_too_new`), rather than a vague error.
- `description`, `creator`, `createdAt` and `appVersion` are optional. Optional fields can be added
  within a version, and fields an app doesn't know are ignored; anything that changes the meaning of
  existing fields needs a new version.
- `kind` is `studio` (needs `voice.safetensors`) or `quick` (just the reference).
- `name` is 1–60 characters, `description` up to 500, `creator` up to 60. Control characters and
  invisible formatting characters (such as the ones that reverse text direction) are removed before
  anything is shown, so a name can't disguise itself.
- `files` must list exactly the files present (other than the manifest), each with its SHA-256.

## What an import checks

An import treats the file as hostile until every check passes, and the preview runs the very same
checks (`POST /api/voice-profiles/import/preview`) without saving anything:

1. The upload is at most 40 MB and is a ZIP.
2. Every entry is on the list above, appears once, isn't encrypted and is within its limit. Files are
   written to a private staging folder **by their listed names**, never by paths from the archive, so
   an archive can't write anywhere else; at most the limit (plus one byte) is ever decompressed.
3. The manifest is valid JSON within limits (absurdly nested JSON is refused), of a known version, with
   every field valid.
4. The files match the manifest exactly, and every checksum matches.
5. The reference recording decodes as audio of the allowed kind and length.
6. Each `.safetensors` file is checked against exactly what the app writes: its header, tensor names,
   types, shapes and byte ranges. No tensor is loaded and nothing in the file is ever run. There are no
   plugins, scripts or code of any kind in a voice file, and nothing in one is executed.
7. The importer confirms they have the voice owner's permission.

Only then is a **new** voice added, marked as shared, with where it came from. An import never replaces a
voice: if one already has the name, the new one is called "Name (2)", "Name (3)" and so on. The staging
folder is deleted whether the import succeeds or not.

## What a voice file is not

- **Not the recordings.** Session takes stay on the computer that recorded them.
- **Not training data.** Chatterbox speaks from a short reference and the conditioning built from it; a
  voice file carries those, not a model trained on someone's voice.
- **Not proof of consent.** The consent statement records what the creator confirmed; the importer
  confirms their own permission too. Every shared voice is a copy of a real person's voice.
