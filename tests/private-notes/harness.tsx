import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NoteTarget } from '../../src/shared/model';
import {
  PROTOCOL_VERSION,
  clampWindow,
  type DocumentContext,
  type TargetResolution,
  type WindowSize,
} from '../../src/shared/messages';
import { createCommandHandler } from '../../src/plugin/handlers';
import { createNotesService } from '../../src/plugin/notes-service';
import { listOwnNotes } from '../../src/plugin/storage/document-notes';
import { App } from '../../src/ui/App';
import { createBridge, type Transport } from '../../src/ui/bridge';
import { NotesProvider } from '../../src/ui/NotesProvider';
import { MemoryStore } from './memory-store';

export interface Live {
  name: string;
  pageId: string;
  pageName: string;
}

export const PAGE_CONTEXT: DocumentContext = {
  page: { id: '0:1', name: 'Mobile' },
  selection: [],
  selectionCount: 0,
};
export const FRAME_CONTEXT: DocumentContext = {
  page: { id: '0:1', name: 'Mobile' },
  selection: [{ id: '1:4', type: 'FRAME', name: 'Checkout' }],
  selectionCount: 1,
};

/** The real UI, bridge, command handler and notes service over an in-memory document. */
export function setup(initial: DocumentContext = PAGE_CONTEXT) {
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
  const resized: WindowSize[] = [];
  const snapshotOf = (id: string): Live => {
    // Read the repository directly: tests that count `service.list` calls must
    // not see this helper.
    const found = listOwnNotes(store, '42').notes.find(
      (note) => note.target.id === id,
    );
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
      target.type !== 'file' && world[target.id] === 'missing'
        ? Promise.resolve({
            ok: false as const,
            code: 'TARGET_NOT_FOUND' as const,
            message: 'Page not found',
          })
        : Promise.resolve({ ok: true as const, value: target }),
    resizeWindow: (size) => {
      resized.push(size);
      return clampWindow(size.width, size.height);
    },
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
          message: 'Frame not found',
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
    resized,
    user: userEvent.setup(),
    /** Changes what Figma reports, without telling the window (a rename, for example). */
    setContext(next: DocumentContext) {
      context = next;
    },
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

export function seed(
  service: ReturnType<typeof createNotesService>,
  id: string,
  text: string,
  target: NoteTarget,
  kind: 'note' | 'task' = 'note',
) {
  const result = service.create({ id, kind, text, target });
  if (!result.ok) throw new Error(result.message);
}

export async function ready() {
  await screen.findByRole('button', { name: 'Add note' });
}
