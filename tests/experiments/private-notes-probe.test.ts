// Unit tests for the stage 2 probe's author-check logic. They run against an
// in-memory pluginData model and prove nothing about real Figma behaviour.
import { describe, expect, it } from 'vitest';
import {
  PROBE_KEY_PREFIX,
  SYNTHETIC_FOREIGN_AUTHOR_ID,
  SYNTHETIC_FOREIGN_NOTE_ID,
  SYNTHETIC_TAMPERED_NOTE_ID,
  cleanProbeData,
  createNote,
  deleteNote,
  encodeAuthorId,
  listOwnNotes,
  noteKey,
  parseNote,
  seedSyntheticForeign,
  splitProbeKey,
  updateNote,
  type PluginDataStore,
  type ProbeTarget,
} from '../../experiments/private-notes/probe-core';
import { parseRequest } from '../../experiments/private-notes/protocol';

class MemoryStore implements PluginDataStore {
  readonly data = new Map<string, string>();
  readSpy: string[] = [];
  failWrites = false;
  keys(): string[] {
    return [...this.data.keys()];
  }
  get(key: string): string {
    this.readSpy.push(key);
    return this.data.get(key) ?? '';
  }
  set(key: string, value: string): void {
    if (this.failWrites) throw new Error('write rejected');
    if (value === '') this.data.delete(key);
    else this.data.set(key, value);
  }
}

const file: ProbeTarget = {
  type: 'file',
  id: null,
  pageId: null,
  nameSnapshot: null,
  pageNameSnapshot: null,
  nodeType: null,
};
const frame: ProbeTarget = {
  type: 'frame',
  id: '1:2',
  pageId: '0:1',
  nameSnapshot: 'Checkout',
  pageNameSnapshot: 'Mobile',
  nodeType: 'FRAME',
};
const ALICE = '1111';
const BOB = '2222';

function ref(
  noteId: string,
  claimed: string | null = null,
  rev: number | null = null,
) {
  return { noteId, claimedAuthorId: claimed, expectedRevision: rev };
}

describe('keys', () => {
  it('escapes underscores so author parts cannot collide', () => {
    expect(encodeAuthorId('a_b')).toBe('a%5Fb');
    const a = noteKey('a_b', 'n1');
    const b = noteKey('a', 'b_n1');
    expect(a).not.toBe(b);
    expect(splitProbeKey(a)).toEqual({ authorPart: 'a%5Fb', noteId: 'n1' });
    expect(splitProbeKey(b)).toBeNull();
  });

  it('never matches the product prefix', () => {
    expect(PROBE_KEY_PREFIX).not.toContain('private_notes_note_');
    expect(splitProbeKey('private_notes_note_1111_abc')).toBeNull();
  });
});

describe('create and list', () => {
  it('stores author, text and target from the caller, not from input', () => {
    const store = new MemoryStore();
    const created = createNote(store, ALICE, 100, {
      id: 'n1',
      text: 'hi',
      target: frame,
    });
    expect(created.ok).toBe(true);
    const raw = store.data.get(noteKey(ALICE, 'n1')) ?? '';
    expect(JSON.parse(raw)).toMatchObject({
      authorId: ALICE,
      text: 'hi',
      revision: 1,
      target: { type: 'frame', id: '1:2' },
    });
  });

  it('is idempotent for identical data and rejects a different value for the same id', () => {
    const store = new MemoryStore();
    const input = { id: 'n1', text: 'hi', target: file };
    expect(createNote(store, ALICE, 1, input).ok).toBe(true);
    expect(createNote(store, ALICE, 2, input).ok).toBe(true);
    expect(store.data.size).toBe(1);
    const clash = createNote(store, ALICE, 3, { ...input, text: 'other' });
    expect(clash).toMatchObject({ ok: false, code: 'ALREADY_EXISTS' });
  });

  it('rejects bad ids, empty text, bad targets and a missing user', () => {
    const store = new MemoryStore();
    const base = { id: 'n1', text: 'hi', target: file };
    expect(createNote(store, ALICE, 1, { ...base, id: 'a_b' })).toMatchObject({
      code: 'INVALID_ID',
    });
    expect(createNote(store, ALICE, 1, { ...base, text: '  ' })).toMatchObject({
      code: 'INVALID_TEXT',
    });
    expect(
      createNote(store, ALICE, 1, { ...base, target: { ...frame, id: null } }),
    ).toMatchObject({ code: 'INVALID_TARGET' });
    expect(
      createNote(store, ALICE, 1, { ...base, target: { ...file, id: '1:1' } }),
    ).toMatchObject({ code: 'INVALID_TARGET' });
    expect(createNote(store, null, 1, base)).toMatchObject({ code: 'NO_USER' });
    expect(store.data.size).toBe(0);
  });

  it('lists only own notes and counts, but never reads, other authors', () => {
    const store = new MemoryStore();
    createNote(store, ALICE, 1, { id: 'a1', text: 'alice', target: file });
    createNote(store, BOB, 1, { id: 'b1', text: 'bob', target: file });
    store.data.set('private_notes_note_1111_prod', 'product data');
    store.readSpy = [];
    const report = listOwnNotes(store, ALICE);
    expect(report.notes.map((n) => n.id)).toEqual(['a1']);
    expect(report.counts).toMatchObject({
      rootKeys: 3,
      ownKeys: 1,
      otherAuthorKeys: 1,
      nonProbeKeys: 1,
    });
    expect(store.readSpy).toEqual([noteKey(ALICE, 'a1')]);
  });

  it('keeps valid notes when one own record is corrupt or from a future schema', () => {
    const store = new MemoryStore();
    createNote(store, ALICE, 1, { id: 'ok1', text: 'fine', target: file });
    store.data.set(noteKey(ALICE, 'bad1'), '{not json');
    store.data.set(
      noteKey(ALICE, 'fut1'),
      JSON.stringify({ schemaVersion: 2 }),
    );
    const report = listOwnNotes(store, ALICE);
    expect(report.notes.map((n) => n.id)).toEqual(['ok1']);
    expect(report.problems.map((p) => p.reason).sort()).toEqual([
      'corrupt',
      'future-schema',
    ]);
    // Future-schema values are left untouched by listing.
    expect(store.data.get(noteKey(ALICE, 'fut1'))).toBe('{"schemaVersion":2}');
  });
});

describe('author checks on mutations', () => {
  function seeded() {
    const store = new MemoryStore();
    createNote(store, ALICE, 1, { id: 'a1', text: 'alice', target: file });
    createNote(store, BOB, 1, { id: 'b1', text: 'bob', target: file });
    return store;
  }

  it('rejects a command whose claimed author is not the current user', () => {
    const store = seeded();
    const before = new Map(store.data);
    expect(updateNote(store, ALICE, 5, ref('b1', BOB), 'x')).toMatchObject({
      ok: false,
      code: 'FOREIGN_AUTHOR',
    });
    expect(deleteNote(store, ALICE, ref('b1', BOB))).toMatchObject({
      ok: false,
      code: 'FOREIGN_AUTHOR',
    });
    expect(store.data).toEqual(before);
  });

  it('cannot reach another author’s record even without a claimed author', () => {
    const store = seeded();
    const before = new Map(store.data);
    expect(updateNote(store, ALICE, 5, ref('b1'), 'x')).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(deleteNote(store, ALICE, ref('b1'))).toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(store.data).toEqual(before);
  });

  it('rejects ids that try to inject key separators', () => {
    const store = seeded();
    const before = new Map(store.data);
    const injected = `x_${encodeAuthorId(BOB)}_b1`;
    expect(deleteNote(store, ALICE, ref(injected))).toMatchObject({
      code: 'INVALID_ID',
    });
    expect(deleteNote(store, ALICE, ref('../b1'))).toMatchObject({
      code: 'INVALID_ID',
    });
    expect(store.data).toEqual(before);
  });

  it('rejects a record under the own key that names another author inside', () => {
    const store = new MemoryStore();
    expect(seedSyntheticForeign(store, ALICE, 1).ok).toBe(true);
    const before = new Map(store.data);
    expect(
      updateNote(store, ALICE, 5, ref(SYNTHETIC_TAMPERED_NOTE_ID), 'x'),
    ).toMatchObject({
      code: 'AUTHOR_MISMATCH',
    });
    expect(
      deleteNote(store, ALICE, ref(SYNTHETIC_TAMPERED_NOTE_ID)),
    ).toMatchObject({
      code: 'AUTHOR_MISMATCH',
    });
    expect(store.data).toEqual(before);
    expect(listOwnNotes(store, ALICE).problems.map((p) => p.reason)).toEqual([
      'author-mismatch',
    ]);
  });

  it('rejects when there is no user', () => {
    const store = seeded();
    expect(deleteNote(store, null, ref('a1'))).toMatchObject({
      code: 'NO_USER',
    });
    expect(store.data.size).toBe(2);
  });

  it('updates own records, bumps revision and detects stale revisions', () => {
    const store = seeded();
    const updated = updateNote(
      store,
      ALICE,
      9,
      ref('a1', ALICE, 1),
      'new text',
    );
    expect(updated).toMatchObject({
      ok: true,
      value: { revision: 2, updatedAt: 9, text: 'new text' },
    });
    const stale = updateNote(store, ALICE, 10, ref('a1', ALICE, 1), 'again');
    expect(stale).toMatchObject({ ok: false, code: 'REVISION_CONFLICT' });
    expect(parseNote(store.data.get(noteKey(ALICE, 'a1')) ?? '')).toMatchObject(
      {
        status: 'ok',
        note: { text: 'new text', revision: 2, createdAt: 1 },
      },
    );
  });

  it('deletes only the exact key', () => {
    const store = seeded();
    const result = deleteNote(store, ALICE, ref('a1', ALICE));
    expect(result).toMatchObject({ ok: true });
    expect([...store.data.keys()]).toEqual([noteKey(BOB, 'b1')]);
  });

  it('refuses to overwrite a future-schema record', () => {
    const store = new MemoryStore();
    store.data.set(noteKey(ALICE, 'f1'), JSON.stringify({ schemaVersion: 7 }));
    expect(updateNote(store, ALICE, 1, ref('f1'), 'x')).toMatchObject({
      code: 'UNSUPPORTED_SCHEMA',
    });
    expect(store.data.get(noteKey(ALICE, 'f1'))).toBe('{"schemaVersion":7}');
  });

  it('reports a rejected write instead of success', () => {
    const store = seeded();
    store.failWrites = true;
    expect(updateNote(store, ALICE, 5, ref('a1'), 'x')).toMatchObject({
      ok: false,
      code: 'WRITE_FAILED',
    });
    expect(deleteNote(store, ALICE, ref('a1'))).toMatchObject({
      code: 'WRITE_FAILED',
    });
  });
});

describe('synthetic foreign data and cleanup', () => {
  it('seeds a foreign-author key and a tampered own key', () => {
    const store = new MemoryStore();
    const result = seedSyntheticForeign(store, ALICE, 1);
    expect(result).toMatchObject({ ok: true });
    expect(
      store.data.has(
        noteKey(SYNTHETIC_FOREIGN_AUTHOR_ID, SYNTHETIC_FOREIGN_NOTE_ID),
      ),
    ).toBe(true);
    expect(store.data.has(noteKey(ALICE, SYNTHETIC_TAMPERED_NOTE_ID))).toBe(
      true,
    );
  });

  it('cleans only own and synthetic probe keys without reading values', () => {
    const store = new MemoryStore();
    createNote(store, ALICE, 1, { id: 'a1', text: 'alice', target: file });
    createNote(store, BOB, 1, { id: 'b1', text: 'bob', target: file });
    seedSyntheticForeign(store, ALICE, 1);
    store.data.set('private_notes_note_1111_prod', 'product');
    store.data.set('someone-else', 'other plugin data');
    store.readSpy = [];
    const result = cleanProbeData(store, ALICE);
    expect(result.ok && result.value.removed).toHaveLength(3);
    expect(store.readSpy).toEqual([]);
    expect([...store.data.keys()].sort()).toEqual(
      [
        noteKey(BOB, 'b1'),
        'private_notes_note_1111_prod',
        'someone-else',
      ].sort(),
    );
  });
});

describe('request guard', () => {
  it('accepts well-formed commands and rejects malformed ones', () => {
    expect(parseRequest({ requestId: 1, command: { op: 'LIST' } })).toEqual({
      requestId: 1,
      command: { op: 'LIST' },
    });
    expect(
      parseRequest({
        requestId: 2,
        command: {
          op: 'DELETE',
          noteId: 'a',
          expectedRevision: null,
          claimedAuthorId: null,
        },
      }),
    ).not.toBeNull();
    expect(parseRequest({ requestId: 3, command: { op: 'DROP' } })).toBeNull();
    expect(
      parseRequest({
        requestId: 4,
        command: { op: 'SAVE', text: 'x', targetType: 'cell' },
      }),
    ).toBeNull();
    expect(parseRequest({ command: { op: 'LIST' } })).toBeNull();
    expect(parseRequest('LIST')).toBeNull();
  });

  it('drops extra fields such as a raw key or authorId on commands', () => {
    const parsed = parseRequest({
      requestId: 5,
      command: {
        op: 'DELETE',
        noteId: 'a',
        expectedRevision: null,
        claimedAuthorId: null,
        key: 'pn_probe_note_2222_b1',
        authorId: '2222',
      },
    });
    expect(parsed?.command).toEqual({
      op: 'DELETE',
      noteId: 'a',
      expectedRevision: null,
      claimedAuthorId: null,
    });
  });
});
