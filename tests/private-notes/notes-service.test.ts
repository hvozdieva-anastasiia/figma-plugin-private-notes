import { beforeEach, describe, expect, it } from 'vitest';
import type { Note, NoteTarget } from '../../src/shared/model';
import { createNotesService } from '../../src/plugin/notes-service';
import { noteKey } from '../../src/plugin/storage/document-notes';
import { MemoryStore } from './memory-store';

const FILE: NoteTarget = {
  type: 'file',
  id: null,
  pageId: null,
  nameSnapshot: null,
  pageNameSnapshot: null,
};
const PAGE: NoteTarget = {
  type: 'page',
  id: '0:1',
  pageId: '0:1',
  nameSnapshot: 'Page 1',
  pageNameSnapshot: 'Page 1',
};
const FRAME: NoteTarget = {
  type: 'frame',
  id: '1:4',
  pageId: '0:1',
  nameSnapshot: 'Frame One',
  pageNameSnapshot: 'Page 1',
};

let store: MemoryStore;
let user: string | null;
let clock: number;

function service(
  limits: Parameters<typeof createNotesService>[0]['limits'] = {},
) {
  return createNotesService({
    store,
    getUserId: () => user,
    now: () => clock,
    limits,
  });
}

/** Unwraps a successful result so tests read linearly. */
function value<T>(
  result: { ok: true; value: T } | { ok: false; code: string; message: string },
): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.value;
}

function code(result: { ok: boolean; code?: string }): string {
  return result.ok ? 'ok' : (result.code ?? '?');
}

function seedRaw(author: string, id: string, patch: Partial<Note> = {}): void {
  const raw: Note = {
    schemaVersion: 1,
    id,
    authorId: author,
    kind: 'note',
    text: `${author}/${id}`,
    status: null,
    target: FILE,
    createdAt: 1,
    updatedAt: 1,
    revision: 1,
    ...patch,
  };
  store.seed(noteKey(author, id), JSON.stringify(raw));
}

beforeEach(() => {
  store = new MemoryStore();
  user = '42';
  clock = 1_700_000_000_000;
});

describe('create', () => {
  it('stores a note with the author taken from the host', () => {
    const created = value(
      service().create({ id: 'n1', kind: 'note', text: 'Hello', target: PAGE }),
    );
    expect(created).toEqual({
      schemaVersion: 1,
      id: 'n1',
      authorId: '42',
      kind: 'note',
      text: 'Hello',
      status: null,
      target: PAGE,
      createdAt: clock,
      updatedAt: clock,
      revision: 1,
    });
    expect(store.keys()).toEqual([noteKey('42', 'n1')]);
  });

  it('starts a task as open', () => {
    const created = value(
      service().create({
        id: 't1',
        kind: 'task',
        text: 'Do it',
        target: FRAME,
      }),
    );
    expect(created.kind).toBe('task');
    expect(created.status).toBe('open');
  });

  it('keeps Unicode text as written', () => {
    const text = 'Привіт 😀 ✓\nдругий рядок';
    const created = value(
      service().create({ id: 'u', kind: 'note', text, target: FILE }),
    );
    expect(created.text).toBe(text);
    expect(value(service().list()).notes[0]?.text).toBe(text);
  });

  it('is idempotent for a repeated command', () => {
    const input = {
      id: 'n1',
      kind: 'note',
      text: 'Hello',
      target: PAGE,
    } as const;
    const first = value(service().create(input));
    clock += 5000;
    const again = value(service().create(input));
    expect(again).toEqual(first);
    expect(store.writes).toHaveLength(1);
    expect(store.keys()).toHaveLength(1);
  });

  it('refuses an id already used by a different note and keeps the stored one', () => {
    value(
      service().create({ id: 'n1', kind: 'note', text: 'A', target: FILE }),
    );
    const result = service().create({
      id: 'n1',
      kind: 'note',
      text: 'B',
      target: FILE,
    });
    expect(code(result)).toBe('ALREADY_EXISTS');
    expect(value(service().list()).notes[0]?.text).toBe('A');
  });

  it('does not overwrite a corrupt or future record with the same id', () => {
    store.seed(noteKey('42', 'bad'), '{nope');
    store.seed(noteKey('42', 'new'), JSON.stringify({ schemaVersion: 3 }));
    for (const id of ['bad', 'new']) {
      expect(
        code(service().create({ id, kind: 'note', text: 'x', target: FILE })),
      ).toBe('ALREADY_EXISTS');
    }
    expect(store.get(noteKey('42', 'bad'))).toBe('{nope');
    expect(store.writes).toEqual([]);
  });

  it('refuses without a current user', () => {
    user = null;
    expect(
      code(
        service().create({ id: 'n', kind: 'note', text: 'x', target: FILE }),
      ),
    ).toBe('NO_USER');
    user = '';
    expect(code(service().list())).toBe('NO_USER');
    expect(store.writes).toEqual([]);
  });

  it.each([
    [
      'unsafe id',
      { id: 'a_b', kind: 'note', text: 'x', target: FILE },
      'INVALID_ID',
    ],
    [
      'empty id',
      { id: '', kind: 'note', text: 'x', target: FILE },
      'INVALID_ID',
    ],
    [
      'bad kind',
      { id: 'n', kind: 'idea', text: 'x', target: FILE },
      'INVALID_COMMAND',
    ],
    [
      'empty text',
      { id: 'n', kind: 'note', text: ' ', target: FILE },
      'INVALID_TEXT',
    ],
    [
      'bad target',
      { id: 'n', kind: 'note', text: 'x', target: { type: 'page' } },
      'INVALID_TARGET',
    ],
  ])('refuses %s', (_name, input, expected) => {
    expect(
      code(
        service().create(
          input as unknown as Parameters<
            ReturnType<typeof service>['create']
          >[0],
        ),
      ),
    ).toBe(expected);
    expect(store.writes).toEqual([]);
  });

  it('stops at the per-author limit but only counts own keys', () => {
    seedRaw('7', 'x1');
    seedRaw('7', 'x2');
    const svc = service({ maxNotesPerAuthor: 2 });
    value(svc.create({ id: 'a', kind: 'note', text: '1', target: FILE }));
    value(svc.create({ id: 'b', kind: 'note', text: '2', target: FILE }));
    expect(
      code(svc.create({ id: 'c', kind: 'note', text: '3', target: FILE })),
    ).toBe('LIMIT_REACHED');
    // A repeated command for an existing note still succeeds at the limit.
    expect(
      code(svc.create({ id: 'a', kind: 'note', text: '1', target: FILE })),
    ).toBe('ok');
  });

  it('refuses a value over the size limit and writes nothing', () => {
    const result = service({ maxValueBytes: 200 }).create({
      id: 'big',
      kind: 'note',
      text: 'я'.repeat(200),
      target: FILE,
    });
    expect(code(result)).toBe('TOO_LARGE');
    expect(store.writes).toEqual([]);
  });

  it('reports a rejected write and leaves the document unchanged', () => {
    store.failMode = 'throw';
    const result = service().create({
      id: 'n',
      kind: 'note',
      text: 'x',
      target: FILE,
    });
    expect(code(result)).toBe('WRITE_FAILED');
    expect(store.data.size).toBe(0);
  });
});

describe('foreign author', () => {
  it('cannot reach another author note by id', () => {
    seedRaw('7', 'theirs', { text: 'private' });
    const before = store.snapshot();
    const svc = service();
    const ref = { id: 'theirs', expectedRevision: 1 };
    expect(code(svc.update({ ...ref, text: 'hacked' }))).toBe('NOT_FOUND');
    expect(code(svc.rebind({ ...ref, target: PAGE }))).toBe('NOT_FOUND');
    expect(code(svc.setStatus({ ...ref, status: 'done' }))).toBe('NOT_FOUND');
    expect(code(svc.remove(ref))).toBe('NOT_FOUND');
    expect(store.snapshot()).toEqual(before);
    expect(store.writes).toEqual([]);
  });

  it('refuses ids that try to address a different key', () => {
    seedRaw('7', 'theirs');
    for (const id of ['theirs_x', '7_theirs', '../theirs', 'a/b']) {
      expect(code(service().remove({ id, expectedRevision: 1 }))).toBe(
        'INVALID_ID',
      );
    }
  });

  it('lists only the notes of the current author', () => {
    seedRaw('7', 'theirs', { text: 'private' });
    value(
      service().create({ id: 'mine', kind: 'note', text: 'm', target: FILE }),
    );
    const report = value(service().list());
    expect(report.notes.map((n) => n.id)).toEqual(['mine']);
    expect(report.counts.otherAuthorKeys).toBe(1);
    expect(store.reads).not.toContain(noteKey('7', 'theirs'));
  });

  it('shows different people different notes in the same document', () => {
    value(
      service().create({ id: 'a', kind: 'note', text: 'mine', target: FILE }),
    );
    user = '7';
    expect(value(service().list()).notes).toEqual([]);
    expect(
      code(service().update({ id: 'a', expectedRevision: 1, text: 'x' })),
    ).toBe('NOT_FOUND');
  });

  it('refuses a record under the own key whose author inside differs', () => {
    seedRaw('42', 'forged');
    store.seed(
      noteKey('42', 'forged'),
      JSON.stringify({
        schemaVersion: 1,
        id: 'forged',
        authorId: '7',
        kind: 'note',
        text: 'x',
        status: null,
        target: FILE,
        createdAt: 1,
        updatedAt: 1,
        revision: 1,
      }),
    );
    const before = store.snapshot();
    const svc = service();
    const ref = { id: 'forged', expectedRevision: 1 };
    expect(code(svc.update({ ...ref, text: 'y' }))).toBe('AUTHOR_MISMATCH');
    expect(code(svc.remove(ref))).toBe('AUTHOR_MISMATCH');
    expect(store.snapshot()).toEqual(before);
  });
});

describe('update and revision', () => {
  beforeEach(() => {
    value(
      service().create({ id: 'n1', kind: 'note', text: 'one', target: PAGE }),
    );
    clock += 1000;
  });

  it('changes the text, bumps revision and keeps identity', () => {
    const updated = value(
      service().update({ id: 'n1', expectedRevision: 1, text: 'two' }),
    );
    expect(updated).toMatchObject({
      id: 'n1',
      authorId: '42',
      text: 'two',
      target: PAGE,
      revision: 2,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_001_000,
    });
  });

  it('refuses a stale revision and keeps the stored note', () => {
    value(service().update({ id: 'n1', expectedRevision: 1, text: 'two' }));
    const stale = service().update({
      id: 'n1',
      expectedRevision: 1,
      text: 'three',
    });
    expect(code(stale)).toBe('REVISION_CONFLICT');
    expect(value(service().list()).notes[0]?.text).toBe('two');
  });

  it('accepts a repeated command that was already applied', () => {
    const first = value(
      service().update({ id: 'n1', expectedRevision: 1, text: 'two' }),
    );
    clock += 1000;
    const again = value(
      service().update({ id: 'n1', expectedRevision: 1, text: 'two' }),
    );
    expect(again).toEqual(first);
    expect(again.revision).toBe(2);
    expect(store.writes).toHaveLength(2); // create + the first update only
  });

  it('does not write when nothing changes', () => {
    const same = value(
      service().update({ id: 'n1', expectedRevision: 1, text: 'one' }),
    );
    expect(same.revision).toBe(1);
    expect(store.writes).toHaveLength(1); // only the create
  });

  it('saves text and target in one write', () => {
    const before = store.writes.length;
    const updated = value(
      service().update({
        id: 'n1',
        expectedRevision: 1,
        text: 'moved',
        target: FRAME,
      }),
    );
    expect(updated).toMatchObject({
      text: 'moved',
      target: FRAME,
      revision: 2,
    });
    expect(store.writes.length - before).toBe(1);
  });

  it('needs something to change', () => {
    expect(code(service().update({ id: 'n1', expectedRevision: 1 }))).toBe(
      'INVALID_COMMAND',
    );
  });

  it.each([0, -1, 1.5, NaN, undefined])('refuses revision %j', (revision) => {
    expect(
      code(
        service().update({
          id: 'n1',
          expectedRevision: revision as number,
          text: 'x',
        }),
      ),
    ).toBe('INVALID_COMMAND');
  });

  it('refuses invalid text and target without writing', () => {
    const before = store.writes.length;
    expect(
      code(service().update({ id: 'n1', expectedRevision: 1, text: '' })),
    ).toBe('INVALID_TEXT');
    expect(
      code(
        service().update({
          id: 'n1',
          expectedRevision: 1,
          target: { type: 'frame' } as unknown as NoteTarget,
        }),
      ),
    ).toBe('INVALID_TARGET');
    expect(store.writes.length).toBe(before);
  });

  it('keeps the text editable when the old target is gone', () => {
    // The service does not resolve targets: a missing page or frame never blocks a text edit.
    const gone: NoteTarget = { ...FRAME, id: '9:99', pageId: '9:1' };
    value(service().rebind({ id: 'n1', expectedRevision: 1, target: gone }));
    const edited = value(
      service().update({ id: 'n1', expectedRevision: 2, text: 'still mine' }),
    );
    expect(edited.target).toEqual(gone);
    expect(edited.text).toBe('still mine');
  });

  it('reports a rejected write and keeps the stored note', () => {
    store.failMode = 'throw';
    expect(
      code(service().update({ id: 'n1', expectedRevision: 1, text: 'two' })),
    ).toBe('WRITE_FAILED');
    store.failMode = 'none';
    expect(value(service().list()).notes[0]?.revision).toBe(1);
  });

  it('reports a size overflow on update', () => {
    expect(
      code(
        service({ maxValueBytes: 300 }).update({
          id: 'n1',
          expectedRevision: 1,
          text: 'я'.repeat(300),
        }),
      ),
    ).toBe('TOO_LARGE');
  });
});

describe('rebind', () => {
  it('moves a note to another target without a duplicate', () => {
    value(
      service().create({
        id: 'n1',
        kind: 'task',
        text: 'keep me',
        target: PAGE,
      }),
    );
    value(
      service().setStatus({ id: 'n1', expectedRevision: 1, status: 'done' }),
    );
    clock += 10;
    const moved = value(
      service().rebind({ id: 'n1', expectedRevision: 2, target: FRAME }),
    );
    expect(moved).toMatchObject({
      id: 'n1',
      authorId: '42',
      createdAt: 1_700_000_000_000,
      text: 'keep me',
      status: 'done',
      target: FRAME,
      revision: 3,
    });
    expect(store.keys()).toEqual([noteKey('42', 'n1')]);
  });

  it('can move a note to the whole file', () => {
    value(
      service().create({ id: 'n1', kind: 'note', text: 'x', target: FRAME }),
    );
    const moved = value(
      service().rebind({ id: 'n1', expectedRevision: 1, target: FILE }),
    );
    expect(moved.target).toEqual(FILE);
  });

  it('refuses an invalid target and keeps the old one', () => {
    value(
      service().create({ id: 'n1', kind: 'note', text: 'x', target: PAGE }),
    );
    const result = service().rebind({
      id: 'n1',
      expectedRevision: 1,
      target: { ...PAGE, pageId: '0:9' },
    });
    expect(code(result)).toBe('INVALID_TARGET');
    expect(value(service().list()).notes[0]?.target).toEqual(PAGE);
  });

  it('is idempotent for a repeated command', () => {
    value(
      service().create({ id: 'n1', kind: 'note', text: 'x', target: PAGE }),
    );
    const first = value(
      service().rebind({ id: 'n1', expectedRevision: 1, target: FRAME }),
    );
    const again = value(
      service().rebind({ id: 'n1', expectedRevision: 1, target: FRAME }),
    );
    expect(again).toEqual(first);
  });
});

describe('task status', () => {
  it('completes and reopens a task, keeping it in the list', () => {
    value(service().create({ id: 't', kind: 'task', text: 'x', target: FILE }));
    const done = value(
      service().setStatus({ id: 't', expectedRevision: 1, status: 'done' }),
    );
    expect(done).toMatchObject({ status: 'done', revision: 2 });
    const open = value(
      service().setStatus({ id: 't', expectedRevision: 2, status: 'open' }),
    );
    expect(open).toMatchObject({ status: 'open', revision: 3 });
    expect(value(service().list()).notes).toHaveLength(1);
  });

  it('does not change text or target when the status changes', () => {
    value(
      service().create({ id: 't', kind: 'task', text: 'x', target: FRAME }),
    );
    const done = value(
      service().setStatus({ id: 't', expectedRevision: 1, status: 'done' }),
    );
    expect(done.text).toBe('x');
    expect(done.target).toEqual(FRAME);
  });

  it('refuses a status on a plain note', () => {
    value(service().create({ id: 'n', kind: 'note', text: 'x', target: FILE }));
    expect(
      code(
        service().setStatus({ id: 'n', expectedRevision: 1, status: 'done' }),
      ),
    ).toBe('INVALID_STATUS');
  });

  it('refuses an unknown status', () => {
    value(service().create({ id: 't', kind: 'task', text: 'x', target: FILE }));
    expect(
      code(
        service().setStatus({
          id: 't',
          expectedRevision: 1,
          status: 'closed' as 'done',
        }),
      ),
    ).toBe('INVALID_STATUS');
  });

  it('keeps the confirmed status when the write fails', () => {
    value(service().create({ id: 't', kind: 'task', text: 'x', target: FILE }));
    store.failMode = 'throw';
    expect(
      code(
        service().setStatus({ id: 't', expectedRevision: 1, status: 'done' }),
      ),
    ).toBe('WRITE_FAILED');
    store.failMode = 'none';
    expect(value(service().list()).notes[0]?.status).toBe('open');
  });

  it('refuses a stale revision', () => {
    value(service().create({ id: 't', kind: 'task', text: 'x', target: FILE }));
    value(
      service().setStatus({ id: 't', expectedRevision: 1, status: 'done' }),
    );
    expect(
      code(
        service().setStatus({ id: 't', expectedRevision: 1, status: 'open' }),
      ),
    ).toBe('REVISION_CONFLICT');
  });
});

describe('delete', () => {
  it('removes only the chosen note by writing an empty string', () => {
    value(service().create({ id: 'a', kind: 'note', text: '1', target: FILE }));
    value(service().create({ id: 'b', kind: 'note', text: '2', target: FILE }));
    seedRaw('7', 'theirs');
    const removed = value(service().remove({ id: 'a', expectedRevision: 1 }));
    expect(removed).toEqual({ id: 'a' });
    expect(store.writes[store.writes.length - 1]).toEqual({
      key: noteKey('42', 'a'),
      value: '',
    });
    expect(store.keys().sort()).toEqual(
      [noteKey('42', 'b'), noteKey('7', 'theirs')].sort(),
    );
  });

  it('refuses a stale revision and keeps the note', () => {
    value(service().create({ id: 'a', kind: 'note', text: '1', target: FILE }));
    value(service().update({ id: 'a', expectedRevision: 1, text: '2' }));
    expect(code(service().remove({ id: 'a', expectedRevision: 1 }))).toBe(
      'REVISION_CONFLICT',
    );
    expect(value(service().list()).notes).toHaveLength(1);
  });

  it('reports NOT_FOUND on a repeated delete', () => {
    value(service().create({ id: 'a', kind: 'note', text: '1', target: FILE }));
    value(service().remove({ id: 'a', expectedRevision: 1 }));
    expect(code(service().remove({ id: 'a', expectedRevision: 1 }))).toBe(
      'NOT_FOUND',
    );
  });

  it('does not hide a note as deleted when the write fails', () => {
    value(service().create({ id: 'a', kind: 'note', text: '1', target: FILE }));
    store.failMode = 'drop';
    expect(code(service().remove({ id: 'a', expectedRevision: 1 }))).toBe(
      'WRITE_FAILED',
    );
    store.failMode = 'none';
    expect(value(service().list()).notes).toHaveLength(1);
  });

  it('frees a slot of the per-author limit', () => {
    const svc = service({ maxNotesPerAuthor: 1 });
    value(svc.create({ id: 'a', kind: 'note', text: '1', target: FILE }));
    expect(
      code(svc.create({ id: 'b', kind: 'note', text: '2', target: FILE })),
    ).toBe('LIMIT_REACHED');
    value(svc.remove({ id: 'a', expectedRevision: 1 }));
    expect(
      code(svc.create({ id: 'b', kind: 'note', text: '2', target: FILE })),
    ).toBe('ok');
  });
});

describe('damaged and newer records', () => {
  it('lists good notes and reports the unreadable ones', () => {
    value(
      service().create({ id: 'good', kind: 'note', text: 'ok', target: FILE }),
    );
    store.seed(noteKey('42', 'broken'), 'garbage');
    store.seed(noteKey('42', 'newer'), JSON.stringify({ schemaVersion: 5 }));
    const report = value(service().list());
    expect(report.notes.map((n) => n.id)).toEqual(['good']);
    expect(report.problems.map((p) => p.reason).sort()).toEqual([
      'corrupt',
      'future-schema',
    ]);
  });

  it('never rewrites or deletes a corrupt or newer record', () => {
    store.seed(noteKey('42', 'broken'), 'garbage');
    const newer = JSON.stringify({ schemaVersion: 5, id: 'newer', extra: [1] });
    store.seed(noteKey('42', 'newer'), newer);
    const svc = service();
    const results = [
      svc.update({ id: 'broken', expectedRevision: 1, text: 'x' }),
      svc.update({ id: 'newer', expectedRevision: 1, text: 'x' }),
      svc.rebind({ id: 'newer', expectedRevision: 1, target: PAGE }),
      svc.setStatus({ id: 'newer', expectedRevision: 1, status: 'done' }),
      svc.remove({ id: 'broken', expectedRevision: 1 }),
      svc.remove({ id: 'newer', expectedRevision: 1 }),
    ].map(code);
    expect(results).toEqual([
      'CORRUPT',
      'UNSUPPORTED_SCHEMA',
      'UNSUPPORTED_SCHEMA',
      'UNSUPPORTED_SCHEMA',
      'CORRUPT',
      'UNSUPPORTED_SCHEMA',
    ]);
    expect(store.writes).toEqual([]);
    expect(store.get(noteKey('42', 'newer'))).toBe(newer);
  });
});

describe('independent keys', () => {
  it('writes only the key of the changed note', () => {
    value(service().create({ id: 'a', kind: 'note', text: '1', target: FILE }));
    value(service().create({ id: 'b', kind: 'note', text: '2', target: FILE }));
    const untouched = store.get(noteKey('42', 'b'));
    store.writes.length = 0;
    value(service().update({ id: 'a', expectedRevision: 1, text: 'changed' }));
    expect(store.writes.map((w) => w.key)).toEqual([noteKey('42', 'a')]);
    expect(store.get(noteKey('42', 'b'))).toBe(untouched);
  });

  it('keeps notes of two authors in separate keys of one document', () => {
    value(
      service().create({ id: 'a', kind: 'note', text: 'mine', target: FILE }),
    );
    user = '7';
    value(
      service().create({ id: 'a', kind: 'note', text: 'yours', target: FILE }),
    );
    expect(store.keys().sort()).toEqual(
      [noteKey('42', 'a'), noteKey('7', 'a')].sort(),
    );
    expect(value(service().list()).notes[0]?.text).toBe('yours');
    user = '42';
    expect(value(service().list()).notes[0]?.text).toBe('mine');
  });
});
