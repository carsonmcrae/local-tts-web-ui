# Security policy

Local TTS processes untrusted documents and audio and downloads third-party model files, so it is
built with security as a first-class requirement even though it runs on your own computer.

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/carsonmcrae/local-tts-web-ui/security/advisories/new).
Do not open a public issue. Include steps to reproduce and the affected version (Settings → About).
You can expect an acknowledgement within a week.

## Supported versions

| Version                | Supported |
| ---------------------- | --------- |
| 2.x                    | ✅        |
| 1.x (Gradio prototype) | ❌        |

## Security model (summary)

- The server binds to `127.0.0.1`. Exposing it to a network requires `--allow-network`, which generates
  an access token that other devices must present.
- Requests with an unexpected `Host` header, cross-site requests and state-changing requests without the
  app's client header are rejected; CORS is never enabled. Responses carry a strict CSP.
- Documents are size-limited, type-sniffed, and parsed in a separate process with a timeout. ZIP-based
  formats are checked for bombs, encryption and unsafe names; XML entity declarations are refused.
- Model files are downloaded only from pinned HTTPS URLs on approved hosts and must match the expected
  size and SHA-256 before they are installed. Nothing downloaded is executed as a script.
- No telemetry, analytics or accounts. Documents and recordings never leave the machine.

Details: [threat model](docs/security/threat-model.md) ·
[supply chain](docs/security/supply-chain.md) ·
[model provenance](docs/security/model-provenance.md) ·
[license inventory](docs/security/license-inventory.md).
