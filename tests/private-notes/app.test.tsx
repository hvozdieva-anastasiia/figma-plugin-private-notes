import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { NoteTarget } from '../../src/shared/model';
import {
  PROTOCOL_VERSION,
  type DocumentContext,
  type TargetResolution,
} from '../../src/shared/messages';
import { createCommandHandler } from '../../src/plugin/handlers';
import { createNotesService } from '../../src/plugin/notes-service';
import { noteKey } from '../../src/plugin/storage/document-notes';
import { App } from '../../src/ui/App';
import { createBridge, type Transport } from '../../src/ui/bridge';
import { NotesProvider } from '../../src/ui/NotesProvider';
import { FILE, frame, page } from './fixtures';
import { MemoryStore } from './memory-store';

interface Live {
  name: string;
  pageId: string;
  pageName: string;
}

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
  /** What Figma currently says about targets; unlisted targets are as they were saved. */
  const world: Record<string, Live | 'missing' | 'error'> = {};
  const asked: string[][] = [];
  const focused: string[] = [];
  const snapshotOf = (id: string): Live => {
    const listed = service.list();
    const found = listed.ok
      ? listed.value.notes.find((note) => note.target.id === id)
      : undefined;
    return {
      name: found?.target.nameSnapshot ?? '',
      pageId: found?.target.pageId ?? '',
      pageName: found?.target.pageNameSnapshot ?? '',
    };
  };
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
    resolveTargets: (targets) => {
      asked.push(targets.map((t) => t.id));
      return Promise.resolve(
        targets.map((t): TargetResolution => {
          const entry = world[t.id] ?? snapshotOf(t.id);
          if (entry === 'missing')
            return { type: t.type, id: t.id, state: 'missing' };
          if (entry === 'error')
            return { type: t.type, id: t.id, state: 'error' };
          return { type: t.type, id: t.id, state: 'available', ...entry };
        }),
      );
    },
    focusTarget: (target) => {
      if (target.type === 'file') {
        return Promise.resolve({
          ok: false as const,
          code: 'INVALID_TARGET' as const,
          message: '',
        });
      }
      const entry = world[target.id];
      if (entry === 'error') return Promise.reject(new Error('API down'));
      if (entry === 'missing') {
        return Promise.resolve({
          ok: false as const,
          code: 'TARGET_NOT_FOUND' as const,
          message: 'Фрейм не найден',
        });
      }
      focused.push(target.id);
      return Promise.resolve({
        ok: true as const,
        value: { outcome: target.type, pageSwitched: false },
      });
    },
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
    world,
    asked,
    focused,
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

describe('targets', () => {
  const FRAME = frame('1:4', 'Checkout', '0:1', 'Mobile');

  async function withTargetNotes() {
    const env = setup();
    seed(env.service, 'f', 'Про фрейм', FRAME);
    seed(env.service, 'p', 'Про страницу', page('0:1', 'Mobile'));
    seed(env.service, 'w', 'Про файл', FILE);
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Обновить список' }),
    );
    await screen.findByText('Про фрейм');
    return env;
  }

  async function refresh(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Обновить список' }));
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
      await screen.findByRole('heading', { name: /Фрейм · Payment/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Страница · Mobile app/ }),
    ).toBeInTheDocument();
  });

  it('shows a moved frame under the page it is on now', async () => {
    const env = setup();
    seed(env.service, 'f', 'Про фрейм', FRAME);
    env.world['1:4'] = { name: 'Checkout', pageId: '0:2', pageName: 'Desktop' };
    await ready();
    await refresh(env.user);
    expect(
      await screen.findByRole('heading', { name: /Страница · Desktop/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Страница · Mobile/ }),
    ).not.toBeInTheDocument();
  });

  it('moves a note of a deleted frame to "Без доступной привязки" and keeps its text', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'missing';
    await refresh(env.user);
    const group = await screen.findByRole('heading', {
      name: /Без доступной привязки/,
    });
    expect(within(group).getByLabelText('Заметок: 1')).toBeInTheDocument();
    expect(screen.getByText('Про фрейм')).toBeInTheDocument();
    expect(
      screen.getByText(/цель не найдена, текст сохранён/),
    ).toBeInTheDocument();
    // Nothing was turned into a whole-file note and nothing was rewritten.
    const stored = storedFrameNote(env.store);
    expect(stored.target).toEqual(FRAME);
    expect(stored.revision).toBe(1);
  });

  it('brings the note back when Undo restores the target and the list is refreshed', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'missing';
    await refresh(env.user);
    await screen.findByRole('heading', { name: /Без доступной привязки/ });
    delete env.world['1:4'];
    await refresh(env.user);
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Без доступной привязки/ }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: /Фрейм · Checkout/ }),
    ).toBeInTheDocument();
  });

  it('does not call a target lost when the check itself fails, and retries on request', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'error';
    await refresh(env.user);
    expect(
      await screen.findByText(/Не удалось проверить привязку/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Без доступной привязки/ }),
    ).not.toBeInTheDocument();
    const before = env.asked.flat().length;
    delete env.world['1:4'];
    await env.user.click(
      screen.getByRole('button', { name: 'Проверить снова' }),
    );
    await waitFor(() =>
      expect(env.asked.flat().length).toBeGreaterThan(before),
    );
    await waitFor(() =>
      expect(
        screen.queryByText(/Не удалось проверить привязку/),
      ).not.toBeInTheDocument(),
    );
  });

  it('moves to the target of a note and keeps the window open', async () => {
    const env = await withTargetNotes();
    const item = screen.getByText('Про фрейм').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Перейти к привязке' }),
    );
    await waitFor(() => expect(env.focused).toEqual(['1:4']));
    expect(
      screen.getByRole('button', { name: /Добавить заметку/ }),
    ).toBeInTheDocument();
  });

  it('offers no move for a whole-file note', async () => {
    await withTargetNotes();
    const item = screen.getByText('Про файл').closest('li') as HTMLElement;
    expect(
      within(item).queryByRole('button', { name: 'Перейти к привязке' }),
    ).toBeNull();
  });

  it('moves a note to the lost group when a move finds the target gone', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'missing';
    const item = screen.getByText('Про фрейм').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Перейти к привязке' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Фрейм не найден',
    );
    expect(
      await screen.findByRole('heading', { name: /Без доступной привязки/ }),
    ).toBeInTheDocument();
  });

  it('keeps a note in place when a move fails because of an API error', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'error';
    const item = screen.getByText('Про фрейм').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Перейти к привязке' }),
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /Без доступной привязки/ }),
    ).not.toBeInTheDocument();
  });

  it('rebinds a lost note to another target explicitly, with the same id and text', async () => {
    const env = await withTargetNotes();
    env.world['1:4'] = 'missing';
    await refresh(env.user);
    await screen.findByRole('heading', { name: /Без доступной привязки/ });
    await env.user.click(screen.getByRole('button', { name: 'Перепривязать' }));
    // The editor opens on the old target with the choice of another one open.
    expect(
      screen.getByRole('group', { name: 'Выбор другой привязки' }),
    ).toBeInTheDocument();
    await env.user.click(screen.getByRole('button', { name: 'Закрыть выбор' }));
    await env.user.selectOptions(
      screen.getByLabelText('Привязка'),
      'Страница · Mobile',
    );
    await env.user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: /Без доступной привязки/ }),
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
    await screen.findByRole('heading', { name: /Без доступной привязки/ });
    const item = screen.getByText('Про фрейм').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Редактировать заметку' }),
    );
    const area = screen.getByLabelText('Текст');
    await env.user.clear(area);
    await env.user.type(area, 'Новый текст');
    await env.user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Новый текст')).toBeInTheDocument();
    // The old target is gone, yet the text was saved and the target was not touched.
    expect(storedFrameNote(env.store).target).toEqual(FRAME);
    const again = screen.getByText('Новый текст').closest('li') as HTMLElement;
    await env.user.click(
      within(again).getByRole('button', { name: 'Удалить заметку' }),
    );
    await env.user.click(screen.getByRole('button', { name: 'Удалить' }));
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
      screen.getByRole('button', { name: 'По текущему выбору' }),
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
