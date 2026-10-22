# SPDX-License-Identifier: MIT
# Copyright (c) 2026 Carson McRae
"""
Purpose: Write the listening panel for the bundled sound library: one page to audition every sound.
Scope: Reads the catalogue and decodes each MP3 for its measured level, then writes
  docs/research/sound-effects-listening.html: sounds grouped by category with name, id, the events
  they serve, description, duration, loop, measured loudness and peak, a player per sound, a master
  level like the app's, an optional narration bed decoded from a local file and looped through Web
  Audio so sounds can be judged under speech, and a notes box per sound kept in the browser and
  exportable as JSON. No network, no
  dependencies beyond NumPy and soundfile. Run from the repository root:
  node scripts/uv-run.mjs --cwd apps/server run --frozen python ../../scripts/media/sound-listening-page.py
Does NOT belong: Making the sounds (sound-library.py) or judging them (a person does that).
"""

from __future__ import annotations

import html
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf

from ltts.sfx.events import CATEGORY_LABELS, EVENTS

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT / "apps/server/src/ltts/sfx/library.json"
SOUNDS = ROOT / "apps/web/public/sfx"
PAGE = ROOT / "docs/research/sound-effects-listening.html"
APP_LEVEL = 0.4  # the app's default effects volume


def db(value: float) -> float:
    return 20 * math.log10(value) if value > 0 else -120.0


def measure(file: Path) -> dict[str, float]:
    samples, rate = sf.read(file, dtype="float32", always_2d=True)
    mono = samples.mean(axis=1)
    peak = float(np.abs(mono).max()) if mono.size else 0.0
    window = max(1, rate // 10)
    frames = mono[: len(mono) - len(mono) % window].reshape(-1, window) if len(mono) >= window else mono[None, :]
    loud = float(np.percentile(np.sqrt((frames**2).mean(axis=1)), 95)) if frames.size else 0.0
    spectrum = np.abs(np.fft.rfft(mono))
    freqs = np.fft.rfftfreq(len(mono), 1 / rate)
    centroid = float((spectrum * freqs).sum() / spectrum.sum()) if spectrum.sum() else 0.0
    return {"peak": db(peak), "loud": db(loud), "centroid": centroid, "seconds": len(mono) / rate}


def row(sound: dict[str, object], stats: dict[str, float]) -> str:
    sid = html.escape(str(sound["id"]))
    events = ", ".join(html.escape(e) for e in sound.get("events", []))  # type: ignore[union-attr]
    keywords = ", ".join(html.escape(k) for k in sound.get("keywords", []))  # type: ignore[union-attr]
    loop = "loop" if sound.get("loop") else "one-shot"
    flag = " <mark>Experimental</mark>" if sound.get("experimental") else ""
    note = sound.get("qualityNote")
    why = f"<br /><em>{html.escape(str(note))}</em>" if note else ""
    return f"""      <tr data-id="{sid}">
        <td><strong>{html.escape(str(sound["name"]))}</strong>{flag}<br /><code>{sid}</code><br /><small>{events}</small></td>
        <td>{html.escape(str(sound["description"]))}<br /><small>{keywords}</small>{why}</td>
        <td>{stats["seconds"]:.1f} s<br />{loop}</td>
        <td>{stats["loud"]:.0f} dBFS<br />peak {stats["peak"]:.0f}<br />{stats["centroid"]:.0f} Hz</td>
        <td><audio controls preload="none" data-gain="{float(sound["gain"]):.2f}" src="../../apps/web/public/sfx/{html.escape(str(sound["file"]))}"></audio>
          <label><input type="checkbox" class="loop" {"checked" if sound.get("loop") else ""} /> repeat</label></td>
        <td><textarea class="note" rows="3" placeholder="Sounds like…? Distracting? Under speech?"></textarea></td>
      </tr>
"""


def main() -> None:
    manifest = json.loads(LIBRARY.read_text(encoding="utf-8"))
    sounds = {s["id"]: s for s in manifest["sounds"]}
    by_category: dict[str, list[str]] = {}
    for event in EVENTS:
        for sound in manifest["sounds"]:
            if event.id in sound["events"] and sound["id"] not in by_category.get(event.category, []):
                by_category.setdefault(event.category, []).append(sound["id"])
    sections = []
    for category, ids in by_category.items():
        rows = "".join(row(sounds[sid], measure(SOUNDS / sounds[sid]["file"])) for sid in ids)
        sections.append(
            f"    <h2>{html.escape(CATEGORY_LABELS[category])} <small>({len(ids)})</small></h2>\n"
            "    <table>\n      <thead><tr><th>Sound</th><th>Meant to be</th><th>Length</th><th>Measured</th>"
            "<th>Listen</th><th>Your notes</th></tr></thead>\n      <tbody>\n" + rows + "      </tbody>\n    </table>\n"
        )
    page = TEMPLATE.replace("@@SECTIONS@@", "".join(sections)).replace("@@COUNT@@", str(len(sounds)))
    PAGE.write_text(page, encoding="utf-8", newline="\n")
    print(f"wrote {PAGE.relative_to(ROOT)} with {len(sounds)} sounds")


TEMPLATE = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sound effects: listening panel</title>
    <style>
      body { font: 15px/1.45 system-ui, sans-serif; margin: 2rem auto; max-width: 70rem; padding: 0 1rem; color: #222; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 2rem; }
      th, td { border-top: 1px solid #ddd; padding: 0.5rem 0.4rem; vertical-align: top; text-align: left; }
      th { font-size: 13px; color: #555; }
      audio { width: 15rem; display: block; }
      textarea { width: 14rem; font: inherit; }
      .bar { position: sticky; top: 0; background: #fff; padding: 0.6rem 0; border-bottom: 1px solid #ddd; display: flex; gap: 1.5rem; flex-wrap: wrap; align-items: center; }
      code { font-size: 13px; }
      small { color: #666; }
    </style>
  </head>
  <body>
    <h1>Sound effects: listening panel (@@COUNT@@ sounds)</h1>
    <p>
      Generated from the bundled library by <code>scripts/media/sound-listening-page.py</code>. Open this file from
      the repository so the players find <code>apps/web/public/sfx/</code>. The master level starts at the app's
      default (40 %); each sound is also scaled by its own gain as the app does. To judge a sound under speech, pick
      a narration recording (for example an MP3 exported from TTSNative) as the bed: it loops while you audition.
      Sounds marked <mark>Experimental</mark> are never suggested automatically; they can still be added by hand.
      To promote one you judge credible, remove its line from <code>EXPERIMENTAL</code> in
      <code>scripts/media/sfx_recipes.py</code> and rebuild the library.
    </p>
    <div class="bar">
      <label>Master level <input type="range" id="master" min="0" max="100" value="40" /> <span id="masterValue">40 %</span></label>
      <label>Narration bed <input type="file" id="bed" accept="audio/*" /></label>
      <label>Bed level <input type="range" id="bedLevel" min="0" max="100" value="100" /></label>
      <button id="stopAll" type="button">Stop everything</button>
      <button id="export" type="button">Copy notes as JSON</button>
    </div>
    <p><small>Measured: loudness is the 95th-percentile RMS over 100 ms windows; peak is the sample peak; the frequency is the spectral centroid, a rough brightness.</small></p>
@@SECTIONS@@
    <script>
      const players = [...document.querySelectorAll('tbody audio')];
      const master = document.getElementById('master');
      const apply = () => {
        document.getElementById('masterValue').textContent = `${master.value} %`;
        for (const audio of players) audio.volume = Math.min(1, (master.value / 100) * Number(audio.dataset.gain));
      };
      master.addEventListener('input', apply);
      apply();
      for (const box of document.querySelectorAll('input.loop')) {
        const audio = box.closest('tr').querySelector('audio');
        audio.loop = box.checked;
        box.addEventListener('change', () => (audio.loop = box.checked));
      }
      // The narration bed loops through Web Audio from the chosen file's decoded samples.
      let bedContext = null;
      let bedGain = null;
      let bedSource = null;
      const stopBed = () => {
        if (!bedSource) return;
        bedSource.stop();
        bedSource.disconnect();
        bedSource = null;
      };
      document.getElementById('bed').addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (!bedContext) {
          bedContext = new AudioContext();
          bedGain = bedContext.createGain();
          bedGain.gain.value = document.getElementById('bedLevel').value / 100;
          bedGain.connect(bedContext.destination);
        }
        const buffer = await bedContext.decodeAudioData(await file.arrayBuffer());
        stopBed();
        bedSource = bedContext.createBufferSource();
        bedSource.buffer = buffer;
        bedSource.loop = true;
        bedSource.connect(bedGain);
        bedSource.start();
      });
      document.getElementById('bedLevel').addEventListener('input', (event) => {
        if (bedGain) bedGain.gain.value = event.target.value / 100;
      });
      document.getElementById('stopAll').addEventListener('click', () => {
        for (const audio of players) { audio.pause(); audio.currentTime = 0; }
        stopBed();
      });
      const KEY = 'sfx-listening-notes';
      let notes = {};
      try { notes = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { notes = {}; }
      for (const area of document.querySelectorAll('textarea.note')) {
        const id = area.closest('tr').dataset.id;
        area.value = notes[id] || '';
        area.addEventListener('input', () => {
          notes[id] = area.value;
          try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch {}
        });
      }
      document.getElementById('export').addEventListener('click', async () => {
        const text = JSON.stringify(notes, null, 2);
        try { await navigator.clipboard.writeText(text); alert('Notes copied.'); } catch { prompt('Copy your notes:', text); }
      });
    </script>
  </body>
</html>
"""


if __name__ == "__main__":
    main()
