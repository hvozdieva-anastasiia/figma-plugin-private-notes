// Rules for creating, changing, completing, rebinding and deleting notes.
//
// The author is read from the host (figma.currentUser) on every call. Commands
// never carry an author: another author's note id can only produce NOT_FOUND
// because the key is built from the current author. Every change goes through
// one code path, `patchNote`, so text, target and status follow one rule.

import {
  LIMITS,
  SCHEMA_VERSION,
  type Limits,
  type Note,
  type NoteKind,
  type NoteTarget,
  type Result,
  type TaskStatus,
} from '../shared/model';
import {
  fail,
  isNoteKind,
  isTaskStatus,
  isValidNoteId,
  isValidRevision,
  targetsEqual,
  validateTarget,
  validateText,
} from '../shared/validation';
import {
  countOwnKeys,
  deleteOwnNote,
  listOwnNotes,
  noteKey,
  readOwnNote,
  writeOwnNote,
  type ListReport,
  type PluginDataStore,
} from './storage/document-notes';

export interface NotesServiceDeps {
  store: PluginDataStore;
  /** Current Figma user id, or `null` when it is unavailable. */
  getUserId: () => string | null;
  /** UTC milliseconds. */
  now: () => number;
  /** Overrides of product limits; tests use small values. */
  limits?: Partial<Limits>;
}

export interface CreateNoteInput {
  /** Chosen by the caller, so that a repeated command does not make a duplicate. */
  id: string;
  kind: NoteKind;
  text: string;
  target: NoteTarget;
}

export interface NoteRef {
  id: string;
  /** Revision the caller last saw; protects against stale commands. */
  expectedRevision: number;
}

export interface UpdateNoteInput extends NoteRef {
  text?: string;
  target?: NoteTarget;
}

export interface RebindNoteInput extends NoteRef {
  target: NoteTarget;
}

export interface SetStatusInput extends NoteRef {
  status: TaskStatus;
}

export type DeleteNoteInput = NoteRef;

interface Patch {
  text?: string;
  target?: NoteTarget;
  status?: TaskStatus;
}

export interface NotesService {
  list(): Result<ListReport>;
  create(input: CreateNoteInput): Result<Note>;
  update(input: UpdateNoteInput): Result<Note>;
  rebind(input: RebindNoteInput): Result<Note>;
  setStatus(input: SetStatusInput): Result<Note>;
  remove(input: DeleteNoteInput): Result<{ id: string }>;
}

export function createNotesService(deps: NotesServiceDeps): NotesService {
  const { store, getUserId, now } = deps;
  const limits: Limits = { ...LIMITS, ...deps.limits };

  function currentAuthor(): Result<string> {
    const id = getUserId();
    return id === null || id === ''
      ? fail('NO_USER', 'figma.currentUser.id is unavailable')
      : { ok: true, value: id };
  }

  function checkRef(ref: NoteRef): Result<null> {
    if (!isValidNoteId(ref.id)) {
      return fail('INVALID_ID', 'note id has unsupported characters');
    }
    if (!isValidRevision(ref.expectedRevision)) {
      return fail(
        'INVALID_COMMAND',
        'expectedRevision must be an integer >= 1',
      );
    }
    return { ok: true, value: null };
  }

  function sameContent(a: Note, b: Note): boolean {
    return (
      a.text === b.text &&
      a.status === b.status &&
      targetsEqual(a.target, b.target)
    );
  }

  /** The single rule for every change of an existing note. */
  function patchNote(ref: NoteRef, patch: Patch): Result<Note> {
    const author = currentAuthor();
    if (!author.ok) return author;
    const refOk = checkRef(ref);
    if (!refOk.ok) return refOk;

    const next: Patch = {};
    if (patch.text !== undefined) {
      const text = validateText(patch.text, limits);
      if (!text.ok) return text;
      next.text = text.value;
    }
    if (patch.target !== undefined) {
      const target = validateTarget(patch.target, limits);
      if (!target.ok) return target;
      next.target = target.value;
    }
    if (patch.status !== undefined) {
      if (!isTaskStatus(patch.status)) {
        return fail('INVALID_STATUS', 'status must be open or done');
      }
      next.status = patch.status;
    }

    const stored = readOwnNote(store, author.value, ref.id, limits);
    if (!stored.ok) return stored;
    const note = stored.value;
    if (next.status !== undefined && note.kind !== 'task') {
      return fail('INVALID_STATUS', 'only a task has a status');
    }

    const changed: Note = {
      ...note,
      text: next.text ?? note.text,
      target: next.target ?? note.target,
      status: next.status ?? note.status,
    };
    const unchanged = sameContent(note, changed);

    if (note.revision !== ref.expectedRevision) {
      // A repeated command: the stored note is exactly one revision ahead and
      // already contains the requested change.
      if (note.revision === ref.expectedRevision + 1 && unchanged) {
        return { ok: true, value: note };
      }
      return fail(
        'REVISION_CONFLICT',
        `expected revision ${ref.expectedRevision}, stored ${note.revision}`,
      );
    }
    if (unchanged) return { ok: true, value: note };

    return writeOwnNote(
      store,
      author.value,
      {
        ...changed,
        updatedAt: Math.max(now(), note.updatedAt),
        revision: note.revision + 1,
      },
      limits,
    );
  }

  return {
    list() {
      const author = currentAuthor();
      if (!author.ok) return author;
      return { ok: true, value: listOwnNotes(store, author.value, limits) };
    },

    create(input) {
      const author = currentAuthor();
      if (!author.ok) return author;
      if (!isValidNoteId(input.id)) {
        return fail('INVALID_ID', 'note id has unsupported characters');
      }
      if (!isNoteKind(input.kind)) {
        return fail('INVALID_COMMAND', 'kind must be note or task');
      }
      const text = validateText(input.text, limits);
      if (!text.ok) return text;
      const target = validateTarget(input.target, limits);
      if (!target.ok) return target;

      const key = noteKey(author.value, input.id);
      if (store.get(key) !== '') {
        // Same command repeated: return the stored note instead of a duplicate.
        const existing = readOwnNote(store, author.value, input.id, limits);
        if (
          existing.ok &&
          existing.value.kind === input.kind &&
          existing.value.text === text.value &&
          targetsEqual(existing.value.target, target.value)
        ) {
          return existing;
        }
        return fail('ALREADY_EXISTS', 'a different note already uses this id');
      }
      if (countOwnKeys(store, author.value) >= limits.maxNotesPerAuthor) {
        return fail(
          'LIMIT_REACHED',
          `an author can keep at most ${limits.maxNotesPerAuthor} notes`,
        );
      }

      const time = now();
      return writeOwnNote(
        store,
        author.value,
        {
          schemaVersion: SCHEMA_VERSION,
          id: input.id,
          authorId: author.value,
          kind: input.kind,
          text: text.value,
          status: input.kind === 'task' ? 'open' : null,
          target: target.value,
          createdAt: time,
          updatedAt: time,
          revision: 1,
        },
        limits,
      );
    },

    update(input) {
      if (input.text === undefined && input.target === undefined) {
        return fail(
          'INVALID_COMMAND',
          'nothing to update: pass text or target',
        );
      }
      const patch: Patch = {};
      if (input.text !== undefined) patch.text = input.text;
      if (input.target !== undefined) patch.target = input.target;
      return patchNote(input, patch);
    },

    rebind(input) {
      return patchNote(input, { target: input.target });
    },

    setStatus(input) {
      return patchNote(input, { status: input.status });
    },

    remove(input) {
      const author = currentAuthor();
      if (!author.ok) return author;
      const refOk = checkRef(input);
      if (!refOk.ok) return refOk;
      const stored = readOwnNote(store, author.value, input.id, limits);
      if (!stored.ok) return stored;
      if (stored.value.revision !== input.expectedRevision) {
        return fail(
          'REVISION_CONFLICT',
          `expected revision ${input.expectedRevision}, stored ${stored.value.revision}`,
        );
      }
      const deleted = deleteOwnNote(store, author.value, input.id);
      return deleted.ok ? { ok: true, value: { id: input.id } } : deleted;
    },
  };
}
