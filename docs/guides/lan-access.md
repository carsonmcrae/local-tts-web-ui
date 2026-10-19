# Using the app from a phone on your network (optional)

By default the server only listens on `127.0.0.1`, so other devices — including your phone — cannot
reach it. That is deliberate.

To test on a phone on the same trusted Wi-Fi network:

```bash
npm run build
node scripts/uv-run.mjs run --frozen --project apps/server ltts serve --host 0.0.0.0 --allow-network --static apps/web/dist
```

The server prints a one-time link like `http://<this-computer-ip>:8765/?token=…`. Open it on the phone;
the token is stored in an HttpOnly cookie and every other device needs its own link. Stop the server
(Ctrl+C) when you're done.

What to know:

- **Plain HTTP.** The token stops other people on the network from using your library, but traffic is not
  encrypted. Use only on networks you trust.
- **No microphone over HTTP.** Browsers only allow recording on `localhost` or HTTPS. On the phone, import
  an existing recording in Voice Studio instead, or use an HTTPS tunnel you control (for example
  Tailscale Serve) that terminates TLS for this computer.
- **Firewall prompts.** Your OS may ask whether to allow incoming connections for Python; allow it for
  private networks only.
- Never expose the server to the internet.
