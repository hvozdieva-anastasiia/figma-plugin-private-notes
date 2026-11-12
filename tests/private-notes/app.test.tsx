import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { NoteTarget } from '../../src/shared/model';
import {
  PROTOCOL_VERSION,
  type DocumentContext,
} from '../../src/shared/messages';
import { createCommandHandler } from '../../src/plugin/handlers';
import { createNotesService } from '../../src/plugin/notes-service';
import { noteKey } from '../../src/plugin/storage/document-notes';
import { App } from '../../src/ui/App';
import { createBridge, type Transport } from '../../src/ui/bridge';
import { NotesProvider } from '../../src/ui/NotesProvider';
import { FILE, frame, page } from './fixtures';
import { MemoryStore } from './memory-store';

const PAGE_CONTEXT: DocumentContext = {
  page: { id: '0:1', name: 'Mobile' },
  selection: [],
  selectionCount: 0,
};
const FRAME_CONTEXT: DocumentContext = {
  page: { id: '0:1', name: 'Mobile' },
  selection: [{ id: '1:4', type: 'FRAME', name: 'Checkout' }],
  selectionCount: 1,
};

/** The real UI, bridge, command handler and notes service over an in-memory document. */
function setup(initial: DocumentContext = PAGE_CONTEXT) {
  const store = new MemoryStore();
  let context = initial;
  const service = createNotesService({
    store,
    getUserId: () => '42',
    now: () => 1_700_000_000_000,
  });
  const handle = createCommandHandler({
    service,
    getContext: () => context,
    resolveTarget: (target: NoteTarget) =>
      Promise.resolve({ ok: true as const, value: target }),
    listTargets: () =>
      Promise.resolve({
        ok: true as const,
        value: { options: [], truncated: false },
      }),
  });
  const listeners = new Set<(message: unknown) => void>();
  const transport: Transport = {
    post: (message) => {
      void handle(message).then((response) => {
        if (response) listeners.forEach((listener) => listener(response));
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const bridge = createBridge(transport, { timeoutMs: 2000 });
  render(
    <NotesProvider bridge={bridge}>
      <App />
    </NotesProvider>,
  );
  return {
    store,
    service,
    user: userEvent.setup(),
    changeContext(next: DocumentContext) {
      context = next;
      act(() => {
        listeners.forEach((listener) =>
          listener({
            protocolVersion: PROTOCOL_VERSION,
            type: 'CONTEXT_CHANGED',
            context: next,
          }),
        );
      });
    },
  };
}

function seed(
  service: ReturnType<typeof createNotesService>,
  id: string,
  text: string,
  target: NoteTarget,
  kind: 'note' | 'task' = 'note',
) {
  const result = service.create({ id, kind, text, target });
  if (!result.ok) throw new Error(result.message);
}

async function ready() {
  await screen.findByRole('button', { name: /Добавить заметку/ });
}

describe('window', () => {
  it('opens on its own and shows the empty state', async () => {
    setup();
    expect(screen.getByText(/Загружаю ваши заметки/)).toBeInTheDocument();
    expect(await screen.findByText('Заметок пока нет')).toBeInTheDocument();
  });

  it('shows the own notes grouped as file, page and frame with counts', async () => {
    const { service } = setup();
    seed(service, 'a', 'Whole file note', FILE);
    seed(service, 'b', 'Page note', page('0:1', 'Mobile'));
    seed(service, 'c', 'Frame note', frame('1:4', 'Checkout', '0:1', 'Mobile'));
    // The window was opened before the notes were added: refresh reads them.
    const { user } = { user: userEvent.setup() };
    await ready();
    await user.click(screen.getByRole('button', { name: 'Обновить список' }));
    expect(await screen.findByText('Whole file note')).toBeInTheDocument();
    const pageHeading = screen.getByRole('heading', {
      name: /Страница · Mobile/,
    });
    expect(
      within(pageHeading).getByLabelText('Заметок: 2'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Фрейм · Checkout/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Весь файл/ }),
    ).toBeInTheDocument();
  });

  it('shows a count of unreadable records and keeps the other notes', async () => {
    const { service, store, user } = setup();
    seed(service, 'a', 'Readable', FILE);
    store.seed(noteKey('42', 'bad'), '{nope');
    await ready();
    await user.click(screen.getByRole('button', { name: 'Обновить список' }));
    expect(await screen.findByText('Readable')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Не удалось прочитать записей: 1',
    );
  });
});

describe('creating a note', () => {
  it('saves a note on the current page and says it is written to the document', async () => {
    const { store, user } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: /Добавить заметку/ }));
    expect(screen.getByLabelText('Привязка')).toHaveDisplayValue(
      'Страница · Mobile',
    );
    await user.type(screen.getByLabelText('Текст'), 'Проверить сетку');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Проверить сетку')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Записано в документ');
    expect(store.keys()).toHaveLength(1);
    expect(
      screen.getByRole('heading', { name: /Страница · Mobile/ }),
    ).toBeInTheDocument();
  });

  it('defaults to one selected frame', async () => {
    const { user } = setup(FRAME_CONTEXT);
    await ready();
    await user.click(screen.getByRole('button', { name: /Добавить заметку/ }));
    expect(screen.getByLabelText('Привязка')).toHaveDisplayValue(
      'Фрейм · Checkout',
    );
  });

  it('offers the whole file without any selection and saves it', async () => {
    const { store, user } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: /Добавить заметку/ }));
    await user.selectOptions(screen.getByLabelText('Привязка'), 'Весь файл');
    await user.type(screen.getByLabelText('Текст'), 'Общая заметка');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(
      await screen.findByRole('heading', { name: /Весь файл/ }),
    ).toBeInTheDocument();
    const stored = JSON.parse(store.get(store.keys()[0] as string)) as {
      target: NoteTarget;
    };
    expect(stored.target.type).toBe('file');
  });

  it('keeps the chosen target when the selection or page changes while typing', async () => {
    const { store, user, changeContext } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: /Добавить заметку/ }));
    await user.type(screen.getByLabelText('Текст'), 'Черновик');
    changeContext({
      page: { id: '0:2', name: 'Desktop' },
      selection: [{ id: '2:2', type: 'FRAME', name: 'Home' }],
      selectionCount: 1,
    });
    // The new frame is offered, but the draft stays on the page it was opened with.
    expect(screen.getByLabelText('Привязка')).toHaveDisplayValue(
      'Страница · Mobile',
    );
    expect(screen.getByLabelText('Текст')).toHaveValue('Черновик');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByText('Черновик');
    const stored = JSON.parse(store.get(store.keys()[0] as string)) as {
      target: NoteTarget;
    };
    expect(stored.target).toMatchObject({ type: 'page', id: '0:1' });
  });

  it('keeps the text and shows the reason when the write fails, then saves once on retry', async () => {
    const { store, user } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: /Добавить заметку/ }));
    await user.type(screen.getByLabelText('Текст'), 'Важный текст');
    store.failMode = 'throw';
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось записать в документ',
    );
    expect(screen.getByLabelText('Текст')).toHaveValue('Важный текст');
    store.failMode = 'none';
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByText('Важный текст');
    expect(store.keys()).toHaveLength(1);
  });

  it('does not save empty text and asks before dropping typed text', async () => {
    const { store, user } = setup();
    await ready();
    await user.click(screen.getByRole('button', { name: /Добавить заметку/ }));
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    await user.type(screen.getByLabelText('Текст'), 'Не потерять');
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(
      screen.getByText('Отменить несохранённый текст?'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(screen.getByLabelText('Текст')).toHaveValue('Не потерять');
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(await screen.findByText('Заметок пока нет')).toBeInTheDocument();
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
      screen.getByRole('button', { name: 'Обновить список' }),
    );
    await screen.findByText('Первая заметка');
    return env;
  }

  it('edits the text and keeps the note in place', async () => {
    const { user, store } = await withNotes();
    const item = screen
      .getByText('Первая заметка')
      .closest('li') as HTMLElement;
    await user.click(
      within(item).getByRole('button', { name: 'Редактировать заметку' }),
    );
    const area = screen.getByLabelText('Текст');
    await user.clear(area);
    await user.type(area, 'Исправленная заметка');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Исправленная заметка')).toBeInTheDocument();
    expect(screen.queryByText('Первая заметка')).not.toBeInTheDocument();
    expect(store.keys()).toHaveLength(2);
  });

  it('moves a note to another target without making a copy', async () => {
    const { user, store } = await withNotes();
    const item = screen
      .getByText('Первая заметка')
      .closest('li') as HTMLElement;
    await user.click(
      within(item).getByRole('button', { name: 'Редактировать заметку' }),
    );
    await user.selectOptions(
      screen.getByLabelText('Привязка'),
      'Страница · Mobile',
    );
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await screen.findByText('Первая заметка');
    expect(
      screen.queryByRole('heading', { name: /Весь файл/ }),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByRole('heading', { name: /Страница · Mobile/ }),
      ).getByLabelText('Заметок: 2'),
    ).toBeInTheDocument();
    expect(store.keys()).toHaveLength(2);
  });

  it('completes and reopens a task without deleting it', async () => {
    const { user } = await withNotes();
    const box = screen.getByRole('checkbox', {
      name: 'Отметить задачу выполненной',
    });
    await user.click(box);
    await waitFor(() =>
      expect(screen.getByRole('checkbox')).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
    expect(screen.getByText('Сделать задачу')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Выполненные' }));
    expect(screen.getByText('Сделать задачу')).toBeInTheDocument();
    expect(screen.queryByText('Первая заметка')).not.toBeInTheDocument();
  });

  it('deletes only after confirmation', async () => {
    const { user, store } = await withNotes();
    const item = screen
      .getByText('Первая заметка')
      .closest('li') as HTMLElement;
    await user.click(
      within(item).getByRole('button', { name: 'Удалить заметку' }),
    );
    await user.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(screen.getByText('Первая заметка')).toBeInTheDocument();
    expect(store.keys()).toHaveLength(2);
    await user.click(
      within(item).getByRole('button', { name: 'Удалить заметку' }),
    );
    await user.click(screen.getByRole('button', { name: 'Удалить' }));
    await waitFor(() =>
      expect(screen.queryByText('Первая заметка')).not.toBeInTheDocument(),
    );
    expect(store.keys()).toHaveLength(1);
    // The group that became empty disappears.
    expect(
      screen.queryByRole('heading', { name: /Весь файл/ }),
    ).not.toBeInTheDocument();
  });

  it('searches and filters without changing the stored notes', async () => {
    const { user, store } = await withNotes();
    const before = store.snapshot();
    await user.type(
      screen.getByRole('searchbox', { name: 'Поиск по заметкам' }),
      'задач',
    );
    expect(screen.queryByText('Первая заметка')).not.toBeInTheDocument();
    expect(screen.getByText('Сделать задачу')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Заметки' }));
    expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Сбросить поиск и фильтры' }),
    );
    expect(screen.getByText('Первая заметка')).toBeInTheDocument();
    expect(store.snapshot()).toEqual(before);
    expect(store.writes).toHaveLength(2);
  });

  it('collapses a group without changing its count', async () => {
    const { user } = await withNotes();
    const toggle = screen.getByRole('button', { name: /Весь файл/ });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Первая заметка')).not.toBeVisible();
    expect(within(toggle).getByLabelText('Заметок: 1')).toBeInTheDocument();
  });

  it('shows only the selected frame in "По текущему выбору"', async () => {
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
      screen.getByRole('button', { name: 'Обновить список' }),
    );
    await screen.findByText('Про файл');
    await env.user.click(
      screen.getByRole('button', { name: 'По текущему выбору' }),
    );
    expect(screen.getByText('Про Checkout')).toBeInTheDocument();
    expect(screen.queryByText('Про файл')).not.toBeInTheDocument();
  });
});
