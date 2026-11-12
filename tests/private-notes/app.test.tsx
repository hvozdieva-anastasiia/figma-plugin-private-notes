import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { NoteTarget } from '../../src/shared/model';
import { clampWindow } from '../../src/shared/messages';
import { noteKey } from '../../src/plugin/storage/document-notes';
import { FILE, frame, page } from './fixtures';
import { FRAME_CONTEXT, ready, seed, setup } from './harness';
import type { MemoryStore } from './memory-store';

describe('window', () => {
  it('opens on its own and shows the empty state', async () => {
    setup();
    expect(screen.getByText(/Loading your notes/)).toBeInTheDocument();
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
  });

  it('shows the own notes grouped as file, page and frame with counts', async () => {
    const { service } = setup();
    seed(service, 'a', 'Whole file note', FILE);
    seed(service, 'b', 'Page note', page('0:1', 'Mobile'));
    seed(service, 'c', 'Frame note', frame('1:4', 'Checkout', '0:1', 'Mobile'));
    // The window was opened before the notes were added: refresh reads them.
    const { user } = { user: userEvent.setup() };
    await ready();
    await user.click(screen.getByRole('button', { name: 'Refresh the list' }));
    expect(await screen.findByText('Whole file note')).toBeInTheDocument();
    const pageHeading = screen.getByRole('heading', {
      name: /Page · Mobile/,
    });
    expect(within(pageHeading).getByLabelText('Notes: 2')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Frame · Checkout/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Whole file/ }),
    ).toBeInTheDocument();
  });

  it('shows a count of unreadable records and keeps the other notes', async () => {
    const { service, store, user } = setup();
    seed(service, 'a', 'Readable', FILE);
    store.seed(noteKey('42', 'bad'), '{nope');
    await ready();
    await user.click(screen.getByRole('button', { name: 'Refresh the list' }));
    expect(await screen.findByText('Readable')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 record(s) could not be read',
    );
  });
});

describe('creating a note', () => {
  it('saves a note on the current page and says it is written to the document', async () => {
    const { store, user } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByLabelText('Target')).toHaveDisplayValue('Page · Mobile');
    await user.type(screen.getByLabelText('Text'), 'Проверить сетку');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Проверить сетку')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Saved to the document',
    );
    expect(store.keys()).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: /Page · Mobile/ }),
    ).toBeInTheDocument();
  });

  it('defaults to one selected frame', async () => {
    const { user } = setup(FRAME_CONTEXT);
    await ready();
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByLabelText('Target')).toHaveDisplayValue(
      'Frame · Checkout',
    );
  });

  it('offers the whole file without any selection and saves it', async () => {
    const { store, user } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await user.selectOptions(screen.getByLabelText('Target'), 'Whole file');
    await user.type(screen.getByLabelText('Text'), 'Общая заметка');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByRole('heading', { name: /Whole file/ }),
    ).toBeInTheDocument();
    const stored = JSON.parse(store.get(store.keys()[0] as string)) as {
      target: NoteTarget;
    };
    expect(stored.target.type).toBe('file');
  });

  it('keeps the chosen target when the selection or page changes while typing', async () => {
    const { store, user, changeContext } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await user.type(screen.getByLabelText('Text'), 'Черновик');
    changeContext({
      page: { id: '0:2', name: 'Desktop' },
      selection: [{ id: '2:2', type: 'FRAME', name: 'Home' }],
      selectionCount: 1,
    });
    // The new frame is offered, but the draft stays on the page it was opened with.
    expect(screen.getByLabelText('Target')).toHaveDisplayValue('Page · Mobile');
    expect(screen.getByLabelText('Text')).toHaveValue('Черновик');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Черновик');
    const stored = JSON.parse(store.get(store.keys()[0] as string)) as {
      target: NoteTarget;
    };
    expect(stored.target).toMatchObject({ type: 'page', id: '0:1' });
  });

  it('keeps the text and shows the reason when the write fails, then saves once on retry', async () => {
    const { store, user } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await user.type(screen.getByLabelText('Text'), 'Важный текст');
    store.failMode = 'throw';
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not write to the document',
    );
    expect(screen.getByLabelText('Text')).toHaveValue('Важный текст');
    store.failMode = 'none';
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Важный текст');
    expect(store.keys()).toHaveLength(1);
  });

  it('does not save empty text and asks before dropping typed text', async () => {
    const { store, user } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await user.type(screen.getByLabelText('Text'), 'Не потерять');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Discard the unsaved text?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.getByLabelText('Text')).toHaveValue('Не потерять');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    expect(await screen.findByText('No notes yet')).toBeInTheDocument();
    expect(store.keys()).toEqual([]);
  });
});

describe('managing notes', () => {
  async function withNotes() {
    const env = setup();
    seed(env.service, 'a', 'Первая заметка', FILE);
    seed(env.service, 't', 'Сделать задачу', page('0:1', 'Mobile'), 'task');
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Refresh the list' }),
    );
    await screen.findByText('Первая заметка');
    return env;
  }

  it('edits the text and keeps the note in place', async () => {
    const { user, store } = await withNotes();
    const item = screen
      .getByText('Первая заметка')
      .closest('li') as HTMLElement;
    await user.click(within(item).getByRole('button', { name: 'Edit note' }));
    const area = screen.getByLabelText('Text');
    await user.clear(area);
    await user.type(area, 'Исправленная заметка');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Исправленная заметка')).toBeInTheDocument();
    expect(screen.queryByText('Первая заметка')).not.toBeInTheDocument();
    expect(store.keys()).toHaveLength(2);
  });

  it('moves a note to another target without making a copy', async () => {
    const { user, store } = await withNotes();
    const item = screen
      .getByText('Первая заметка')
      .closest('li') as HTMLElement;
    await user.click(within(item).getByRole('button', { name: 'Edit note' }));
    await user.selectOptions(screen.getByLabelText('Target'), 'Page · Mobile');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Первая заметка');
    expect(
      screen.queryByRole('heading', { name: /Whole file/ }),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole('heading', { name: /Page · Mobile/ }),
      ).getByLabelText('Notes: 2'),
    ).toBeInTheDocument();
    expect(store.keys()).toHaveLength(2);
  });

  it('completes and reopens a task without deleting it', async () => {
    const { user } = await withNotes();
    const box = screen.getByRole('checkbox', {
      name: 'Mark the task done',
    });
    await user.click(box);
    await waitFor(() =>
      expect(screen.getByRole('checkbox')).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    expect(screen.getByText('Сделать задачу')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Сделать задачу')).toBeInTheDocument();
    expect(screen.queryByText('Первая заметка')).not.toBeInTheDocument();
  });

  it('deletes only after confirmation', async () => {
    const { user, store } = await withNotes();
    const item = screen
      .getByText('Первая заметка')
      .closest('li') as HTMLElement;
    await user.click(within(item).getByRole('button', { name: 'Delete note' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Первая заметка')).toBeInTheDocument();
    expect(store.keys()).toHaveLength(2);
    await user.click(within(item).getByRole('button', { name: 'Delete note' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.queryByText('Первая заметка')).not.toBeInTheDocument(),
    );
    expect(store.keys()).toHaveLength(1);
    // The group that became empty disappears.
    expect(
      screen.queryByRole('heading', { name: /Whole file/ }),
    ).not.toBeInTheDocument();
  });

  it('searches and filters without changing the stored notes', async () => {
    const { user, store } = await withNotes();
    const before = store.snapshot();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search notes' }),
      'задач',
    );
    expect(screen.queryByText('Первая заметка')).not.toBeInTheDocument();
    expect(screen.getByText('Сделать задачу')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByText('Nothing found')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Reset search and filters' }),
    );
    expect(screen.getByText('Первая заметка')).toBeInTheDocument();
    expect(store.snapshot()).toEqual(before);
    expect(store.writes).toHaveLength(2);
  });

  it('collapses a group without changing its count', async () => {
    const { user } = await withNotes();
    const toggle = screen.getByRole('button', { name: /Whole file/ });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Первая заметка')).not.toBeVisible();
    expect(within(toggle).getByLabelText('Notes: 1')).toBeInTheDocument();
  });

  it('shows only the selected frame in "Current selection"', async () => {
    const env = setup(FRAME_CONTEXT);
    seed(
      env.service,
      'f',
      'Про Checkout',
      frame('1:4', 'Checkout', '0:1', 'Mobile'),
    );
    seed(env.service, 'g', 'Про файл', FILE);
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Refresh the list' }),
    );
    await screen.findByText('Про файл');
    await env.user.click(
      screen.getByRole('button', { name: 'Current selection' }),
    );
    expect(screen.getByText('Про Checkout')).toBeInTheDocument();
    expect(screen.queryByText('Про файл')).not.toBeInTheDocument();
  });
});

describe('targets', () => {
  const FRAME = frame('1:4', 'Checkout', '0:1', 'Mobile');

  async function withTargetNotes() {
    const env = setup();
    seed(env.service, 'f', 'Про фрейм', FRAME);
    seed(env.service, 'p', 'Про страницу', page('0:1', 'Mobile'));
    seed(env.service, 'w', 'Про файл', FILE);
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Refresh the list' }),
    );
    await screen.findByText('Про фрейм');
    return env;
  }

  async function refresh(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Refresh the list' }));
  }

  const storedFrameNote = (store: MemoryStore) =>
    JSON.parse(
      store.get(store.keys().find((k) => k.endsWith('_f')) as string),
    ) as { id: string; text: string; target: NoteTarget; revision: number };

  it('checks each target once, in one batch, without touching any note', async () => {
    const { asked, store } = await withTargetNotes();
    await waitFor(() => expect(asked.length).toBeGreaterThan(0));
    expect(asked.flat().sort()).toEqual(['0:1', '1:4']);
    expect(store.writes).toHaveLength(3); // only the three seeded notes
  });

  it('shows the current name of a renamed frame and of its page', async () => {
    const env = setup();
    seed(env.service, 'f', 'Про фрейм', FRAME);
    env.world['1:4'] = {
      name: 'Payment',
      pageId: '0:1',
      pageName: 'Mobile app',
    };
    await ready();
    await refresh(env.user);
    expect(
      await screen.findByRole('heading', { name: /Frame · Payment/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Page · Mobile app/ }),
    ).toBeInTheDocument();
  });

  it('shows a moved frame under the page it is on now', async () => {
    const env = setup();
    seed(env.service, 'f', 'Про фрейм', FRAME);
    env.world['1:4'] = { name: 'Checkout', pageId: '0:2', pageName: 'Desktop' };
    await ready();
    await refresh(env.user);
    expect(
      await screen.findByRole('heading', { name: /Page · Desktop/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Page · Mobile/ }),
    ).not.toBeInTheDocument();
  });

  it('moves a note of a deleted frame to "No available target" and keeps its text', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'missing';
    await refresh(env.user);
    const group = await screen.findByRole('heading', {
      name: /No available target/,
    });
    expect(within(group).getByLabelText('Notes: 1')).toBeInTheDocument();
    expect(screen.getByText('Про фрейм')).toBeInTheDocument();
    expect(screen.getByText(/target not found, text kept/)).toBeInTheDocument();
    // Nothing was turned into a whole-file note and nothing was rewritten.
    const stored = storedFrameNote(env.store);
    expect(stored.target).toEqual(FRAME);
    expect(stored.revision).toBe(1);
  });

  it('brings the note back when Undo restores the target and the list is refreshed', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'missing';
    await refresh(env.user);
    await screen.findByRole('heading', { name: /No available target/ });
    delete env.world['1:4'];
    await refresh(env.user);
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /No available target/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: /Frame · Checkout/ }),
    ).toBeInTheDocument();
  });

  it('does not call a target lost when the check itself fails, and retries on request', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'error';
    await refresh(env.user);
    expect(
      await screen.findByText(/Could not check the target/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /No available target/ }),
    ).not.toBeInTheDocument();
    const before = env.asked.flat().length;
    delete env.world['1:4'];
    await env.user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() =>
      expect(env.asked.flat().length).toBeGreaterThan(before),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/Could not check the target/),
      ).not.toBeInTheDocument(),
    );
  });

  it('moves to the target of a note and keeps the window open', async () => {
    const env = await withTargetNotes();
    const item = screen.getByText('Про фрейм').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Go to the target' }),
    );
    await waitFor(() => expect(env.focused).toEqual(['1:4']));
    expect(
      screen.getByRole('button', { name: 'Add note' }),
    ).toBeInTheDocument();
  });

  it('offers no move for a whole-file note', async () => {
    await withTargetNotes();
    const item = screen.getByText('Про файл').closest('li') as HTMLElement;
    expect(
      within(item).queryByRole('button', { name: 'Go to the target' }),
    ).toBeNull();
  });

  it('moves a note to the lost group when a move finds the target gone', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'missing';
    const item = screen.getByText('Про фрейм').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Go to the target' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Frame not found',
    );
    expect(
      await screen.findByRole('heading', { name: /No available target/ }),
    ).toBeInTheDocument();
  });

  it('keeps a note in place when a move fails because of an API error', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'error';
    const item = screen.getByText('Про фрейм').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Go to the target' }),
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /No available target/ }),
    ).not.toBeInTheDocument();
  });

  it('rebinds a lost note to another target explicitly, with the same id and text', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'missing';
    await refresh(env.user);
    await screen.findByRole('heading', { name: /No available target/ });
    await env.user.click(screen.getByRole('button', { name: 'Rebind' }));
    // The editor opens on the old target with the choice of another one open.
    expect(
      screen.getByRole('group', { name: 'Choose another target' }),
    ).toBeInTheDocument();
    await env.user.click(screen.getByRole('button', { name: 'Close' }));
    await env.user.selectOptions(
      screen.getByLabelText('Target'),
      'Page · Mobile',
    );
    await env.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /No available target/ }),
      ).not.toBeInTheDocument(),
    );
    const stored = storedFrameNote(env.store);
    expect(stored).toMatchObject({ id: 'f', text: 'Про фрейм', revision: 2 });
    expect(stored.target).toMatchObject({ type: 'page', id: '0:1' });
    expect(env.store.keys()).toHaveLength(3);
  });

  it('lets a lost note be edited and deleted', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'missing';
    await refresh(env.user);
    await screen.findByRole('heading', { name: /No available target/ });
    const item = screen.getByText('Про фрейм').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Edit note' }),
    );
    const area = screen.getByLabelText('Text');
    await env.user.clear(area);
    await env.user.type(area, 'Новый текст');
    await env.user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Новый текст')).toBeInTheDocument();
    // The old target is gone, yet the text was saved and the target was not touched.
    expect(storedFrameNote(env.store).target).toEqual(FRAME);
    const again = screen.getByText('Новый текст').closest('li') as HTMLElement;
    await env.user.click(
      within(again).getByRole('button', { name: 'Delete note' }),
    );
    await env.user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.queryByText('Новый текст')).not.toBeInTheDocument(),
    );
  });

  it('follows the current page with the frames that are on it now', async () => {
    const env = setup();
    seed(env.service, 'f', 'Про фрейм', FRAME);
    env.world['1:4'] = { name: 'Checkout', pageId: '0:2', pageName: 'Desktop' };
    await ready();
    await refresh(env.user);
    await screen.findByText('Про фрейм');
    await env.user.click(
      screen.getByRole('button', { name: 'Current selection' }),
    );
    // The current page is Mobile; the frame has moved to Desktop.
    expect(screen.queryByText('Про фрейм')).not.toBeInTheDocument();
    env.changeContext({
      page: { id: '0:2', name: 'Desktop' },
      selection: [],
      selectionCount: 0,
    });
    expect(await screen.findByText('Про фрейм')).toBeInTheDocument();
  });
});

describe('toolbar and window', () => {
  it('puts the search, a small add button and the refresh button on one line, in that order', async () => {
    setup();
    await ready();
    const search = screen.getByRole('searchbox', { name: 'Search notes' });
    const add = screen.getByRole('button', { name: 'Add note' });
    const refresh = screen.getByRole('button', { name: 'Refresh the list' });
    const row = search.closest('.toolbar__row') as HTMLElement;
    expect(row).toContainElement(add);
    expect(row).toContainElement(refresh);
    const before = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(before(search, add)).toBe(true);
    expect(before(add, refresh)).toBe(true);
    // The add button is small: an icon with a name, not a wide labelled button.
    expect(add).toHaveClass('icon-btn');
    expect(add).toHaveTextContent('');
  });

  it('speaks English only', async () => {
    const env = setup();
    seed(env.service, 'a', 'x', FILE, 'task');
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Refresh the list' }),
    );
    await screen.findByText('x');
    const ui = document.body.textContent ?? '';
    expect(ui).not.toMatch(/[А-Яа-яЁё]/);
    const labels = [...document.querySelectorAll('[aria-label],[title]')]
      .map(
        (el) => `${el.getAttribute('aria-label')} ${el.getAttribute('title')}`,
      )
      .join(' ');
    expect(labels).not.toMatch(/[А-Яа-яЁё]/);
  });

  it('asks Plugin Main to resize the window from the keyboard', async () => {
    const env = setup();
    await ready();
    const grip = screen.getByRole('button', { name: /Resize the window/ });
    grip.focus();
    await env.user.keyboard('{ArrowRight}');
    await waitFor(() => expect(env.resized).toHaveLength(1));
    expect(env.resized[0]).toEqual(
      clampWindow(window.innerWidth + 20, window.innerHeight),
    );
    await env.user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    await waitFor(() => expect(env.resized).toHaveLength(2));
    expect(env.resized[1]?.height).toBe(
      clampWindow(window.innerWidth, window.innerHeight + 100).height,
    );
  });

  it('resizes by dragging the corner, using the pointer movement on the screen', async () => {
    const env = setup();
    await ready();
    const grip = screen.getByRole('button', { name: /Resize the window/ });
    fireEvent.pointerDown(grip, { pointerId: 1, screenX: 500, screenY: 400 });
    fireEvent.pointerMove(grip, { pointerId: 1, screenX: 560, screenY: 450 });
    await waitFor(() => expect(env.resized.length).toBeGreaterThan(0));
    // The size asked for is the window plus the pointer movement on the screen
    // (clamped to the allowed range by Plugin Main).
    expect(env.resized[env.resized.length - 1]).toEqual(
      clampWindow(window.innerWidth + 60, window.innerHeight + 50),
    );
    fireEvent.pointerUp(grip, { pointerId: 1 });
    const count = env.resized.length;
    fireEvent.pointerMove(grip, { pointerId: 1, screenX: 900, screenY: 900 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    // A move after the button was released is not a drag.
    expect(env.resized).toHaveLength(count);
  });

  it('keeps the resize handle in every state of the window', async () => {
    setup();
    expect(
      screen.getByRole('button', { name: /Resize the window/ }),
    ).toBeInTheDocument();
    await ready();
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(
      screen.getByRole('button', { name: /Resize the window/ }),
    ).toBeInTheDocument();
  });
});

describe('bulk actions', () => {
  const F = frame('1:4', 'Checkout', '0:1', 'Mobile');

  async function withMany() {
    const env = setup();
    seed(env.service, 'a', 'Alpha note', FILE);
    seed(env.service, 'b', 'Beta task', page('0:1', 'Mobile'), 'task');
    seed(env.service, 'c', 'Gamma task', F, 'task');
    seed(env.service, 'd', 'Delta note', F);
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Refresh the list' }),
    );
    await screen.findByText('Alpha note');
    return env;
  }

  const select = (name: string) =>
    screen.getByRole('checkbox', { name: new RegExp(`Select note: ${name}`) });

  it('shows no bulk bar and no selection boxes until selection mode is on', async () => {
    await withMany();
    expect(
      screen.queryByRole('region', { name: 'Bulk actions' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /Select note/ }),
    ).not.toBeInTheDocument();
  });

  it('turns selection mode on with its own bulk bar and hides the per-note actions', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    expect(
      screen.getByRole('region', { name: 'Bulk actions' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit note' }),
    ).not.toBeInTheDocument();
    // The task checkbox gives way to the selection checkbox.
    expect(
      screen.queryByRole('checkbox', { name: 'Mark the task done' }),
    ).not.toBeInTheDocument();
    expect(select('Beta task')).toBeInTheDocument();
    await env.user.click(
      screen.getByRole('button', { name: 'Exit selection mode' }),
    );
    expect(
      screen.queryByRole('region', { name: 'Bulk actions' }),
    ).not.toBeInTheDocument();
  });

  it('ticks notes one by one, by clicking the text, and counts them', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(select('Alpha note'));
    await env.user.click(screen.getByText('Delta note'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(select('Alpha note')).toHaveAttribute('aria-checked', 'true');
    await env.user.click(select('Alpha note'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('selects every visible note and clears the selection', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(
      screen.getByRole('button', { name: 'Select all (4)' }),
    );
    expect(screen.getByText('4 selected')).toBeInTheDocument();
    await env.user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
  });

  it('selects only what the filter shows', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Open' }));
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(
      screen.getByRole('button', { name: 'Select all (2)' }),
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.queryByText('Alpha note')).not.toBeInTheDocument();
  });

  it('ticks a whole group, including its frames, and shows a mixed state', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    const pageBox = screen.getByRole('checkbox', {
      name: 'Select all in Page · Mobile',
    });
    await env.user.click(select('Gamma task'));
    expect(pageBox).toHaveAttribute('aria-checked', 'mixed');
    await env.user.click(pageBox);
    expect(pageBox).toHaveAttribute('aria-checked', 'true');
    // The page note and both frame notes: 3 notes.
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await env.user.click(pageBox);
    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
  });

  it('deletes the selected notes only after confirmation', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(select('Alpha note'));
    await env.user.click(select('Delta note'));
    await env.user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/Delete 2 notes for good/)).toBeInTheDocument();
    await env.user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(env.store.keys()).toHaveLength(4);
    await env.user.click(screen.getByRole('button', { name: 'Delete' }));
    await env.user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(env.store.keys()).toHaveLength(2));
    expect(screen.queryByText('Alpha note')).not.toBeInTheDocument();
    expect(screen.queryByText('Delta note')).not.toBeInTheDocument();
    expect(screen.getByText('Beta task')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Deleted 2 notes.');
    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
  });

  it('marks the selected tasks done and says how many notes were skipped', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(
      screen.getByRole('button', { name: 'Select all (4)' }),
    );
    await env.user.click(screen.getByRole('button', { name: 'Mark done' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Marked 2 tasks done',
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent('2 notes skipped');
    const stored = env.store.keys().map(
      (key) =>
        JSON.parse(env.store.get(key)) as {
          kind: string;
          status: string | null;
        },
    );
    expect(stored.filter((n) => n.status === 'done')).toHaveLength(2);
    expect(
      stored.filter((n) => n.kind === 'note' && n.status !== null),
    ).toHaveLength(0);
    // The notes that were skipped are not changed.
    expect(env.store.writes).toHaveLength(4 + 2);
  });

  it('disables the task actions when no task is selected', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(select('Alpha note'));
    expect(screen.getByRole('button', { name: 'Mark done' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move to…' })).toBeEnabled();
  });

  it('moves the selected notes to another target without copies and keeps their ids and text', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(select('Alpha note'));
    await env.user.click(select('Delta note'));
    await env.user.click(screen.getByRole('button', { name: 'Move to…' }));
    await env.user.selectOptions(
      screen.getByLabelText('Move to'),
      'Page · Mobile',
    );
    await env.user.click(screen.getByRole('button', { name: 'Move 2 notes' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Whole file/ }),
      ).not.toBeInTheDocument(),
    );
    expect(env.store.keys()).toHaveLength(4);
    const moved = ['a', 'd'].map(
      (id) =>
        JSON.parse(
          env.store.get(
            env.store.keys().find((k) => k.endsWith(`_${id}`)) as string,
          ),
        ) as {
          id: string;
          text: string;
          target: NoteTarget;
          revision: number;
        },
    );
    expect(moved.map((n) => n.text)).toEqual(['Alpha note', 'Delta note']);
    for (const note of moved) {
      expect(note.target).toMatchObject({ type: 'page', id: '0:1' });
      expect(note.revision).toBe(2);
    }
    expect(screen.getByRole('status')).toHaveTextContent('Moved 2 notes.');
  });

  it('moves notes to the whole file', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(select('Gamma task'));
    await env.user.click(screen.getByRole('button', { name: 'Move to…' }));
    await env.user.selectOptions(
      screen.getByLabelText('Move to'),
      'Whole file',
    );
    await env.user.click(screen.getByRole('button', { name: 'Move 1 note' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('Moved 1 note.'),
    );
    const file = screen.getByRole('heading', { name: /Whole file/ });
    expect(within(file).getByLabelText('Notes: 2')).toBeInTheDocument();
  });

  it('keeps the move panel target fixed while the canvas selection changes', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(select('Alpha note'));
    await env.user.click(screen.getByRole('button', { name: 'Move to…' }));
    expect(screen.getByLabelText('Move to')).toHaveDisplayValue(
      'Page · Mobile',
    );
    env.changeContext({
      page: { id: '0:2', name: 'Desktop' },
      selection: [],
      selectionCount: 0,
    });
    expect(screen.getByLabelText('Move to')).toHaveDisplayValue(
      'Page · Mobile',
    );
  });

  it('writes nothing and says why when the chosen target no longer exists', async () => {
    const env = await withMany();
    env.world['0:1'] = 'missing';
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(select('Alpha note'));
    await env.user.click(screen.getByRole('button', { name: 'Move to…' }));
    await env.user.click(screen.getByRole('button', { name: 'Move 1 note' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Page not found',
    );
    expect(env.store.writes).toHaveLength(4);
    // The panel stays open so that another target can be chosen.
    expect(screen.getByLabelText('Move to')).toBeInTheDocument();
  });

  it('reports a partial failure and keeps the failed notes selected', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(
      screen.getByRole('button', { name: 'Select all (4)' }),
    );
    // Another window changed "Alpha note" after this one read it.
    const changed = env.service.update({
      id: 'a',
      expectedRevision: 1,
      text: 'Alpha, edited elsewhere',
    });
    expect(changed.ok).toBe(true);
    await env.user.click(screen.getByRole('button', { name: 'Delete' }));
    await env.user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Deleted 3 notes, 1 failed',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'changed in the document',
    );
    // Only the note that failed is left, and it is still ticked.
    expect(env.store.keys()).toHaveLength(1);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('does not change anything for notes that are not selected', async () => {
    const env = await withMany();
    const before = env.store.snapshot();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(select('Alpha note'));
    await env.user.click(screen.getByRole('button', { name: 'Delete' }));
    await env.user.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(env.store.keys()).toHaveLength(3));
    for (const key of env.store.keys()) {
      expect(env.store.get(key)).toBe(before[key]);
    }
  });

  it('drops the selection when selection mode is left', async () => {
    const env = await withMany();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(select('Alpha note'));
    await env.user.click(
      screen.getByRole('button', { name: 'Exit selection mode' }),
    );
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
  });

  it('shows the per-note actions of a note on a page or frame without hovering', async () => {
    await withMany();
    const item = screen.getByText('Gamma task').closest('li') as HTMLElement;
    expect(
      within(item).getByRole('button', { name: 'Go to the target' }),
    ).toBeVisible();
    expect(
      within(item).getByRole('button', { name: 'Edit note' }),
    ).toBeVisible();
    expect(
      within(item).getByRole('button', { name: 'Delete note' }),
    ).toBeVisible();
  });
});
