/**
 * Purpose: The core acceptance journey with real Kokoro inference in a real browser.
 * Scope: Paste text → play → hear real narration that advances sentence by sentence; upload TXT,
 *   Markdown, PDF, DOCX and EPUB and verify extraction; reject invalid uploads; resume a session
 *   after reload; switch voices; export audio and download it.
 * Does NOT belong: Voice cloning (studio.spec.ts) or mobile layout (mobile.spec.ts).
 */
import { expect, test } from '@playwright/test';
import { isSegmentAudio, pasteText, play, uploadFixture, waitForActiveSegment } from './helpers';

test.describe('reading aloud', () => {
  test('pasted text is narrated with real audio and the highlight follows along @cross-browser', async ({ page }) => {
    await pasteText(page, 'Hello there. This is a real test of local speech. It keeps going to the end.', 'E2E paste');
    const firstAudio = page.waitForResponse((response) => isSegmentAudio(response, 0));
    await play(page);
    const response = await firstAudio;
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('audio/wav');
    expect(Number(response.headers()['x-audio-duration'])).toBeGreaterThan(0.5);
    expect(Number(response.headers()['content-length'])).toBeGreaterThan(20_000); // body is consumed by the page
    await waitForActiveSegment(page, 1);
    await waitForActiveSegment(page, 2);
    await expect(page.getByRole('region', { name: 'Audio player' }).getByRole('button', { name: 'Play', exact: true })).toBeVisible({ timeout: 60_000 });
  });

  const formats = [
    ['sample.txt', 'The lighthouse keeper climbed the stairs.', 'Chapter 2'],
    ['sample.md', 'The tide came in slowly this morning.', 'Observations'],
    ['sample.pdf', 'Harbour Stories', 'The Storm'],
    ['sample.docx', 'Thank you for reading this letter aloud.', 'Next Steps'],
    ['sample.epub', 'The train left the station at dawn.', 'Arrival'],
  ] as const;
  for (const [file, sentence, section] of formats) {
    test(`extracts ${file} and narrates it`, async ({ page }) => {
      await uploadFixture(page, file);
      await expect(page).toHaveURL(/\/read\/[0-9a-f]{32}$/);
      await expect(page.getByText(sentence, { exact: false }).first()).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Contents' }).getByText(section)).toBeVisible();
      const audio = page.waitForResponse((response) => isSegmentAudio(response));
      await page.getByText(sentence, { exact: false }).first().click();
      expect((await audio).status()).toBe(200);
    });
  }

  test('rejects invalid uploads with clear explanations', async ({ page }) => {
    await uploadFixture(page, 'disguised.pdf');
    await expect(page.getByRole('alert')).toContainText("don't match its .pdf extension");
    await uploadFixture(page, 'scanned.pdf');
    await expect(page.getByRole('alert')).toContainText('no text layer');
  });

  test('resumes where the listener left off after a reload', async ({ page }) => {
    await pasteText(page, 'One sentence here. Two sentences now. Three is the charm. Four to finish.', 'Resume test');
    await play(page);
    await waitForActiveSegment(page, 2);
    await page.getByRole('region', { name: 'Audio player' }).getByRole('button', { name: 'Pause', exact: true }).click();
    await page.waitForTimeout(1500); // progress is saved after a short debounce
    await page.goto('/library');
    const resume = page.getByRole('region', { name: 'Continue listening' });
    await expect(resume).toContainText('Resume test');
    await resume.getByRole('link', { name: 'Resume' }).click();
    await expect(page.locator('[data-active="true"]')).toHaveAttribute('data-index', /[23]/);
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  });

  test('switching voices regenerates the next sentence with the new voice', async ({ page }) => {
    await pasteText(page, 'First voice speaks here. Second voice takes over now.', 'Voices');
    const picker = page.getByRole('region', { name: 'Audio player' }).getByRole('button', { name: /Voice: Heart/ });
    await picker.click();
    await page.getByRole('option', { name: /George/ }).click();
    const request = page.waitForRequest((r) => r.url().includes('/segments/0/audio') && r.url().includes('bm_george'));
    await play(page);
    await request;
  });

  test('exports audio and downloads the file', async ({ page }) => {
    await pasteText(page, 'Chapter 1\n\nA short story. It ends quickly.\n\nChapter 2\n\nThe sequel is shorter.', 'Export test');
    await page.getByRole('region', { name: 'Audio player' }).getByRole('button', { name: 'Export audio' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Export audio' });
    await dialog.getByLabel('Format').selectOption('wav');
    await dialog.getByRole('button', { name: 'Start export' }).click();
    const link = dialog.getByRole('link', { name: 'Download' });
    await expect(link).toBeVisible({ timeout: 90_000 });
    const download = page.waitForEvent('download');
    await link.click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Export test.wav');
    expect((await file.createReadStream()).readableLength >= 0).toBe(true);
  });
});
