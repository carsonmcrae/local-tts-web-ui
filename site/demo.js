// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/*
 * Purpose: The website's browser speech demo and its copy buttons.
 * Scope: Lists the browser's voices (on-device voices first; online ones are labelled and warned
 *   about), speaks the text sentence by sentence at the chosen speed with the Web Speech API while
 *   highlighting the sentence being read (as the app does), stops, announces progress to screen
 *   readers, and explains when the browser can't speak. Copy buttons copy a code block.
 * Does NOT belong: TTSNative's own speech (the installed app), page layout (styles.css).
 */
(() => {
  const $ = (id) => document.getElementById(id);

  function setupCopyButtons() {
    for (const button of document.querySelectorAll('[data-copy]')) {
      button.addEventListener('click', async () => {
        const text = $(button.dataset.copy)?.textContent ?? '';
        try {
          await navigator.clipboard.writeText(text);
          button.textContent = 'Copied';
        } catch {
          button.textContent = 'Select and copy';
        }
        setTimeout(() => (button.textContent = 'Copy'), 2000);
      });
    }
  }

  /** On-device voices first, then those in the page's language, then by name. */
  function rank(voices) {
    const lang = (document.documentElement.lang || 'en').toLowerCase();
    const score = (v) => (v.localService ? 0 : 2) + (v.lang.toLowerCase().startsWith(lang) ? 0 : 1);
    return [...voices].sort((a, b) => score(a) - score(b) || a.name.localeCompare(b.name));
  }

  /** The text split into sentences; one piece where the browser can't segment text. */
  function sentences(words, lang) {
    if (typeof Intl.Segmenter !== 'function') return [words];
    try {
      const parts = [...new Intl.Segmenter(lang, { granularity: 'sentence' }).segment(words)];
      return parts.map((part) => part.segment.trim()).filter(Boolean);
    } catch {
      return [words]; // a voice can report a language tag the segmenter rejects
    }
  }

  /** Shows the sentences in the read-along box; returns a function that highlights one of them. */
  function showReadAlong(box, parts) {
    box.replaceChildren(
      ...parts.map((part) => Object.assign(document.createElement('span'), { textContent: part })),
    );
    box.hidden = false;
    return (index) =>
      [...box.children].forEach((span, at) => span.classList.toggle('current', at === index));
  }

  function setupSpeech() {
    const form = $('speech');
    if (!form) return;
    const [text, select, rate, rateValue, play, stop, status, online, readAlong] = [
      'speech-text',
      'speech-voice',
      'speech-rate',
      'speech-rate-value',
      'speech-play',
      'speech-stop',
      'speech-status',
      'speech-online',
      'speech-readalong',
    ].map($);
    let highlight = () => undefined;
    const synth = globalThis.speechSynthesis;
    if (!synth || typeof globalThis.SpeechSynthesisUtterance !== 'function') {
      select.innerHTML = '<option>Not available</option>';
      status.textContent =
        'This browser can’t speak text aloud. Try a current Chrome, Edge, Firefox or Safari, or install TTSNative.';
      return;
    }
    let voices = [];
    const describe = (v) => `${v.name} (${v.lang})${v.localService ? '' : ' · online'}`;
    const chosen = () => voices[Number(select.value)];
    const showOnlineWarning = () => {
      online.hidden = !chosen() || chosen().localService;
    };
    const load = () => {
      voices = rank(synth.getVoices());
      if (voices.length === 0) return;
      select.innerHTML = '';
      voices.forEach((voice, index) => select.add(new Option(describe(voice), String(index))));
      select.disabled = false;
      play.disabled = false;
      showOnlineWarning();
    };
    load();
    synth.addEventListener?.('voiceschanged', load);
    setTimeout(() => {
      if (voices.length === 0) {
        select.innerHTML = '<option>No voices found</option>';
        status.textContent =
          'Your browser didn’t offer any voices. Some systems need a speech voice installed.';
      }
    }, 3000);

    select.addEventListener('change', showOnlineWarning);
    rate.addEventListener(
      'input',
      () => (rateValue.textContent = `${Number(rate.value).toFixed(1)}×`),
    );
    stop.addEventListener('click', () => {
      synth.cancel();
      highlight(-1);
      stop.disabled = true;
      status.textContent = 'Stopped.';
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const words = text.value.trim();
      if (!words) {
        status.textContent = 'Type something to read first.';
        text.focus();
        return;
      }
      synth.cancel();
      const voice = chosen();
      // One utterance per sentence: the highlight follows along, and long passages aren't cut off.
      const parts = sentences(words, voice?.lang || document.documentElement.lang || 'en');
      highlight = showReadAlong(readAlong, parts);
      parts.forEach((part, index) => {
        const utterance = new SpeechSynthesisUtterance(part);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang;
        }
        utterance.rate = Number(rate.value);
        utterance.onstart = () => {
          stop.disabled = false;
          highlight(index);
          if (index === 0) status.textContent = 'Speaking…';
        };
        if (index === parts.length - 1)
          utterance.onend = () => {
            stop.disabled = true;
            highlight(-1);
            status.textContent = 'Done.';
          };
        utterance.onerror = (e) => {
          stop.disabled = true;
          if (e.error !== 'interrupted' && e.error !== 'canceled')
            status.textContent = 'The browser couldn’t speak this text.';
        };
        synth.speak(utterance);
      });
    });
  }

  setupCopyButtons();
  setupSpeech();
})();
