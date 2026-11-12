import { describe, expect, it } from 'vitest';
import { KEY_PREFIX, type Note } from '../../src/shared/model';
import {
  authorKeyPrefix,
  countOwnKeys,
  deleteOwnNote,
  encodeAuthorId,
  listOwnNotes,
  noteKey,
  readOwnNote,
  storeFromHost,
  writeOwnNote,
} from '../../src/plugin/storage/document-notes';
import { readCurrentUserId } from '../../src/plugin/current-user';
import { MemoryStore } from './memory-store';

function note(patch: Partial<Note> = {}): Note {
  return {
    schemaVersion: 1,
    id: 'n1',
    authorId: '42',
    kind: 'note',
    text: 'text',
    status: null,
    target: {
      type: 'file',
      id: null,
      pageId: null,
      nameSnapshot: null,
      pageNameSnapshot: null,
    },
    createdAt: 1000,
    updatedAt: 1000,
    revision: 1,
    ...patch,
  };
}

function put(store: MemoryStore, value: Note): void {
  store.seed(noteKey(value.authorId, value.id), JSON.stringify(value));
}

describe('keys', () => {
  it('uses the product prefix, the encoded author and the note id', () => {
    expect(noteKey('42', 'abc-1')).toBe('private_notes_note_42_abc-1');
    expect(KEY_PREFIX).toBe('private_notes_note_');
  });

  it('keeps the author part free of the separator', () => {
    expect(encodeAuthorId('a_b')).toBe('a%5Fb');
    expect(encodeAuthorId('a b/ü')).not.toMatch(/[_ /]/);
  });

  it('does not let one author prefix match the keys of another', () => {
    const pairs = [
      ['a', 'a_b'],
      ['12', '123'],
      ['a_b', 'a'],
      ['1', '1%5F2'],
    ] as const;
    for (const [first, second] of pairs) {
      expect(noteKey(second, 'x').startsWith(authorKeyPrefix(first))).toBe(
        false,
      );
    }
  });
});

describe('listing', () => {
  it('returns only the current author notes, sorted by creation time', () => {
    const store = new MemoryStore();
    put(store, note({ id: 'late', createdAt: 3000 }));
    put(store, note({ id: 'early', createdAt: 1000 }));
    put(store, note({ id: 'other', authorId: '7' }));
    const report = listOwnNotes(store, '42');
    expect(report.notes.map((n) => n.id)).toEqual(['early', 'late']);
    expect(report.problems).toEqual([]);
    expect(report.counts).toEqual({
      rootKeys: 3,
      ownKeys: 2,
      otherAuthorKeys: 1,
    });
  });

  it('never reads values of other authors or foreign keys', () => {
    const store = new MemoryStore();
    put(store, note({ id: 'mine' }));
    put(store, note({ id: 'secret', authorId: '7', text: 'not yours' }));
    store.seed('unrelated_key', 'whatever');
    listOwnNotes(store, '42');
    expect(store.reads).toEqual([noteKey('42', 'mine')]);
  });

  it('does not use a shared index', () => {
    const store = new MemoryStore();
    put(store, note());
    expect(store.keys()).toEqual(['private_notes_note_42_n1']);
  });

  it('keeps good notes when one own record is corrupt', () => {
    const store = new MemoryStore();
    put(store, note({ id: 'good' }));
    store.seed(noteKey('42', 'broken'), '{not json');
    const report = listOwnNotes(store, '42');
    expect(report.notes.map((n) => n.id)).toEqual(['good']);
    expect(report.problems).toEqual([
      expect.objectContaining({ noteId: 'broken', reason: 'corrupt' }),
    ]);
    expect(report.counts.ownKeys).toBe(2);
  });

  it('reports a future schema without dropping the other notes', () => {
    const store = new MemoryStore();
    put(store, note({ id: 'good' }));
    store.seed(
      noteKey('42', 'new'),
      JSON.stringify({ schemaVersion: 2, id: 'new', authorId: '42' }),
    );
    const report = listOwnNotes(store, '42');
    expect(report.notes).toHaveLength(1);
    expect(report.problems[0]).toMatchObject({
      noteId: 'new',
      reason: 'future-schema',
    });
  });

  it('refuses a record whose author inside differs from the key author', () => {
    const store = new MemoryStore();
    store.seed(
      noteKey('42', 'forged'),
      JSON.stringify(note({ id: 'forged', authorId: '7' })),
    );
    const report = listOwnNotes(store, '42');
    expect(report.notes).toEqual([]);
    expect(report.problems[0]).toMatchObject({ reason: 'author-mismatch' });
  });

  it('refuses a record whose id inside differs from the key', () => {
    const store = new MemoryStore();
    store.seed(
      noteKey('42', 'key-id'),
      JSON.stringify(note({ id: 'other-id' })),
    );
    expect(listOwnNotes(store, '42').problems[0]).toMatchObject({
      reason: 'key-mismatch',
    });
  });

  it('reports an own key without a valid note id', () => {
    const store = new MemoryStore();
    store.seed(authorKeyPrefix('42') + 'a_b', '{}');
    expect(listOwnNotes(store, '42').problems[0]).toMatchObject({
      noteId: null,
      reason: 'bad-key',
    });
  });

  it('gives an empty report for a document without notes', () => {
    expect(listOwnNotes(new MemoryStore(), '42')).toEqual({
      notes: [],
      problems: [],
      counts: { rootKeys: 0, ownKeys: 0, otherAuthorKeys: 0 },
    });
  });

  it('counts own keys including unreadable ones', () => {
    const store = new MemoryStore();
    put(store, note({ id: 'a' }));
    store.seed(noteKey('42', 'b'), 'junk');
    put(store, note({ id: 'c', authorId: '7' }));
    expect(countOwnKeys(store, '42')).toBe(2);
  });
});

describe('reading one note', () => {
  it('reads an own note', () => {
    const store = new MemoryStore();
    put(store, note());
    const result = readOwnNote(store, '42', 'n1');
    expect(result.ok && result.value.id).toBe('n1');
  });

  it('returns NOT_FOUND for the id of another author note', () => {
    const store = new MemoryStore();
    put(store, note({ id: 'theirs', authorId: '7' }));
    const result = readOwnNote(store, '42', 'theirs');
    expect(result.ok === false && result.code).toBe('NOT_FOUND');
    expect(store.reads).toEqual([noteKey('42', 'theirs')]);
  });

  it.each(['', 'a_b', '../x', 'a/b', 5])('refuses id %j', (id) => {
    const result = readOwnNote(new MemoryStore(), '42', id);
    expect(result.ok === false && result.code).toBe('INVALID_ID');
  });

  it('distinguishes corrupt, future and forged records', () => {
    const store = new MemoryStore();
    store.seed(noteKey('42', 'c'), 'nope');
    store.seed(noteKey('42', 'f'), JSON.stringify({ schemaVersion: 9 }));
    store.seed(
      noteKey('42', 'm'),
      JSON.stringify(note({ id: 'm', authorId: '7' })),
    );
    const code = (id: string) => {
      const r = readOwnNote(store, '42', id);
      return r.ok ? 'ok' : r.code;
    };
    expect(code('c')).toBe('CORRUPT');
    expect(code('f')).toBe('UNSUPPORTED_SCHEMA');
    expect(code('m')).toBe('AUTHOR_MISMATCH');
  });
});

describe('writing', () => {
  it('writes one key and leaves the others alone', () => {
    const store = new MemoryStore();
    put(store, note({ id: 'other' }));
    const before = store.snapshot();
    const result = writeOwnNote(store, '42', note({ id: 'fresh' }));
    expect(result.ok).toBe(true);
    expect(store.writes).toHaveLength(1);
    expect(store.writes[0]?.key).toBe(noteKey('42', 'fresh'));
    expect(store.get(noteKey('42', 'other'))).toBe(
      before[noteKey('42', 'other')],
    );
  });

  it('refuses to write a note of another author', () => {
    const store = new MemoryStore();
    const result = writeOwnNote(store, '42', note({ authorId: '7' }));
    expect(result.ok === false && result.code).toBe('AUTHOR_MISMATCH');
    expect(store.writes).toEqual([]);
  });

  it('refuses a value over the byte limit without writing', () => {
    const store = new MemoryStore();
    const result = writeOwnNote(store, '42', note({ text: 'я'.repeat(100) }), {
      maxValueBytes: 150,
    });
    expect(result.ok === false && result.code).toBe('TOO_LARGE');
    expect(store.writes).toEqual([]);
  });

  it('measures the limit in bytes, not in characters', () => {
    const value = note({ text: 'ы'.repeat(40) });
    const chars = JSON.stringify(value).length;
    expect(
      writeOwnNote(new MemoryStore(), '42', value, { maxValueBytes: chars }).ok,
    ).toBe(false);
    expect(
      writeOwnNote(new MemoryStore(), '42', value, {
        maxValueBytes: chars + 40,
      }).ok,
    ).toBe(true);
  });

  it('turns a thrown write into WRITE_FAILED', () => {
    const store = new MemoryStore();
    store.failMode = 'throw';
    const result = writeOwnNote(store, '42', note());
    expect(result.ok === false && result.code).toBe('WRITE_FAILED');
    expect(store.data.size).toBe(0);
  });

  it('turns a write that did not stick into WRITE_FAILED', () => {
    const store = new MemoryStore();
    store.failMode = 'drop';
    const result = writeOwnNote(store, '42', note());
    expect(result.ok === false && result.code).toBe('WRITE_FAILED');
  });
});

describe('deleting', () => {
  it('removes exactly one key by writing an empty string', () => {
    const store = new MemoryStore();
    put(store, note({ id: 'a' }));
    put(store, note({ id: 'b' }));
    expect(deleteOwnNote(store, '42', 'a').ok).toBe(true);
    expect(store.writes).toEqual([{ key: noteKey('42', 'a'), value: '' }]);
    expect(store.keys()).toEqual([noteKey('42', 'b')]);
  });

  it('reports a delete that did not take effect', () => {
    const store = new MemoryStore();
    put(store, note());
    store.failMode = 'drop';
    const result = deleteOwnNote(store, '42', 'n1');
    expect(result.ok === false && result.code).toBe('WRITE_FAILED');
    expect(store.keys()).toHaveLength(1);
  });

  it('refuses an unsafe id', () => {
    const result = deleteOwnNote(new MemoryStore(), '42', 'a_b');
    expect(result.ok === false && result.code).toBe('INVALID_ID');
  });
});

describe('figma.root adapter', () => {
  it('maps the pluginData API onto the store', () => {
    const map = new Map<string, string>();
    const host = {
      getPluginDataKeys: () => [...map.keys()],
      getPluginData: (key: string) => map.get(key) ?? '',
      setPluginData: (key: string, value: string) => {
        if (value === '') map.delete(key);
        else map.set(key, value);
      },
    };
    const store = storeFromHost(host);
    expect(writeOwnNote(store, '42', note()).ok).toBe(true);
    expect(listOwnNotes(store, '42').notes).toHaveLength(1);
    expect(deleteOwnNote(store, '42', 'n1').ok).toBe(true);
    expect(map.size).toBe(0);
  });
});

describe('current user', () => {
  it('returns the Figma user id', () => {
    expect(readCurrentUserId({ currentUser: { id: '42' } })).toBe('42');
  });

  it.each([
    ['no user', { currentUser: null }],
    ['null id', { currentUser: { id: null } }],
    ['empty id', { currentUser: { id: '' } }],
  ])('returns null for %s', (_name, host) => {
    expect(readCurrentUserId(host)).toBeNull();
  });
});
