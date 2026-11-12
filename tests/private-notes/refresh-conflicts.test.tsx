import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { noteKey } from '../../src/plugin/storage/document-notes';
import { FILE, page } from './fixtures';
import { ready, seed, setup } from './harness';

const focusWindow = () =>
  act(() => void window.dispatchEvent(new Event('focus')));

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A window with two notes, past the short "just refreshed" period. */
async function withNotes() {
  const env = setup();
  seed(env.service, 'a', 'Alpha note', page('0:1', 'Mobile'));
  seed(env.service, 'b', 'Beta note', FILE);
  await ready();
  await env.user.click(
    screen.getByRole('button', { name: 'Refresh the list' }),
  );
  await screen.findByText('Alpha note');
  await pause(1600);
  return env;
}

describe('refreshing when the window gets the focus back', () => {
  it('reads the list again', async () => {
    const env = await withNotes();
    // Another window, or Redo, added a note.
    seed(env.service, 'c', 'Added elsewhere', FILE);
    focusWindow();
    expect(await screen.findByText('Added elsewhere')).toBeInTheDocument();
  });

  it('corrects the "now" line, which a rename or a page move changes without any selection event', async () => {
    const env = await withNotes();
    env.setContext({
      page: { id: '0:1', name: 'Renamed page' },
      selection: [],
      selectionCount: 0,
    });
    focusWindow();
    expect(
      await screen.findByText(/Now: Page · Renamed page/),
    ).toBeInTheDocument();
  });

  it('drops a note that Undo removed from the document, and from the selection', async () => {
    const env = await withNotes();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(
      screen.getByRole('button', { name: 'Select all (2)' }),
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    env.store.data.delete(noteKey('42', 'b')); // what Undo does to the document
    focusWindow();
    await waitFor(() =>
      expect(screen.queryByText('Beta note')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('never restores from its own memory a note the document no longer has', async () => {
    const env = await withNotes();
    env.store.data.delete(noteKey('42', 'a'));
    const writes = env.store.writes.length;
    focusWindow();
    await waitFor(() =>
      expect(screen.queryByText('Alpha note')).not.toBeInTheDocument(),
    );
    expect(env.store.keys()).toEqual([noteKey('42', 'b')]);
    expect(env.store.writes.length).toBe(writes);
  });

  it('reads at most once in a short time, however often the focus returns', async () => {
    const env = await withNotes();
    const list = vi.spyOn(env.service, 'list');
    focusWindow();
    focusWindow();
    focusWindow();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(1));
    await pause(50);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('says so when the list could not be read, keeps what was shown and does not retry by itself', async () => {
    const env = await withNotes();
    const list = vi
      .spyOn(env.service, 'list')
      .mockReturnValue({ ok: false, code: 'NO_USER', message: 'gone' });
    focusWindow();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not refresh the list',
    );
    await pause(100);
    expect(list).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Alpha note')).toBeInTheDocument();
  });

  it('keeps an open editor, its text and its target', async () => {
    const env = await withNotes();
    const item = screen.getByText('Alpha note').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Edit note' }),
    );
    await env.user.type(screen.getByLabelText('Text'), ' + my edit');
    seed(env.service, 'c', 'Added elsewhere', FILE);
    focusWindow();
    await pause(150);
    expect(screen.getByLabelText('Text')).toHaveValue('Alpha note + my edit');
    expect(screen.getByLabelText('Target')).toHaveDisplayValue('Page · Mobile');
  });
});

describe('conflicts in the editor', () => {
  async function editing(text: string) {
    const env = await withNotes();
    const item = screen.getByText('Alpha note').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Edit note' }),
    );
    const area = screen.getByLabelText('Text');
    await env.user.clear(area);
    await env.user.type(area, text);
    return env;
  }

  const storedText = (env: Awaited<ReturnType<typeof editing>>, id: string) =>
    (JSON.parse(env.store.get(noteKey('42', id))) as { text: string }).text;

  it('shows the current version when the note changed meanwhile, and keeps the draft', async () => {
    const env = await editing('My version');
    const other = env.service.update({
      id: 'a',
      expectedRevision: 1,
      text: 'Their version',
    });
    expect(other.ok).toBe(true);
    await env.user.click(screen.getByRole('button', { name: 'Save' }));
    const panel = await screen.findByRole('alert');
    expect(panel).toHaveTextContent('changed in the document');
    expect(panel).toHaveTextContent('Their version');
    expect(screen.getByLabelText('Text')).toHaveValue('My version');
    // Nothing is overwritten until the user chooses.
    expect(storedText(env, 'a')).toBe('Their version');
  });

  it('repeats the user change on the current version when asked', async () => {
    const env = await editing('My version');
    env.service.update({ id: 'a', expectedRevision: 1, text: 'Their version' });
    await env.user.click(screen.getByRole('button', { name: 'Save' }));
    await env.user.click(
      await screen.findByRole('button', { name: 'Save my version' }),
    );
    await screen.findByText('My version');
    const stored = JSON.parse(env.store.get(noteKey('42', 'a'))) as {
      text: string;
      revision: number;
    };
    expect(stored).toMatchObject({ text: 'My version', revision: 3 });
    expect(env.store.keys()).toHaveLength(2);
  });

  it('can use the current version instead, writing nothing', async () => {
    const env = await editing('My version');
    env.service.update({ id: 'a', expectedRevision: 1, text: 'Their version' });
    const writes = env.store.writes.length;
    await env.user.click(screen.getByRole('button', { name: 'Save' }));
    await env.user.click(
      await screen.findByRole('button', { name: 'Use the current version' }),
    );
    expect(await screen.findByText('Their version')).toBeInTheDocument();
    expect(env.store.writes.length).toBe(writes);
  });

  it('goes back to editing with the text intact', async () => {
    const env = await editing('My version');
    env.service.update({ id: 'a', expectedRevision: 1, text: 'Their version' });
    await env.user.click(screen.getByRole('button', { name: 'Save' }));
    await env.user.click(
      await screen.findByRole('button', { name: 'Keep editing' }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toHaveValue('My version');
  });

  it('does not resurrect a deleted note: its text can only become a new note', async () => {
    const env = await editing('My version');
    env.store.data.delete(noteKey('42', 'a')); // deleted elsewhere, or removed by Undo
    await env.user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'no longer exists',
    );
    expect(env.store.data.has(noteKey('42', 'a'))).toBe(false);
    await env.user.click(
      screen.getByRole('button', { name: 'Save as a new note' }),
    );
    await screen.findByText('My version');
    const keys = env.store.keys();
    expect(keys).toHaveLength(2);
    expect(keys).not.toContain(noteKey('42', 'a'));
  });

  it('lets the user discard the text of a note that is gone', async () => {
    const env = await editing('My version');
    env.store.data.delete(noteKey('42', 'a'));
    await env.user.click(screen.getByRole('button', { name: 'Save' }));
    await env.user.click(
      await screen.findByRole('button', { name: 'Discard' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('My version')).not.toBeInTheDocument(),
    );
    expect(env.store.keys()).toEqual([noteKey('42', 'b')]);
  });

  it('keeps two windows of one user independent: a stale change to one note leaves the other alone', async () => {
    const env = await editing('My version');
    // The other window changed note "b", not the one being edited here.
    env.service.update({ id: 'b', expectedRevision: 1, text: 'Beta, edited' });
    await env.user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('My version');
    expect(storedText(env, 'a')).toBe('My version');
    expect(storedText(env, 'b')).toBe('Beta, edited');
  });
});
