# Local speech API (optional)

TTSNative can lend its voices to other programs on your computer: scripts, screen readers, home
automation, or anything that already speaks to OpenAI's text-to-speech API. The local speech API is
an OpenAI-compatible endpoint, `POST /v1/audio/speech`, served by the same local server as the app.

It is **off by default**. While it is off, every `/v1` address answers `404 Not Found`, exactly as if
it didn't exist, and does no work.

## Turn it on

1. Open **Settings → Local speech API** and choose **Speech API settings**.
2. Switch on **Turn on the speech API**.
3. Choose **Create token**, then **Copy token**. The token is shown **once**: TTSNative stores only a
   fingerprint of it (a SHA-256 hash), so it can't be shown again. If you lose it, make a new one.
4. Give the token to the program that will use the API, for example in an environment variable:

   ```bash
   export TTSNATIVE_TOKEN="ttsn_…"          # macOS and Linux
   ```

   ```powershell
   $env:TTSNATIVE_TOKEN = "ttsn_…"          # Windows PowerShell
   ```

The section also shows when the API was last used and with which voice. While a program is using
it, a small **Speech API in use** sign appears in the app's sidebar (a dot on the Settings tab on a
phone).

## The address and port

Programs on this computer connect to `http://127.0.0.1:<port>/v1`. The section shows the exact
address under **Address**, with a **Copy address** button. It is always TTSNative's own port, read
from the server itself. Under `npm run dev` the page you are looking at comes from a separate web
server on another port (5173 by default): use the port Settings shows, not the one in your
browser's address bar.

The port is **8765** unless it is busy when TTSNative starts:

- `npm run start` and `npm run dev` start on 8765, or on the port in `LTTS_PORT` (`npm run start`)
  or `LTTS_API_PORT` (`npm run dev`). If that port is taken (by another program, or another copy of
  TTSNative), they use the next free one (8766, 8767…), print a warning in the terminal, and keep it
  until TTSNative stops. The next start tries the usual port again.
- `ltts serve --port <port>` uses exactly that port, and stops with an error if it is busy.

When the port changes, programs set up with the old address can't connect. Worse, if another
program now answers on the old port, they would send it their requests, token included. So Settings
remembers the port a program last used and, while TTSNative is on another one, shows **The speech
API moved from port 8765 to port 8766** until a program uses the new address. Either change your
programs to the new address, or close whatever is using the usual port and restart TTSNative. To
keep the address fixed, choose a port nothing else uses, set it in `LTTS_PORT` or `LTTS_API_PORT`
each time you start TTSNative, and use it in your programs.

From another device (only when you allow it, see [Security and privacy](#security-and-privacy)), use
this computer's network address with the same port, such as `http://192.168.1.20:8765/v1`;
**Settings → Phones & tablets** shows the address.

## Make speech

The examples use port 8765; use the one Settings shows.

With curl (on Windows PowerShell, type `curl.exe`):

```bash
curl http://127.0.0.1:8765/v1/audio/speech \
  -H "Authorization: Bearer $TTSNATIVE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "ttsnative", "voice": "kokoro:af_heart", "input": "The front door is open."}' \
  -o door.mp3
```

With Python and [requests](https://requests.readthedocs.io/):

```python
import os

import requests

response = requests.post(
    "http://127.0.0.1:8765/v1/audio/speech",
    headers={"Authorization": f"Bearer {os.environ['TTSNATIVE_TOKEN']}"},
    json={"model": "ttsnative", "voice": "kokoro:af_heart", "input": "Dinner is ready.", "response_format": "wav"},
    timeout=130,
)
response.raise_for_status()
with open("dinner.wav", "wb") as file:
    file.write(response.content)
```

With the official OpenAI Python SDK, point `base_url` at TTSNative and use the token as the API key:

```python
import os

from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8765/v1", api_key=os.environ["TTSNATIVE_TOKEN"])
with client.audio.speech.with_streaming_response.create(
    model="tts-1", voice="kokoro:bf_emma", input="The washing machine has finished."
) as response:
    response.stream_to_file("washing.mp3")
```

TTSNative never contacts OpenAI; the SDK only sends its requests to the address you give it.
Programs that only offer OpenAI's voice names work unchanged too: `voice="nova"` reads with
Kokoro's Nova (see [OpenAI voice names](#openai-voice-names)).

## Endpoints

| Endpoint                | What it does                                                  |
| ----------------------- | ------------------------------------------------------------- |
| `POST /v1/audio/speech` | Reads `input` aloud and answers with the audio file           |
| `GET /v1/models`        | Lists the model names you can send (OpenAI's list format)     |
| `GET /v1/voices`        | Lists the voices you can use (also at `GET /v1/audio/voices`) |

Every request needs `Authorization: Bearer <token>`. In the voice list, `openai_name` is the OpenAI
voice name that also reads with that voice (`null` for most).

### `POST /v1/audio/speech`

The body is JSON (`Content-Type: application/json`):

| Field             | Required | Values                                                                                                                                                                        |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model`           | yes      | `ttsnative`, or OpenAI's names `tts-1`, `tts-1-hd` and `gpt-4o-mini-tts` (all the same here), or an installed engine (`kokoro`, `chatterbox`) to accept only its voices       |
| `input`           | yes      | The text, up to 4,000 characters. Long text is split into sentences with the reader's own segmenter and joined into one file                                                  |
| `voice`           | yes      | A voice id from `GET /v1/voices`, such as `kokoro:af_heart`, or one of [OpenAI's voice names](#openai-voice-names) (`alloy`, `nova`…), which read with built-in Kokoro voices |
| `response_format` | no       | `mp3` (the default), `wav`, `flac`, `opus` (Ogg Opus) or `pcm` (raw 16-bit little-endian mono samples at 24 kHz)                                                              |
| `speed`           | no       | 0.5 to 2.0 (default 1.0)                                                                                                                                                      |

Types are checked strictly (for example `"speed": "1"` is refused). Other fields, such as OpenAI's
`instructions`, are ignored. The answer is the audio itself, with `Content-Type` `audio/mpeg`,
`audio/wav`, `audio/flac`, `audio/ogg` or `audio/pcm`, and two extra headers: `X-Audio-Duration`
(seconds) and `X-Sample-Rate`.

Your [pronunciation dictionary](../wiki/Settings-and-Models.md#pronunciation) applies, as it does
in the reader.

### Errors

Errors are JSON, `{"error": {"code": "…", "message": "…", "details": {}}}`, which OpenAI clients
show as the error message.

| Status | Code                                                                          | Meaning                                                                                        |
| ------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 401    | `invalid_token`                                                               | No token, a wrong one, or one that was revoked or replaced                                     |
| 403    | `network_not_allowed`                                                         | The request came from another device and that isn't allowed                                    |
| 403    | `browser_not_allowed`                                                         | The request came from a web page                                                               |
| 403    | `voice_not_allowed`                                                           | A custom voice that hasn't been allowed for the API (or any other voice made from a recording) |
| 404    | `voice_not_found`, `model_not_found`                                          | Unknown voice or model (`GET /v1/voices` and `GET /v1/models` list them)                       |
| 404    | `http_error`                                                                  | The API is off, or the address doesn't exist                                                   |
| 408    | `request_timeout`                                                             | The request body took longer than 30 seconds to arrive                                         |
| 413    | `payload_too_large`                                                           | The request body is larger than the limit                                                      |
| 415    | `unsupported_media_type`                                                      | The body isn't sent as `application/json`                                                      |
| 422    | `invalid_request`                                                             | A field is missing or invalid (`details.fields` names it)                                      |
| 422    | `input_too_long`, `too_many_sentences`, `empty_input`, `model_voice_mismatch` | The input or model doesn't fit                                                                 |
| 429    | `rate_limited`, `speech_busy`                                                 | Too many requests, or another request is being made; wait for the `Retry-After` seconds        |
| 503    | `engine_not_installed`                                                        | The voice's engine isn't installed (Settings → Engines & models)                               |
| 504    | `timeout`                                                                     | Making the audio took longer than the time limit                                               |

## Voices

While the API is on, every **built-in voice** of an installed engine can be used, and so can a
**voice blend** (`blend:…`, a mix of built-in voices, which copies no one). A **custom
voice** (one you made in Voice Studio or imported, with an id like `custom:…`) can't, until you tick
**Allow <name>** under **Custom voices programs may use**. Only allow a voice that is yours, or whose
speaker agreed to this: any program with the token can make it say anything, so never use it to pass
as someone else. Deleting a voice also removes its permission. Voices of any other kind are refused,
and so is any voice made from a recording, whatever its id, unless you allowed it.

Voice ids match exactly: `CUSTOM:…` or a custom id in other capitals is refused, not treated as the
voice you allowed, and ids with anything but letters, digits, `_`, `-` and `:` (such as `/`, `\` or
`..`) are refused before any voice is looked up. A custom voice that isn't allowed is refused before
its files are read.

### OpenAI voice names

So that programs which only offer OpenAI's voices work without changes, OpenAI's voice names are
accepted too. Each one always reads with the same **built-in Kokoro voice**:

| OpenAI name | Reads with          | Kokoro voice                     |
| ----------- | ------------------- | -------------------------------- |
| `alloy`     | `kokoro:af_alloy`   | Alloy (American English, woman)  |
| `ash`       | `kokoro:am_michael` | Michael (American English, man)  |
| `ballad`    | `kokoro:bm_george`  | George (British English, man)    |
| `cedar`     | `kokoro:am_fenrir`  | Fenrir (American English, man)   |
| `coral`     | `kokoro:af_bella`   | Bella (American English, woman)  |
| `echo`      | `kokoro:am_echo`    | Echo (American English, man)     |
| `fable`     | `kokoro:bm_fable`   | Fable (British English, man)     |
| `marin`     | `kokoro:af_heart`   | Heart (American English, woman)  |
| `nova`      | `kokoro:af_nova`    | Nova (American English, woman)   |
| `onyx`      | `kokoro:am_onyx`    | Onyx (American English, man)     |
| `sage`      | `kokoro:af_sarah`   | Sarah (American English, woman)  |
| `shimmer`   | `kokoro:af_nicole`  | Nicole (American English, woman) |
| `verse`     | `kokoro:am_puck`    | Puck (American English, man)     |

They are stand-ins, not copies of OpenAI's voices. Where Kokoro has a voice of the same name
(`alloy`, `echo`, `fable`, `nova`, `onyx`) that one is used; the others get a well-rated Kokoro
voice of the same gender, each used once so that two names never sound the same, and OpenAI's
recommended `marin` and `cedar` get two of Kokoro's best. For a particular voice, send its TTSNative
id instead.

- The names are lower case and exact: `Alloy` is unknown (`404 voice_not_found`), and so is any name
  OpenAI adds later until TTSNative maps it.
- They only ever stand for these built-in voices, never a custom voice, whatever you allowed.
- They need Kokoro installed (otherwise `503 engine_not_installed`), and they don't go with
  `"model": "chatterbox"` (`422 model_voice_mismatch`).
- `GET /v1/voices` shows each one as the `openai_name` of its Kokoro voice. `GET /v1/models` lists
  models only, as OpenAI's does.

## Limits

- **4,000 characters** per request (`LTTS_SPEECH_API_MAX_CHARS`, up to 20,000) and at most 200
  sentences. The request body may be at most 16 KB plus 12 bytes per allowed character.
- **60 requests a minute** per token (`LTTS_SPEECH_API_REQUESTS_PER_MINUTE`), counting every request
  with the right token; more get `429` with a `Retry-After` header, before their body is read.
  Requests with a wrong token don't count, so they can't use up yours.
- **One request at a time.** While the API is making audio, another request gets `429 speech_busy`
  (`Retry-After: 2`) instead of piling up work for the voice engine. Send many at once and one is
  made; the others are refused straight away and make nothing.
- **30 seconds** to send the request body; a slower one gets `408`. A program that disconnects
  while sending gets nothing.
- **120 seconds** per request (`LTTS_SPEECH_API_TIMEOUT_S`); a longer one gets `504`. Its sentences
  still waiting in the queue are dropped and the rest are never started. If the program disconnects
  while its audio is made, the sentence being made finishes (and stays in the cache) and no further
  sentence is started.
- The API is free for the next request as soon as the audio is made, even if a program is slow to
  read its answer.
- A refused request (any `4xx`) makes no audio.
- Reading in the app comes first: the API waits behind the sentence you are listening to.

## Security and privacy

- **This computer only.** The API refuses requests from other devices (`403`) unless you switch on
  **Allow other devices on my network**, which is off by default. Turning it on doesn't change how the
  server listens: TTSNative still listens only on `127.0.0.1` unless **LAN mode** is on (Settings →
  Phones & tablets) or it was started in [network mode](lan-access.md), so the permission has no
  effect until then. With either on, devices on your network that have the token could make speech
  with the allowed voices (pairing isn't needed for `/v1`; the token is), and requests travel as plain
  HTTP, so others on the same network could read the text and the token.
- **No web pages.** Browsers mark every request a page makes (`Origin` and `Sec-Fetch-*` headers);
  the API refuses those, and it never sends CORS headers, so a website you visit can't use your voices
  even if it guesses the address. Programs and scripts don't send these headers.
- **Only text to audio.** The API accepts the fields above and nothing else: no file names, paths,
  URLs, commands or engine settings. It can't read or write your documents or files.
- **The token** is 256 random bits (`ttsn_` followed by 43 characters). Only its SHA-256 hash is
  stored, in the local database, and a token you send is checked by comparing hashes in constant
  time. It is read from the `Authorization` header only (never from the address), and must match
  exactly, capitals included. **Revoke token** makes it stop working at once; **New token** replaces
  it at once.
- **Logs** record only counts and lengths (characters, sentences, seconds of audio), never the token
  or the text.
- **The audio cache.** Each sentence's audio is kept in the same local audio cache as the reader's,
  so repeating a phrase is instant. The cache has a size limit and **Settings → Storage → Clear audio
  cache** empties it. The text itself is not stored.
- Requests are counted only in memory (how many, when, which voice) for the Settings status; the
  counts reset when the server restarts. The one thing kept is the port a program last used, so
  Settings can warn you when the port has changed.

## Turn it off

Switch off **Turn on the speech API**. Every `/v1` address answers `404` again straight away. The
token is kept, so switching the API back on doesn't break your programs; choose **Revoke token** if
you want to stop them for good.
