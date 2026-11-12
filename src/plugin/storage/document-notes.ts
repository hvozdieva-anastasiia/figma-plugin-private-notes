// Repository of notes on `figma.root`: one note, one pluginData key.
//
//   private_notes_note_<encodedAuthorId>_<noteId>
//
// There is no shared index or array. Only the current author's keys are read;
// other authors' keys are counted and never opened. The layer tree is not
// traversed. No Figma global is referenced: the host is passed in.

import {
  KEY_PREFIX,
  LIMITS,
  type Failure,
  type Limits,
  type Note,
  type NoteProblem,
  type Result,
} from '../../shared/model';
import {
  fail,
  isValidNoteId,
  parseNote,
  utf8Length,
} from '../../shared/validation';

/** The part of `DocumentNode` the repository needs; `figma.root` satisfies it. */
export interface PluginDataHost {
  getPluginDataKeys(): string[];
  getPluginData(key: string): string;
  setPluginData(key: string, value: string): void;
}

export interface PluginDataStore {
  keys(): string[];
  get(key: string): string;
  set(key: string, value: string): void;
}

export function storeFromHost(host: PluginDataHost): PluginDataStore {
  return {
    keys: () => host.getPluginDataKeys(),
    get: (key) => host.getPluginData(key),
    set: (key, value) => {
      host.setPluginData(key, value);
    },
  };
}

// ---------------------------------------------------------------- keys

/** Escapes `_` too, so the author part can never contain the key separator. */
export function encodeAuthorId(authorId: string): string {
  return encodeURIComponent(authorId).replace(/_/g, '%5F');
}

export function authorKeyPrefix(authorId: string): string {
  return `${KEY_PREFIX}${encodeAuthorId(authorId)}_`;
}

export function noteKey(authorId: string, noteId: string): string {
  return authorKeyPrefix(authorId) + noteId;
}

// ---------------------------------------------------------------- listing

export interface ListProblem extends NoteProblem {
  key: string;
}

export interface KeyCounts {
  rootKeys: number;
  ownKeys: number;
  /** Keys of the product prefix that belong to other authors (never read). */
  otherAuthorKeys: number;
}

export interface ListReport {
  notes: Note[];
  /** Own records that could not be read; the other notes stay available. */
  problems: ListProblem[];
  counts: KeyCounts;
}

/** Reads only the current author's keys. */
export function listOwnNotes(
  store: PluginDataStore,
  authorId: string,
  limits: Pick<Limits, 'maxNameLength'> = LIMITS,
): ListReport {
  const prefix = authorKeyPrefix(authorId);
  const counts: KeyCounts = { rootKeys: 0, ownKeys: 0, otherAuthorKeys: 0 };
  const notes: Note[] = [];
  const problems: ListProblem[] = [];
  for (const key of store.keys()) {
    counts.rootKeys += 1;
    if (!key.startsWith(prefix)) {
      if (key.startsWith(KEY_PREFIX)) counts.otherAuthorKeys += 1;
      continue;
    }
    counts.ownKeys += 1;
    const noteId = key.slice(prefix.length);
    if (!isValidNoteId(noteId)) {
      problems.push({
        key,
        noteId: null,
        reason: 'bad-key',
        detail: 'key does not end with a valid note id',
      });
      continue;
    }
    const parsed = parseNote(store.get(key), limits);
    if (parsed.status === 'corrupt') {
      problems.push({
        key,
        noteId,
        reason: 'corrupt',
        detail: parsed.reason,
      });
    } else if (parsed.status === 'future') {
      problems.push({
        key,
        noteId,
        reason: 'future-schema',
        detail: `schemaVersion ${parsed.schemaVersion}`,
      });
    } else if (parsed.note.authorId !== authorId) {
      problems.push({
        key,
        noteId,
        reason: 'author-mismatch',
        detail: 'authorId inside the value differs from the key author',
      });
    } else if (parsed.note.id !== noteId) {
      problems.push({
        key,
        noteId,
        reason: 'key-mismatch',
        detail: 'id inside the value differs from the key',
      });
    } else {
      notes.push(parsed.note);
    }
  }
  notes.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return { notes, problems, counts };
}

/** Number of the author's keys, readable or not; used for the per-author limit. */
export function countOwnKeys(store: PluginDataStore, authorId: string): number {
  const prefix = authorKeyPrefix(authorId);
  let count = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) count += 1;
  }
  return count;
}

// ---------------------------------------------------------------- single note

/**
 * Reads one of the author's notes by id. The key is built from the
 * authenticated author, so another author's id can only give NOT_FOUND.
 */
export function readOwnNote(
  store: PluginDataStore,
  authorId: string,
  noteId: unknown,
  limits: Pick<Limits, 'maxNameLength'> = LIMITS,
): Result<Note> {
  if (!isValidNoteId(noteId)) {
    return fail('INVALID_ID', 'note id has unsupported characters');
  }
  const raw = store.get(noteKey(authorId, noteId));
  if (raw === '') {
    return fail('NOT_FOUND', 'no note with this id for the current author');
  }
  const parsed = parseNote(raw, limits);
  if (parsed.status === 'corrupt') {
    return fail('CORRUPT', `stored note is unreadable: ${parsed.reason}`);
  }
  if (parsed.status === 'future') {
    return fail(
      'UNSUPPORTED_SCHEMA',
      `stored note has newer schemaVersion ${parsed.schemaVersion}`,
    );
  }
  if (parsed.note.authorId !== authorId || parsed.note.id !== noteId) {
    return fail('AUTHOR_MISMATCH', 'stored note does not belong to the author');
  }
  return { ok: true, value: parsed.note };
}

function writeValue(
  store: PluginDataStore,
  key: string,
  value: string,
): Failure | null {
  try {
    store.set(key, value);
  } catch (error) {
    return fail(
      'WRITE_FAILED',
      error instanceof Error ? error.message : 'setPluginData failed',
    );
  }
  // A write that does not show up on reading back is a failed write.
  if (store.get(key) !== value) {
    return fail('WRITE_FAILED', 'the value was not stored');
  }
  return null;
}

/** Writes one note under the key of its own author. */
export function writeOwnNote(
  store: PluginDataStore,
  authorId: string,
  note: Note,
  limits: Pick<Limits, 'maxValueBytes'> = LIMITS,
): Result<Note> {
  if (note.authorId !== authorId) {
    return fail(
      'AUTHOR_MISMATCH',
      'note author differs from the current author',
    );
  }
  const value = JSON.stringify(note);
  if (utf8Length(value) > limits.maxValueBytes) {
    return fail(
      'TOO_LARGE',
      `serialized note is larger than ${limits.maxValueBytes} bytes`,
    );
  }
  return (
    writeValue(store, noteKey(authorId, note.id), value) ?? {
      ok: true,
      value: note,
    }
  );
}

/** Deletes exactly one own key by writing an empty string. */
export function deleteOwnNote(
  store: PluginDataStore,
  authorId: string,
  noteId: string,
): Result<null> {
  if (!isValidNoteId(noteId)) {
    return fail('INVALID_ID', 'note id has unsupported characters');
  }
  return (
    writeValue(store, noteKey(authorId, noteId), '') ?? {
      ok: true,
      value: null,
    }
  );
}
