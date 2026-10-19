# Model provenance

Every file the app can download is listed in
[`manifest.json`](../../apps/server/src/ltts/modelstore/manifest.json) with an exact URL, size and
SHA-256. Hashes were confirmed against the publisher's own metadata and a local download on 2026-10-19.

## Kokoro-82M v1.0 (default)

|                 |                                                                                                                            |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Model           | [hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) — 82M parameters, StyleTTS2 + ISTFTNet, 24 kHz             |
| Weights licence | Apache-2.0                                                                                                                 |
| Training data   | Permissive and public-domain sources; CC-BY 3.0/4.0 corpora (Koniwa, SIWIS) since v0.19                                    |
| ONNX export     | [thewh1teagle/kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) release `model-files-v1.1` (MIT)                   |
| Files           | `kokoro-v1.0.onnx` 325,505,369 B `beb0d184…df3a`; `voices-v1.0.bin` 28,214,398 B `bca610b8…7d`                             |
| Checksum source | GitHub release asset `digest` fields + local SHA-256                                                                       |
| Format risk     | ONNX graph (data, no code). Voices are a NumPy archive loaded with `allow_pickle=False`.                                   |
| Runtime         | onnxruntime, pinned to `CPUExecutionProvider` (the default provider list on some builds includes a remote Azure provider). |

## Chatterbox Turbo (optional)

|                          |                                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model                    | [ResembleAI/chatterbox-turbo](https://huggingface.co/ResembleAI/chatterbox-turbo) at revision `749d1c1a46eb10492095d68fbcf55691ccf137cd`                                                                |
| Code and weights licence | MIT                                                                                                                                                                                                     |
| Files                    | `t3_turbo_v1.safetensors`, `s3gen_meanflow.safetensors`, `ve.safetensors`, `conds.pt`, tokenizer JSON/text files — 2,987,680,596 B total                                                                |
| Checksum source          | Hugging Face LFS `oid` (SHA-256) for large files; local SHA-256 for small tokenizer files                                                                                                               |
| Format risk              | safetensors (data). `conds.pt` is a PyTorch pickle loaded with `torch.load(weights_only=True)`, which blocks arbitrary code. The worker runs with `HF_HUB_OFFLINE=1`, so it cannot fetch anything else. |
| Output                   | Every clip carries Resemble AI's imperceptible Perth watermark (resemble-perth, MIT).                                                                                                                   |
| Environment              | `apps/chatterbox-worker/uv.lock`: chatterbox-tts 0.1.7, torch 2.6.0 (+cpu or +cu124 from download.pytorch.org), gradio removed via override.                                                            |

## Reference audio and samples

The repository ships **no** voice recordings or cloned voices. Tests that need a "speaker" generate one
with a built-in Kokoro voice, so no real person's voice is ever used.
