/**
 * Purpose: Unit tests for pure helpers: formatting, WAV encoding/resampling, recording analysis,
 *   speed stepping and the API client.
 * Scope: Deterministic input/output checks; fetch is stubbed for client tests.
 * Does NOT belong: Component rendering.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, buildUrl, CLIENT_HEADER, describeError, fetchAudio } from '@/api/client';
import { stepSpeed } from '@/features/player/useShortcuts';
import { analyzeSamples } from './audio/analysis';
import { encodeWav, encodeWavBuffer, mixToMono, resampleLinear } from './audio/wav';
import {
  fileTypeLabel,
  formatBytes,
  formatClock,
  formatDuration,
  formatRelativeDate,
  pluralize,
} from './format';

describe('format', () => {
  it('formats sizes, clocks and durations', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(337 * 1024 * 1024)).toBe('337 MB');
    expect(formatClock(75)).toBe('1:15');
    expect(formatClock(3725)).toBe('1:02:05');
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatDuration(30)).toBe('under a minute');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(5400)).toBe('1 h 30 min');
    expect(formatDuration(7200)).toBe('2 h');
  });

  it('labels types and relative dates', () => {
    expect(fileTypeLabel('docx')).toBe('Word');
    expect(fileTypeLabel('xyz')).toBe('XYZ');
    const now = new Date('2026-10-19T12:00:00Z');
    expect(formatRelativeDate('2026-10-19T08:00:00Z', now)).toBe('Today');
    expect(formatRelativeDate('2026-10-18T08:00:00Z', now)).toBe('Yesterday');
    expect(formatRelativeDate('2026-10-15T08:00:00Z', now)).toBe('4 days ago');
    expect(formatRelativeDate(null, now)).toBe('');
    expect(pluralize(1, 'page')).toBe('1 page');
    expect(pluralize(2000, 'page')).toBe('2,000 pages');
  });
});

describe('wav', () => {
  it('encodes a valid 16-bit mono WAV header and clamps samples', () => {
    const bytes = encodeWavBuffer(new Float32Array([0, 1, -1, 2]), 24_000);
    const view = new DataView(bytes);
    expect(String.fromCharCode(...new Uint8Array(bytes.slice(0, 4)))).toBe('RIFF');
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
    expect(view.getInt16(50, true)).toBe(0x7fff);
    expect(bytes.byteLength).toBe(44 + 8);
    expect(encodeWav(new Float32Array(2), 24_000).type).toBe('audio/wav');
  });

  it('mixes to mono and resamples', () => {
    expect(Array.from(mixToMono([new Float32Array([1, 0]), new Float32Array([0, 1])]))).toEqual([
      0.5, 0.5,
    ]);
    const resampled = resampleLinear(new Float32Array(48_000).fill(0.25), 48_000, 24_000);
    expect(resampled.length).toBe(24_000);
    expect(resampled[100]).toBeCloseTo(0.25);
  });
});

describe('analysis', () => {
  const rate = 24_000;
  const speech = (seconds: number, level = 0.3) =>
    Float32Array.from({ length: seconds * rate }, (_, i) => {
      const t = i / rate;
      const on = Math.sin(2 * Math.PI * 3 * t) > -0.6 ? 1 : 0;
      return (
        level * on * Math.sin(2 * Math.PI * 180 * t) + 0.0005 * Math.sin(2 * Math.PI * 7919 * t)
      );
    });

  it('accepts clean speech and flags problems like the server', () => {
    expect(analyzeSamples(speech(12), rate).ok).toBe(true);
    expect(analyzeSamples(speech(3), rate).issues.map((i) => i.code)).toContain('too_short');
    expect(analyzeSamples(speech(12, 0.004), rate).issues.map((i) => i.code)).toContain(
      'too_quiet',
    );
    const clipped = speech(12, 3).map((v) => Math.max(-1, Math.min(1, v)));
    expect(analyzeSamples(clipped, rate).issues.find((i) => i.code === 'clipping')?.severity).toBe(
      'error',
    );
  });
});

describe('speed stepping', () => {
  it('steps through the speed ladder and clamps at the ends', () => {
    expect(stepSpeed(1, 1)).toBe(1.1);
    expect(stepSpeed(1, -1)).toBe(0.9);
    expect(stepSpeed(2, 1)).toBe(2);
    expect(stepSpeed(0.75, -1)).toBe(0.75);
  });
});

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the client header and JSON, and parses responses', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      api('/api/x', { method: 'POST', json: { a: 1 }, query: { q: 'z', skip: undefined } }),
    ).resolves.toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/x?q=z');
    expect(init.headers).toMatchObject({ ...CLIENT_HEADER, 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"a":1}');
  });

  it('maps server errors and network failures to ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { code: 'scanned_pdf', message: 'Scanned.' } }), {
            status: 422,
          }),
      ),
    );
    await expect(api('/api/x')).rejects.toMatchObject({
      status: 422,
      code: 'scanned_pdf',
      message: 'Scanned.',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('oops', { status: 500 })),
    );
    await expect(api('/api/x')).rejects.toMatchObject({ code: 'http_error' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    const error = await api('/api/x').catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(ApiError);
    expect(describeError(error)).toMatch(/local server/);
    expect(describeError('weird')).toBe('Something went wrong.');
  });

  it('fetches audio as an object URL with its duration', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(new Blob(['abc']), { headers: { 'X-Audio-Duration': '2.5' } }),
      ),
    );
    await expect(fetchAudio('/api/a')).resolves.toEqual({ url: 'blob:mock', duration: 2.5 });
    expect(buildUrl('/p', { a: 1, b: true })).toBe('/p?a=1&b=true');
  });
});
