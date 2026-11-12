import { beforeEach, describe, expect, it } from 'vitest';
import type { NoteTarget, Result } from '../../src/shared/model';
import {
  PROTOCOL_VERSION,
  parseCommand,
  readMessageIds,
  type DocumentContext,
} from '../../src/shared/messages';
import { createCommandHandler } from '../../src/plugin/handlers';
import { createNotesService } from '../../src/plugin/notes-service';
import { noteKey } from '../../src/plugin/storage/document-notes';
import { FILE, frame, page } from './fixtures';
import { MemoryStore } from './memory-store';

const ids = { requestId: 'r1', runId: 'run1' };
const command = (type: string, payload: unknown, extra = {}) => ({
  protocolVersion: PROTOCOL_VERSION,
  type,
  ...ids,
  payload,
  ...extra,
});

describe('command parsing', () => {
  it('accepts every command and drops unknown fields, including an author', () => {
    const parsed = parseCommand(
      command(
        'CREATE_NOTE',
        {
          id: 'n1',
          kind: 'task',
          text: 'x',
          target: FILE,
          authorId: 'evil',
        },
        { authorId: 'evil' },
      ),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(JSON.stringify(parsed.value)).not.toContain('evil');
    }
    for (const [type, payload] of [
      ['READY', {}],
      ['REFRESH_NOTES', {}],
      ['LIST_TARGETS', { kind: 'frame', pageId: '0:1', query: '' }],
      ['UPDATE_NOTE', { id: 'a', expectedRevision: 1, text: 't' }],
      ['SET_TASK_STATUS', { id: 'a', expectedRevision: 1, status: 'done' }],
      ['DELETE_NOTE', { id: 'a', expectedRevision: 1 }],
      ['REBIND_NOTE', { id: 'a', expectedRevision: 1, target: FILE }],
    ] as const) {
      expect(parseCommand(command(type, payload)).ok).toBe(true);
    }
  });

  it.each([
    ['not an object', 'x'],
    ['wrong protocol', { ...command('READY', {}), protocolVersion: 99 }],
    ['unknown type', command('DROP_ALL', {})],
    ['no requestId', { ...command('READY', {}), requestId: '' }],
    ['no runId', { ...command('READY', {}), runId: undefined }],
    ['payload not an object', command('READY', null)],
    [
      'bad kind',
      command('CREATE_NOTE', { id: 'a', kind: 'x', text: 't', target: FILE }),
    ],
    [
      'bad target',
      command('CREATE_NOTE', {
        id: 'a',
        kind: 'note',
        text: 't',
        target: { type: 'page' },
      }),
    ],
    [
      'bad revision',
      command('DELETE_NOTE', { id: 'a', expectedRevision: '1' }),
    ],
    [
      'bad status',
      command('SET_TASK_STATUS', { id: 'a', expectedRevision: 1, status: 'x' }),
    ],
    [
      'bad list kind',
      command('LIST_TARGETS', { kind: 'node', pageId: null, query: '' }),
    ],
  ])('refuses %s', (_name, raw) => {
    expect(parseCommand(raw).ok).toBe(false);
  });

  it('reads ids only from a well-formed envelope', () => {
    expect(readMessageIds(command('READY', {}))).toEqual({
      command: 'READY',
      ...ids,
    });
    expect(readMessageIds({ type: 'READY' })).toBeNull();
    expect(readMessageIds(null)).toBeNull();
  });
});

describe('command handler', () => {
  const context: DocumentContext = {
    page: { id: '0:1', name: 'Mobile' },
    selection: [],
    selectionCount: 0,
  };
  const known: Record<string, NoteTarget> = {
    '0:1': page('0:1', 'Mobile (now)'),
    '1:4': frame('1:4', 'Checkout (now)', '0:7', 'Moved page'),
  };
  let store: MemoryStore;
  let user: string | null;
  let resolved: string[];
  let broken: boolean;

  function handler() {
    return createCommandHandler({
      service: createNotesService({
        store,
        getUserId: () => user,
        now: () => 5000,
      }),
      getContext: () => context,
      resolveTarget: (target): Promise<Result<NoteTarget>> => {
        if (broken) return Promise.reject(new Error('API down'));
        if (target.type === 'file')
          return Promise.resolve({ ok: true, value: target });
        resolved.push(target.id);
        const found = known[target.id];
        return Promise.resolve(
          found
            ? { ok: true, value: found }
            : {
                ok: false,
                code: 'TARGET_NOT_FOUND',
                message: 'Фрейм не найден',
              },
        );
      },
      listTargets: (request) =>
        Promise.resolve({
          ok: true,
          value: {
            options: [
              {
                type: request.kind,
                id: '1:4',
                pageId: '0:1',
                name: request.query,
                pageName: 'Mobile',
              },
            ],
            truncated: false,
          },
        }),
    });
  }

  async function send(type: string, payload: unknown) {
    const response = await handler()(command(type, payload));
    if (!response) throw new Error('no response');
    return response;
  }

  beforeEach(() => {
    store = new MemoryStore();
    user = '42';
    resolved = [];
    broken = false;
  });

  it('answers READY with the own notes, the problems and the context', async () => {
    store.seed(noteKey('42', 'bad'), '{nope');
    await send('CREATE_NOTE', {
      id: 'a',
      kind: 'note',
      text: 'hi',
      target: FILE,
    });
    const response = await send('READY', {});
    expect(response).toMatchObject({
      type: 'RESPONSE',
      command: 'READY',
      ...ids,
    });
    if (response.command !== 'READY' || !response.result.ok)
      throw new Error('bad');
    expect(response.result.value.notes).toHaveLength(1);
    expect(response.result.value.context).toEqual(context);
    expect(response.result.value.problems).toEqual([
      { noteId: 'bad', reason: 'corrupt', detail: 'invalid JSON' },
    ]);
    expect(JSON.stringify(response)).not.toContain('private_notes_note_');
  });

  it('uses the author from the host and ignores any author in the command', async () => {
    await handler()(
      command(
        'CREATE_NOTE',
        { id: 'a', kind: 'note', text: 'mine', target: FILE, authorId: '7' },
        { authorId: '7' },
      ),
    );
    expect(store.keys()).toEqual([noteKey('42', 'a')]);
  });

  it('refuses without a current user', async () => {
    user = null;
    const response = await send('READY', {});
    expect(response.result).toMatchObject({ ok: false, code: 'NO_USER' });
  });

  it('checks a new target and stores the names Figma reports now', async () => {
    const response = await send('CREATE_NOTE', {
      id: 'a',
      kind: 'note',
      text: 'x',
      target: frame('1:4', 'Old name', '0:1', 'Old page'),
    });
    if (response.command !== 'CREATE_NOTE' || !response.result.ok)
      throw new Error('bad');
    expect(response.result.value.target).toEqual(known['1:4']);
  });

  it('refuses a target that does not exist and writes nothing', async () => {
    const response = await send('CREATE_NOTE', {
      id: 'a',
      kind: 'note',
      text: 'x',
      target: frame('9:9', 'Gone', '0:1', 'Mobile'),
    });
    expect(response.result).toMatchObject({
      ok: false,
      code: 'TARGET_NOT_FOUND',
    });
    expect(store.writes).toEqual([]);
  });

  it('lets the text of a note be edited without checking its old target', async () => {
    await send('CREATE_NOTE', {
      id: 'a',
      kind: 'note',
      text: 'x',
      target: page('0:1', 'Mobile'),
    });
    resolved.length = 0;
    const response = await send('UPDATE_NOTE', {
      id: 'a',
      expectedRevision: 1,
      text: 'edited',
    });
    expect(response.result).toMatchObject({ ok: true });
    expect(resolved).toEqual([]);
  });

  it('checks a changed target on update and on rebind', async () => {
    await send('CREATE_NOTE', {
      id: 'a',
      kind: 'note',
      text: 'x',
      target: FILE,
    });
    const lost = frame('9:9', 'Gone', '0:1', 'Mobile');
    const update = await send('UPDATE_NOTE', {
      id: 'a',
      expectedRevision: 1,
      target: lost,
    });
    const rebind = await send('REBIND_NOTE', {
      id: 'a',
      expectedRevision: 1,
      target: lost,
    });
    expect(update.result).toMatchObject({
      ok: false,
      code: 'TARGET_NOT_FOUND',
    });
    expect(rebind.result).toMatchObject({
      ok: false,
      code: 'TARGET_NOT_FOUND',
    });
    const ok = await send('REBIND_NOTE', {
      id: 'a',
      expectedRevision: 1,
      target: frame('1:4', 'x', '0:1', 'x'),
    });
    expect(ok.result).toMatchObject({
      ok: true,
      value: { revision: 2, id: 'a' },
    });
  });

  it('changes status, refuses stale revisions and deletes', async () => {
    await send('CREATE_NOTE', {
      id: 't',
      kind: 'task',
      text: 'x',
      target: FILE,
    });
    const done = await send('SET_TASK_STATUS', {
      id: 't',
      expectedRevision: 1,
      status: 'done',
    });
    expect(done.result).toMatchObject({ ok: true, value: { status: 'done' } });
    const stale = await send('DELETE_NOTE', { id: 't', expectedRevision: 1 });
    expect(stale.result).toMatchObject({
      ok: false,
      code: 'REVISION_CONFLICT',
    });
    const removed = await send('DELETE_NOTE', { id: 't', expectedRevision: 2 });
    expect(removed.result).toMatchObject({ ok: true, value: { id: 't' } });
    expect(store.keys()).toEqual([]);
  });

  it('cannot touch the note of another author', async () => {
    store.seed(
      noteKey('7', 'theirs'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'theirs',
        authorId: '7',
        kind: 'note',
        text: 'private',
        status: null,
        target: FILE,
        createdAt: 1,
        updatedAt: 1,
        revision: 1,
      }),
    );
    const response = await send('DELETE_NOTE', {
      id: 'theirs',
      expectedRevision: 1,
    });
    expect(response.result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(store.writes).toEqual([]);
  });

  it('passes target listing through', async () => {
    const response = await send('LIST_TARGETS', {
      kind: 'frame',
      pageId: '0:1',
      query: 'Cart',
    });
    expect(response.result).toMatchObject({ ok: true });
  });

  it('answers a malformed command that still names its request', async () => {
    const response = await handler()(
      command('CREATE_NOTE', { id: 'a', kind: 'bad' }),
    );
    expect(response).toMatchObject({ command: 'CREATE_NOTE', ...ids });
    expect(response?.result).toMatchObject({
      ok: false,
      code: 'INVALID_MESSAGE',
    });
  });

  it('stays silent for a message that cannot be answered', async () => {
    expect(await handler()({ foo: 1 })).toBeNull();
    expect(await handler()('hello')).toBeNull();
  });

  it('reports a Figma API exception as a failure, not as success', async () => {
    broken = true;
    const response = await send('CREATE_NOTE', {
      id: 'a',
      kind: 'note',
      text: 'x',
      target: page('0:1', 'Mobile'),
    });
    expect(response.result).toMatchObject({ ok: false, code: 'INTERNAL' });
    expect(store.writes).toEqual([]);
  });
});
