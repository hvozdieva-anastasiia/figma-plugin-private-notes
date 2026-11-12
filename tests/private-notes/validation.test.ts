import { describe, expect, it } from 'vitest';
import { LIMITS, type Note } from '../../src/shared/model';
import {
  codePointLength,
  isValidNoteId,
  parseNote,
  statusMatchesKind,
  targetsEqual,
  utf8Length,
  validateTarget,
  validateText,
} from '../../src/shared/validation';

const FILE = {
  type: 'file',
  id: null,
  pageId: null,
  nameSnapshot: null,
  pageNameSnapshot: null,
};
const PAGE = {
  type: 'page',
  id: '0:1',
  pageId: '0:1',
  nameSnapshot: 'Page 1',
  pageNameSnapshot: 'Page 1',
};
const FRAME = {
  type: 'frame',
  id: '1:4',
  pageId: '0:1',
  nameSnapshot: 'Frame One',
  pageNameSnapshot: 'Page 1',
};

function stored(patch: Record<string, unknown> = {}): string {
  const note: Note = {
    schemaVersion: 1,
    id: 'note-1',
    authorId: '42',
    kind: 'note',
    text: 'hello',
    status: null,
    target: { ...FILE } as Note['target'],
    createdAt: 1000,
    updatedAt: 1000,
    revision: 1,
  };
  return JSON.stringify({ ...note, ...patch });
}

describe('note id', () => {
  it('accepts letters, digits and hyphen', () => {
    expect(isValidNoteId('3f2b8c1e-0a4d-4e51-9c3a-1b2c3d4e5f60')).toBe(true);
    expect(isValidNoteId('a')).toBe(true);
  });

  it.each(['', 'a_b', 'a/b', 'a b', 'ключ', 'a'.repeat(65), 1, null])(
    'refuses %j',
    (id) => {
      expect(isValidNoteId(id)).toBe(false);
    },
  );
});

describe('text', () => {
  it('accepts normal text and keeps it unchanged', () => {
    const result = validateText('  two words \n');
    expect(result).toEqual({ ok: true, value: '  two words \n' });
  });

  it.each(['', '   ', '\n\t', 5, null, undefined])('refuses %j', (text) => {
    const result = validateText(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_TEXT');
  });

  it('allows exactly the limit and refuses one more', () => {
    expect(validateText('a'.repeat(LIMITS.maxTextLength)).ok).toBe(true);
    expect(validateText('a'.repeat(LIMITS.maxTextLength + 1)).ok).toBe(false);
  });

  it('counts Unicode code points, not UTF-16 units', () => {
    const emoji = '😀'.repeat(LIMITS.maxTextLength);
    expect(emoji.length).toBe(LIMITS.maxTextLength * 2);
    expect(codePointLength(emoji)).toBe(LIMITS.maxTextLength);
    expect(validateText(emoji).ok).toBe(true);
    expect(validateText(emoji + '😀').ok).toBe(false);
  });

  it('refuses an unpaired surrogate', () => {
    expect(validateText('ok \uD83D').ok).toBe(false);
    expect(validateText('\uDE00 ok').ok).toBe(false);
    expect(validateText('Привіт, світе ✓ 😀').ok).toBe(true);
  });

  it('measures UTF-8 bytes', () => {
    expect(utf8Length('a')).toBe(1);
    expect(utf8Length('é')).toBe(2);
    expect(utf8Length('✓')).toBe(3);
    expect(utf8Length('😀')).toBe(4);
  });
});

describe('target', () => {
  it('accepts file, page and frame', () => {
    expect(validateTarget(FILE)).toEqual({ ok: true, value: FILE });
    expect(validateTarget(PAGE)).toEqual({ ok: true, value: PAGE });
    expect(validateTarget(FRAME)).toEqual({ ok: true, value: FRAME });
  });

  it('accepts a frame inside an instance', () => {
    expect(validateTarget({ ...FRAME, id: 'I1:11;1:9' }).ok).toBe(true);
  });

  it('accepts a file target with omitted fields', () => {
    expect(validateTarget({ type: 'file' })).toEqual({ ok: true, value: FILE });
  });

  it.each([
    ['not an object', 'frame'],
    ['array', []],
    ['null', null],
    ['unknown type', { ...FRAME, type: 'node' }],
    ['file with id', { ...FILE, id: '0:1' }],
    ['file with page id', { ...FILE, pageId: '0:1' }],
    ['file with names', { ...FILE, nameSnapshot: 'x' }],
    ['page without id', { ...PAGE, id: null }],
    ['page id of another page', { ...PAGE, pageId: '0:9' }],
    ['page id that is not a page id', { ...PAGE, id: 'abc', pageId: 'abc' }],
    ['frame without id', { ...FRAME, id: undefined }],
    ['frame without page', { ...FRAME, pageId: null }],
    ['frame id of wrong shape', { ...FRAME, id: '1-4' }],
    ['frame page of wrong shape', { ...FRAME, pageId: 'x' }],
    ['frame without name snapshot', { ...FRAME, nameSnapshot: null }],
    ['frame with numeric name', { ...FRAME, pageNameSnapshot: 7 }],
  ])('refuses %s', (_name, value) => {
    const result = validateTarget(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('INVALID_TARGET');
  });

  it('cuts long names and allows empty names', () => {
    const long = 'я'.repeat(LIMITS.maxNameLength + 50);
    const result = validateTarget({ ...FRAME, nameSnapshot: long });
    expect(result.ok && result.value.nameSnapshot).toBe(
      'я'.repeat(LIMITS.maxNameLength),
    );
    expect(validateTarget({ ...FRAME, nameSnapshot: '' }).ok).toBe(true);
  });

  it('compares targets by all fields', () => {
    const a = validateTarget(FRAME);
    const b = validateTarget({ ...FRAME, nameSnapshot: 'Renamed' });
    if (!a.ok || !b.ok) throw new Error('fixture');
    expect(targetsEqual(a.value, a.value)).toBe(true);
    expect(targetsEqual(a.value, b.value)).toBe(false);
  });
});

describe('status', () => {
  it('ties status to kind', () => {
    expect(statusMatchesKind('note', null)).toBe(true);
    expect(statusMatchesKind('note', 'open')).toBe(false);
    expect(statusMatchesKind('task', 'open')).toBe(true);
    expect(statusMatchesKind('task', 'done')).toBe(true);
    expect(statusMatchesKind('task', null)).toBe(false);
    expect(statusMatchesKind('task', 'closed')).toBe(false);
  });
});

describe('stored value', () => {
  it('parses a valid note', () => {
    const parsed = parseNote(stored());
    expect(parsed.status).toBe('ok');
    if (parsed.status === 'ok') {
      expect(parsed.note.id).toBe('note-1');
      expect(parsed.note.target).toEqual(FILE);
    }
  });

  it('parses a task with a frame target', () => {
    const parsed = parseNote(
      stored({ kind: 'task', status: 'done', target: FRAME }),
    );
    expect(parsed.status).toBe('ok');
  });

  it('reports a newer schema as future, not as corrupt', () => {
    expect(parseNote(stored({ schemaVersion: 2 }))).toEqual({
      status: 'future',
      schemaVersion: 2,
    });
    // Even if the rest of the value has an unknown shape.
    expect(parseNote(JSON.stringify({ schemaVersion: 7, x: 1 })).status).toBe(
      'future',
    );
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['an array', '[]'],
    ['no schemaVersion', JSON.stringify({ id: 'a' })],
    ['schemaVersion 0', stored({ schemaVersion: 0 })],
    ['bad id', stored({ id: 'a_b' })],
    ['empty author', stored({ authorId: '' })],
    ['bad kind', stored({ kind: 'idea' })],
    ['empty text', stored({ text: '  ' })],
    ['note with status', stored({ status: 'open' })],
    ['task without status', stored({ kind: 'task', status: null })],
    ['revision 0', stored({ revision: 0 })],
    ['fractional revision', stored({ revision: 1.5 })],
    ['negative time', stored({ createdAt: -1 })],
    ['bad target', stored({ target: { type: 'page', id: '0:1' } })],
  ])('reports %s as corrupt', (_name, raw) => {
    expect(parseNote(raw).status).toBe('corrupt');
  });
});
