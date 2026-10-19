/* global document, window, HTMLMediaElement, setTimeout */
/**
 * Purpose: Browser-side helpers injected into the app while the demo video is recorded.
 * Scope: A visible cursor with click ripples (headless capture has no pointer), on-screen step
 *   captions and an end card, and a log of every audio clip the app plays (start, pause and end
 *   times plus the sentence on screen), sent to the recorder through `window.__demoMedia`.
 * Does NOT belong: Driving the app or encoding (record-demo.mjs). Nothing here changes app behaviour.
 */
(() => {
  const css = `
    #demo-cursor { position: fixed; left: 0; top: 0; width: 26px; height: 26px; z-index: 2147483647;
      pointer-events: none; opacity: 0; transition: opacity .2s; filter: drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
    .demo-ripple { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
      border: 3px solid #4f46e5; z-index: 2147483646; pointer-events: none; animation: demo-ripple .55s ease-out forwards; }
    @keyframes demo-ripple { from { transform: scale(.3); opacity: .9; } to { transform: scale(1.4); opacity: 0; } }
    #demo-caption { position: fixed; left: 50%; top: 18px; transform: translate(-50%, -12px); z-index: 2147483645;
      pointer-events: none; opacity: 0; transition: opacity .35s, transform .35s; display: flex; align-items: center;
      gap: 12px; padding: 12px 22px; border-radius: 999px; background: rgba(17,18,22,.88); color: #fff;
      font: 600 19px/1.3 'Inter Variable', Inter, system-ui, sans-serif; letter-spacing: -.01em; white-space: nowrap;
      box-shadow: 0 18px 40px -18px rgba(0,0,0,.6); }
    #demo-caption.show { opacity: 1; transform: translate(-50%, 0); }
    #demo-caption .step { display: grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px;
      border-radius: 999px; background: #4f46e5; font-size: 15px; box-sizing: border-box; }
    #demo-end { position: fixed; inset: 0; z-index: 2147483644; display: grid; place-items: center; opacity: 0;
      pointer-events: none; transition: opacity .6s; background: #f7f6f3; color: #1c1d21; text-align: center;
      font-family: 'Inter Variable', Inter, system-ui, sans-serif; }
    #demo-end.show { opacity: 1; }
    #demo-end h1 { font-size: 64px; letter-spacing: -.035em; margin: 22px 0 10px; }
    #demo-end p { font-size: 24px; color: #55565c; margin: 6px 0; }
    #demo-end code { font: 600 22px ui-monospace, Consolas, monospace; background: #fff; border: 1px solid #e3e0da;
      padding: 10px 18px; border-radius: 12px; display: inline-block; margin-top: 22px; }`;
  const logo = `<svg width="96" height="96" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#4f46e5"/>
    <path d="M9 20.5v-9M13.5 23v-14M18 19v-6M22.5 21.5v-11" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>`;
  const arrow = `<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5l15.5 9.2-6.9 1.6-3.6 6.2z"
    fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

  /** Send one media event to the recorder (no-op when not recording). */
  const send = (record) => {
    if (typeof window.__demoMedia === 'function') void window.__demoMedia(record);
  };
  const activeText = () =>
    document.querySelector('[data-active="true"]')?.textContent?.trim() ?? '';
  const ids = new WeakMap();
  let count = 0;
  const watch = (media) => {
    if (ids.has(media)) return;
    count += 1;
    ids.set(media, count);
    const id = count;
    for (const type of ['playing', 'pause', 'ended', 'emptied']) {
      media.addEventListener(type, () => {
        const record = {
          id,
          type,
          src: media.currentSrc || media.src,
          t: Date.now() / 1000,
          at: media.currentTime,
          rate: media.playbackRate,
          text: '',
        };
        if (type !== 'playing') return send(record);
        // The highlight moves when playback starts; read the sentence a moment later.
        setTimeout(() => send({ ...record, text: activeText() }), 150);
      });
    }
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function demoPlay(...args) {
    watch(this);
    return play.apply(this, args);
  };

  const mount = () => {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = arrow;
    const caption = document.createElement('div');
    caption.id = 'demo-caption';
    const end = document.createElement('div');
    end.id = 'demo-end';
    document.body.append(cursor, caption, end);
    document.addEventListener(
      'mousemove',
      (event) => {
        cursor.style.opacity = '1';
        cursor.style.transform = `translate(${event.clientX - 4}px, ${event.clientY - 2}px)`;
      },
      true,
    );
    document.addEventListener(
      'mousedown',
      (event) => {
        const ripple = document.createElement('div');
        ripple.className = 'demo-ripple';
        ripple.style.left = `${event.clientX}px`;
        ripple.style.top = `${event.clientY}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 700);
      },
      true,
    );
    window.__demo = {
      caption(text, step) {
        caption.innerHTML = (step ? `<span class="step">${step}</span>` : '') + `<span></span>`;
        caption.lastElementChild.textContent = text;
        caption.classList.add('show');
      },
      hideCaption() {
        caption.classList.remove('show');
      },
      endCard(title, lines, command) {
        end.innerHTML = `<div>${logo}<h1></h1>${lines.map(() => '<p></p>').join('')}<code></code></div>`;
        end.querySelector('h1').textContent = title;
        end.querySelectorAll('p').forEach((p, i) => (p.textContent = lines[i]));
        end.querySelector('code').textContent = command;
        end.classList.add('show');
        caption.classList.remove('show');
        cursor.style.opacity = '0';
      },
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
