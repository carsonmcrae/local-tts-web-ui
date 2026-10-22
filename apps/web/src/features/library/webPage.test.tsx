// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Carson McRae
/**
 * Purpose: Tests for importing a web page and for the newly accepted book formats.
 * Scope: The "Import a web page" dialog (forgiving addresses, inline hints, server explanations,
 *   Enter to submit, cancelling, opening the new document), the address helper, and the upload
 *   pre-check for HTML, FB2 (including .fb2.zip) and Kindle files.
 * Does NOT belong: The server's fetching and safety checks (tested on the server).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileTypeLabel } from '@/lib/format';
import { documentDetail, json, kokoro, mockApi, preferences, renderWithApp } from '@/test/render';
import LibraryPage from './LibraryPage';
import { precheck } from './UploadArea';
import { webAddress } from './WebPageDialog';

afterEach(() => vi.unstubAllGlobals());

const base = {
  'GET /api/engines': [kokoro()],
  'GET /api/preferences': preferences,
  'GET /api/voices': [],
  'GET /api/documents': [],
};

async function openDialog() {
  const user = userEvent.setup();
  const view = renderWithApp(<LibraryPage />);
  const [headerButton] = await screen.findAllByRole('button', { name: 'Import a web page' });
  await user.click(headerButton as HTMLElement);
  const dialog = await screen.findByRole('dialog', { name: 'Import a web page' });
  return { user, dialog, field: within(dialog).getByLabelText('Page address'), ...view };
}

describe('Importing a web page', () => {
  it('adds https:// when it is missing, imports the page and opens it', async () => {
    const { calls } = mockApi({
      ...base,
      'POST /api/documents/url': documentDetail({ id: 'e'.repeat(32), fileType: 'html' }),
    });
    const { user, dialog, field, router } = await openDialog();
    const submit = within(dialog).getByRole('button', { name: 'Import page' });
    expect(submit).toBeDisabled();
    await user.type(field, '  example.com/story  ');
    await user.click(submit);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/read/${'e'.repeat(32)}`));
    expect(calls.find((call) => call.method === 'POST')?.body).toBe(
      '{"url":"https://example.com/story"}',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains an address that cannot work without asking the server', async () => {
    const { calls } = mockApi({ ...base, 'POST /api/documents/url': documentDetail() });
    const { user, dialog, field } = await openDialog();
    await user.type(field, 'ftp://example.com/file{Enter}');
    expect(
      within(dialog).getByText('Enter a full web address, like https://example.com/article.'),
    ).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    await user.clear(field);
    await user.type(field, 'https://example.com/ok{Enter}');
    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
  });

  it("shows the server's reason, which clears when the dialog is closed", async () => {
    let finish: () => void = () => undefined;
    mockApi({
      ...base,
      'POST /api/documents/url': () =>
        new Promise((resolve) => {
          finish = () =>
            resolve(
              json(
                {
                  error: {
                    code: 'blocked_address',
                    message: 'That address points to a private network.',
                  },
                },
                400,
              ),
            );
        }),
    });
    const { user, dialog, field } = await openDialog();
    await user.type(field, 'http://intranet.example/{Enter}');
    expect(within(dialog).getByRole('button', { name: 'Import page' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    finish();
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'That address points to a private network.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [headerButton] = screen.getAllByRole('button', { name: 'Import a web page' });
    await user.click(headerButton as HTMLElement);
    const reopened = await screen.findByRole('dialog', { name: 'Import a web page' });
    expect(within(reopened).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(reopened).getByLabelText('Page address')).toHaveValue('');
  });

  it('is offered in the empty library as well', async () => {
    mockApi(base);
    const user = userEvent.setup();
    renderWithApp(<LibraryPage />);
    await screen.findByText('Drop a document here to start listening');
    expect(screen.getByText(/or a web page by its address/)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button', { name: 'Import a web page' });
    expect(buttons).toHaveLength(2);
    await user.click(buttons[1] as HTMLElement);
    expect(await screen.findByRole('dialog', { name: 'Import a web page' })).toBeInTheDocument();
  });
});

describe('Web addresses and formats', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['http://example.com/a?b=1', 'http://example.com/a?b=1'],
    [' HTTPS://Example.com/Path ', 'https://example.com/Path'],
    ['ftp://example.com/', null],
    ['localhost', null],
    ['javascript:alert(1)', null],
    ['http://exa mple.com', null],
  ])('reads %j as %j', (input, expected) => {
    expect(webAddress(input)).toBe(expected);
  });

  it('accepts HTML, FB2 and Kindle files and names their types', () => {
    for (const name of ['page.html', 'page.HTM', 'book.fb2', 'book.FB2.zip', 'b.mobi', 'b.azw3']) {
      expect(precheck(new File(['x'], name))).toBeNull();
    }
    expect(precheck(new File(['x'], 'archive.zip'))).toBe(
      "“archive.zip” isn't a supported format. Use TXT, Markdown, PDF, DOCX, EPUB, HTML, FB2 or MOBI.",
    );
    expect(['html', 'fb2', 'mobi'].map(fileTypeLabel)).toEqual(['Web page', 'FB2', 'Kindle']);
  });
});
