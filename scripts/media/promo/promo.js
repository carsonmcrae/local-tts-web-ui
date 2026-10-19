/* global document, location, URLSearchParams */
/**
 * Purpose: The showcase video's timeline: seven scenes drawn deterministically for any time t.
 * Scope: Animation helpers, a persistent background and one builder per scene. Global seek(t)
 *   updates every element for that instant; global ready resolves once fonts and screenshots load.
 *   Scene windows match SCENES in promo-audio.mjs, where each voice-over line starts.
 * Does NOT belong: Page styles (promo.html), frame capture (render-promo.mjs), sound (promo-audio.mjs).
 */
const W = 1920;
const FPS = 30;
const DURATION = 45;
const SHOT = (name) => `/docs/images/${name}.png`;

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const E = {
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t ** 3,
  inOut: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2,
};
/** Progress of t through [a, b], eased. */
const pr = (t, a, b, e = E.out) => e(clamp((t - a) / (b - a)));
const mix = (a, b, p) => a + (b - a) * p;

function set(node, { x = 0, y = 0, s = 1, r = 0, o = 1, blur = 0 } = {}) {
  node.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) scale(${s.toFixed(4)}) rotate(${r.toFixed(3)}deg)`;
  node.style.opacity = clamp(o).toFixed(3);
  node.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : '';
  node.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
}
function el(parent, cls, css = {}, html = '') {
  const node = document.createElement('div');
  if (cls) node.className = cls;
  Object.assign(node.style, css);
  if (html) node.innerHTML = html;
  parent.appendChild(node);
  return node;
}
const at = (x, y, extra = {}) => ({ left: `${x}px`, top: `${y}px`, ...extra });
const ICON = {
  logo: '<svg viewBox="0 0 32 32" width="100%" height="100%"><rect width="32" height="32" rx="8" fill="#4f46e5"/><path d="M9 20.5v-9M13.5 23v-14M18 19v-6M22.5 21.5v-11" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>',
  shield:
    '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M9 12l2.2 2.2L15.5 10"/></svg>',
  down: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/></svg>',
  wave: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" stroke-width="2.4" stroke-linecap="round"><path d="M5 9v6M9 6v12M13 9v6M17 7v10M21 10v4"/></svg>',
};

/** A browser window showing one or more real screenshots (stacked for crossfades). */
function windowFrame(parent, shots, x, y, width) {
  const height = Math.round((width * 1800) / 2880);
  const frame = el(parent, 'window abs', at(x, y, { width: `${width}px` }));
  el(
    frame,
    'bar',
    {},
    '<span class="dot" style="background:#ff5f57"></span><span class="dot" style="background:#febc2e"></span><span class="dot" style="background:#28c840"></span><span class="url">127.0.0.1:8765</span>',
  );
  const view = el(frame, 'view', { height: `${height}px` });
  const images = shots.map((name) => {
    const image = document.createElement('img');
    image.src = SHOT(name);
    view.appendChild(image);
    return image;
  });
  return { frame, images };
}

const stage = document.getElementById('stage');
const background = el(stage, 'layer');
const blobs = [
  [
    el(
      background,
      'blob',
      at(-200, -300, { width: '900px', height: '900px', background: 'rgba(79,70,229,.20)' }),
    ),
    0,
  ],
  [
    el(
      background,
      'blob',
      at(1250, -250, { width: '800px', height: '800px', background: 'rgba(139,92,246,.18)' }),
    ),
    1.9,
  ],
  [
    el(
      background,
      'blob',
      at(800, 650, { width: '900px', height: '900px', background: 'rgba(20,184,166,.14)' }),
    ),
    3.3,
  ],
];
const scenes = [];
function scene(start, end, build) {
  const layer = el(stage, 'layer');
  scenes.push({ start, end, layer, update: build(layer) });
}
/** Standard left-hand text block: eyebrow, headline and supporting line. */
function textBlock(layer, eyebrow, headline, sub, top = 300) {
  const column = el(
    layer,
    'abs',
    at(120, top, { width: '600px', display: 'flex', flexDirection: 'column', gap: '28px' }),
  );
  const label = el(column, 'eyebrow');
  label.textContent = eyebrow;
  return [label, el(column, 'h', { fontSize: '80px' }, headline), el(column, 'sub', {}, sub)];
}
function showBlock(nodes, t, start, exit) {
  nodes.forEach((node, i) =>
    set(node, {
      y: mix(40, 0, pr(t, start + i * 0.18, start + 0.7 + i * 0.18)),
      o: pr(t, start + i * 0.18, start + 0.6 + i * 0.18) * (1 - exit),
    }),
  );
}

// 1. Hook: any document, read aloud.
scene(0, 5.6, (L) => {
  const logo = el(L, 'abs', at(900, 160, { width: '120px', height: '120px' }), ICON.logo);
  const line1 = el(
    L,
    'h abs',
    at(0, 320, { width: `${W}px`, textAlign: 'center', fontSize: '150px' }),
    'Any document.',
  );
  const line2 = el(
    L,
    'h abs',
    at(0, 485, { width: `${W}px`, textAlign: 'center', fontSize: '150px' }),
    '<span class="grad">Read aloud.</span>',
  );
  const bars = Array.from({ length: 48 }, (_, i) =>
    el(
      L,
      'abs',
      at(480 + i * 20, 700, {
        width: '10px',
        height: '120px',
        borderRadius: '5px',
        background: `hsl(${244 + i * 0.9} 75% ${58 + (i % 3) * 3}%)`,
        transformOrigin: '50% 50%',
      }),
    ),
  );
  const chips = [
    ['PDF', 'Harbour Stories', 150, 180],
    ['EPUB', 'The Night Train', 1450, 150],
    ['DOCX', 'Meeting notes', 120, 860],
    ['MD', 'Field guide', 1480, 870],
    ['TXT', 'Paste any text', 1560, 520],
  ].map(([tag, name, x, y], i) => ({
    node: el(L, 'chip abs', at(x, y), `<span class="tag">${tag}</span>${name}`),
    i,
    from: x < 900 ? -260 : 260,
  }));
  return (t) => {
    const exit = pr(t, 4.9, 5.6, E.in);
    set(logo, { s: mix(0.4, 1, pr(t, 0.15, 0.8, E.back)), o: pr(t, 0.15, 0.5) * (1 - exit) });
    set(line1, {
      y: mix(60, 0, pr(t, 0.5, 1.2)),
      o: pr(t, 0.5, 1.1) * (1 - exit),
      s: 1 + exit * 0.05,
    });
    set(line2, {
      y: mix(60, 0, pr(t, 1, 1.7)),
      o: pr(t, 1, 1.6) * (1 - exit),
      s: 1 + exit * 0.05,
    });
    bars.forEach((bar, i) => {
      const level =
        0.12 + 0.88 * Math.abs(Math.sin(t * 3.1 + i * 0.55) * Math.sin(t * 1.7 + i * 0.23));
      set(bar, { s: 1, o: pr(t, 1.5 + i * 0.012, 2.1 + i * 0.012) * (1 - exit) });
      bar.style.transform += ` scaleY(${(level * pr(t, 1.5, 2.2)).toFixed(3)})`;
    });
    for (const c of chips) {
      const p = pr(t, 1.6 + c.i * 0.12, 2.4 + c.i * 0.12, E.back);
      set(c.node, {
        x: mix(c.from, 0, p),
        y: Math.sin(t * 1.1 + c.i) * 8,
        r: mix(c.from / 40, 0, p),
        o: pr(t, 1.6 + c.i * 0.12, 2 + c.i * 0.12) * (1 - exit),
      });
    }
  };
});

// 2. Bring anything.
scene(5.4, 12.2, (L) => {
  const block = textBlock(
    L,
    'Bring anything',
    'PDFs, e-books, Word files and notes.',
    'Upload a file or paste text. Chapters, headings and pages are found for you.',
    250,
  );
  const { frame } = windowFrame(L, ['library'], 760, 190, 1040);
  const flying = ['PDF', 'EPUB', 'DOCX'].map((tag, i) => ({
    node: el(
      L,
      'chip abs',
      at(140, 760 + i * 0),
      `<span class="tag">${tag}</span>${['Harbour Stories.pdf', 'The Night Train.epub', 'Meeting notes.docx'][i]}`,
    ),
    i,
  }));
  return (t) => {
    const exit = pr(t, 11.6, 12.2, E.in);
    showBlock(block, t, 5.6, exit);
    set(frame, {
      x: mix(140, 0, pr(t, 5.6, 6.5)),
      s: mix(0.96, 1, pr(t, 5.6, 12)),
      o: pr(t, 5.6, 6.2) * (1 - exit),
    });
    for (const f of flying) {
      const start = 7.4 + f.i * 0.6;
      const p = pr(t, start, start + 1.1, E.inOut);
      set(f.node, {
        x: mix(0, 1050, p),
        y: mix(0, -260 + f.i * 90, p),
        s: mix(1, 0.55, p),
        o: pr(t, start - 0.3, start) * (1 - pr(t, start + 0.8, start + 1.1)) * (1 - exit),
      });
    }
  };
});

// 3. Read along, sentence by sentence (light and dark themes).
scene(12, 19.8, (L) => {
  const block = textBlock(
    L,
    'Read along',
    'Follow every sentence.',
    'The sentence being spoken is highlighted. Jump between chapters and pick up where you left off.',
  );
  const { frame, images } = windowFrame(L, ['reader-light', 'reader-dark'], 720, 170, 1110);
  const themes = el(L, 'chip abs', at(1130, 930), `${ICON.wave}Light and dark themes`);
  return (t) => {
    const exit = pr(t, 19.2, 19.8, E.in);
    showBlock(block, t, 12.2, exit);
    set(frame, {
      x: mix(140, 0, pr(t, 12.2, 13.1)),
      s: mix(0.97, 1.02, pr(t, 12.2, 19.8, E.inOut)),
      o: pr(t, 12.2, 12.8) * (1 - exit),
    });
    images[1].style.opacity = pr(t, 15.8, 16.6, E.inOut).toFixed(3);
    set(themes, { y: mix(30, 0, pr(t, 16, 16.6)), o: pr(t, 16, 16.5) * (1 - exit) });
  };
});

// 4. Voices and export.
scene(19.6, 25.8, (L) => {
  const count = el(L, 'h abs', at(120, 250, { fontSize: '220px' }), '0');
  const label = el(L, 'h abs', at(120, 490, { fontSize: '72px' }), 'natural voices');
  const sub = el(
    L,
    'sub abs',
    at(120, 590, { width: '560px' }),
    'Nine languages. Preview them side by side, then export to MP3 or WAV.',
  );
  const { frame } = windowFrame(L, ['voices'], 760, 190, 1040);
  const names = ['Heart', 'Emma', 'George', 'Bella', 'Michael', 'Nicole'];
  const spots = [
    [700, 120],
    [1700, 140],
    [1690, 840],
    [730, 880],
    [1240, 950],
    [1500, 70],
  ];
  const chips = names.map((name, i) => ({
    node: el(L, 'chip abs', at(...spots[i]), `${ICON.wave}${name}`),
    i,
  }));
  const exportChip = el(L, 'chip abs', at(120, 800), `${ICON.down}Export · MP3 or WAV`);
  return (t) => {
    const exit = pr(t, 25.2, 25.8, E.in);
    count.textContent = String(Math.round(54 * pr(t, 19.9, 21.1, E.out)));
    set(count, { y: mix(40, 0, pr(t, 19.8, 20.5)), o: pr(t, 19.8, 20.3) * (1 - exit) });
    set(label, { y: mix(40, 0, pr(t, 20.1, 20.8)), o: pr(t, 20.1, 20.6) * (1 - exit) });
    set(sub, { y: mix(40, 0, pr(t, 20.3, 21)), o: pr(t, 20.3, 20.8) * (1 - exit) });
    set(frame, { x: mix(140, 0, pr(t, 19.8, 20.7)), o: pr(t, 19.8, 20.4) * (1 - exit) });
    for (const c of chips)
      set(c.node, {
        s: mix(0.5, 1, pr(t, 21 + c.i * 0.18, 21.6 + c.i * 0.18, E.back)),
        y: Math.sin(t * 1.3 + c.i) * 7,
        o: pr(t, 21 + c.i * 0.18, 21.4 + c.i * 0.18) * (1 - exit),
      });
    set(exportChip, { y: mix(30, 0, pr(t, 22.8, 23.4)), o: pr(t, 22.8, 23.3) * (1 - exit) });
  };
});

// 5. Voice Studio: an optional voice of your own, with consent.
scene(25.6, 32.2, (L) => {
  const block = textBlock(
    L,
    'Optional Voice Studio',
    'A voice of your own.',
    'Record about 20 seconds and confirm consent. Cloning runs locally with Chatterbox.',
    220,
  );
  const { frame } = windowFrame(L, ['studio'], 760, 190, 1040);
  const checks = [
    'Consent required',
    'Recording quality checks',
    'Delete it at any time',
    'Installed only if you want it',
  ].map((text, i) => el(L, 'check abs', at(120, 700 + i * 66), `<i>✓</i>${text}`));
  return (t) => {
    const exit = pr(t, 31.6, 32.2, E.in);
    showBlock(block, t, 25.8, exit);
    set(frame, { x: mix(140, 0, pr(t, 25.8, 26.7)), o: pr(t, 25.8, 26.4) * (1 - exit) });
    checks.forEach((node, i) =>
      set(node, {
        x: mix(-30, 0, pr(t, 27.4 + i * 0.4, 27.9 + i * 0.4)),
        o: pr(t, 27.4 + i * 0.4, 27.8 + i * 0.4) * (1 - exit),
      }),
    );
  };
});

// 6. Private by design.
scene(32, 38.4, (L) => {
  const badge = el(
    L,
    'abs',
    at(880, 150, {
      width: '160px',
      height: '160px',
      borderRadius: '50%',
      background: '#4f46e5',
      color: '#fff',
      display: 'grid',
      placeItems: 'center',
      fontSize: '84px',
      boxShadow: '0 30px 60px -24px rgba(79,70,229,.7)',
    }),
    ICON.shield,
  );
  const line = el(
    L,
    'h abs',
    at(0, 380, { width: `${W}px`, textAlign: 'center', fontSize: '104px' }),
    'Everything stays<br><span class="grad">on your computer.</span>',
  );
  const row = el(
    L,
    'abs',
    at(0, 740, { width: `${W}px`, display: 'flex', justifyContent: 'center', gap: '32px' }),
  );
  const chips = ['No accounts', 'No cloud', 'No telemetry', 'Works offline'].map((text) =>
    el(row, 'chip', {}, text),
  );
  return (t) => {
    const exit = pr(t, 37.8, 38.4, E.in);
    set(badge, { s: mix(0.3, 1, pr(t, 32.2, 32.9, E.back)), o: pr(t, 32.2, 32.6) * (1 - exit) });
    set(line, { y: mix(50, 0, pr(t, 32.5, 33.3)), o: pr(t, 32.5, 33.1) * (1 - exit) });
    chips.forEach((node, i) =>
      set(node, {
        y: mix(40, 0, pr(t, 33.6 + i * 0.3, 34.2 + i * 0.3, E.back)),
        o: pr(t, 33.6 + i * 0.3, 34 + i * 0.3) * (1 - exit),
      }),
    );
  };
});

// 7. End card.
scene(38.2, DURATION + 1, (L) => {
  const logo = el(L, 'abs', at(890, 150, { width: '140px', height: '140px' }), ICON.logo);
  const name = el(
    L,
    'h abs',
    at(0, 330, { width: `${W}px`, textAlign: 'center', fontSize: '140px' }),
    'Local TTS',
  );
  const sub = el(
    L,
    'sub abs',
    at(0, 505, { width: `${W}px`, textAlign: 'center', fontSize: '40px' }),
    'Private text-to-speech for your documents.',
  );
  const code = el(
    L,
    'abs',
    at(0, 610, { width: `${W}px`, textAlign: 'center' }),
    '<span class="code">npm install &amp;&amp; npm run dev</span>',
  );
  const foot = el(
    L,
    'sub abs',
    at(0, 800, { width: `${W}px`, textAlign: 'center', fontSize: '28px' }),
    'Free and open source · MIT licence · github.com/carsonmcrae/local-tts-web-ui',
  );
  const credit = el(
    L,
    'sub abs',
    at(0, 990, { width: `${W}px`, textAlign: 'center', fontSize: '21px', color: '#6b6c72' }),
    'Voice-over generated on this computer by Local TTS (Kokoro voice “Heart”).',
  );
  return (t) => {
    set(logo, { s: mix(0.4, 1, pr(t, 38.4, 39.1, E.back)), o: pr(t, 38.4, 38.8) });
    [name, sub, code, foot, credit].forEach((node, i) =>
      set(node, {
        y: mix(40, 0, pr(t, 38.7 + i * 0.25, 39.4 + i * 0.25)),
        o: pr(t, 38.7 + i * 0.25, 39.2 + i * 0.25),
      }),
    );
  };
});

globalThis.DURATION = DURATION;
globalThis.FPS = FPS;
globalThis.seek = (t) => {
  blobs.forEach(([node, phase]) =>
    set(node, { x: Math.sin(t * 0.21 + phase) * 120, y: Math.cos(t * 0.17 + phase) * 90 }),
  );
  for (const s of scenes) {
    const live = t >= s.start && t < s.end;
    s.layer.style.display = live ? '' : 'none';
    if (live) s.update(t);
  }
};
globalThis.ready = Promise.all([
  document.fonts.ready,
  ...[...document.images].map((image) => image.decode().catch(() => undefined)),
]);
globalThis.seek(Number(new URLSearchParams(location.search).get('t') ?? 0));
