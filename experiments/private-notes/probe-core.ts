// Pure logic of the stage 2 API probe. No Figma, DOM or Node globals here, so
// the same file is bundled into Plugin Main and imported by unit tests.
//
// Everything lives under a probe-only key prefix, never the product prefix
// `private_notes_note_`. Foreign values are never read: other authors' keys are
// only counted.

export const PROBE_KEY_PREFIX = 'pn_probe_note_';
export const SYNTHETIC_FOREIGN_AUTHOR_ID = 'probe-synthetic-foreign-author';
export const MAX_TEXT_LENGTH = 4000;
export const MAX_VALUE_LENGTH = 80_000;

const NOTE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export type ProbeTargetType = 'file' | 'page' | 'frame' | 'node';

export interface ProbeTarget {
  type: ProbeTargetType;
  id: string | null;
  pageId: string | null;
  nameSnapshot: string | null;
  pageNameSnapshot: string | null;
  // Probe-only: the Figma node type recorded at save time (for 'node' targets).
  nodeType: string | null;
}

export interface ProbeNote {
  schemaVersion: 1;
  id: string;
  authorId: string;
  text: string;
  target: ProbeTarget;
  createdAt: number;
  updatedAt: number;
  revision: number;
}

/** The subset of pluginData the probe needs; on Figma it is backed by figma.root. */
export interface PluginDataStore {
  keys(): string[];
  get(key: string): string;
  set(key: string, value: string): void;
}

export type ErrorCode =
  | 'NO_USER'
  | 'INVALID_COMMAND'
  | 'INVALID_ID'
  | 'INVALID_TEXT'
  | 'INVALID_TARGET'
  | 'TOO_LARGE'
  | 'FOREIGN_AUTHOR'
  | 'NOT_FOUND'
  | 'CORRUPT'
  | 'UNSUPPORTED_SCHEMA'
  | 'AUTHOR_MISMATCH'
  | 'REVISION_CONFLICT'
  | 'ALREADY_EXISTS'
  | 'WRITE_FAILED';

export interface Failure {
  ok: false;
  code: ErrorCode;
  message: string;
}
export type Result<T> = { ok: true; value: T } | Failure;

function fail(code: ErrorCode, message: string): Failure {
  return { ok: false, code, message };
}

// ---------------------------------------------------------------- keys

/** Escapes `_` too, so the author part can never contain the separator. */
export function encodeAuthorId(authorId: string): string {
  return encodeURIComponent(authorId).replace(/_/g, '%5F');
}

export function isValidNoteId(id: unknown): id is string {
  return typeof id === 'string' && NOTE_ID_PATTERN.test(id);
}

export function authorKeyPrefix(authorId: string): string {
  return `${PROBE_KEY_PREFIX}${encodeAuthorId(authorId)}_`;
}

export function noteKey(authorId: string, noteId: string): string {
  return authorKeyPrefix(authorId) + noteId;
}

export function splitProbeKey(
  key: string,
): { authorPart: string; noteId: string } | null {
  if (!key.startsWith(PROBE_KEY_PREFIX)) return null;
  const rest = key.slice(PROBE_KEY_PREFIX.length);
  const separator = rest.indexOf('_');
  if (separator <= 0) return null;
  const noteId = rest.slice(separator + 1);
  if (!isValidNoteId(noteId)) return null;
  return { authorPart: rest.slice(0, separator), noteId };
}

// ---------------------------------------------------------------- parsing

export type ParsedNote =
  | { status: 'ok'; note: ProbeNote }
  | { status: 'future'; schemaVersion: number }
  | { status: 'corrupt'; reason: string };

const TARGET_TYPES: readonly string[] = ['file', 'page', 'frame', 'node'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function validateTarget(value: unknown): Result<ProbeTarget> {
  if (!isRecord(value))
    return fail('INVALID_TARGET', 'target is not an object');
  const { type, id, pageId, nameSnapshot, pageNameSnapshot, nodeType } = value;
  if (typeof type !== 'string' || !TARGET_TYPES.includes(type)) {
    return fail('INVALID_TARGET', 'unknown target type');
  }
  if (
    !stringOrNull(id) ||
    !stringOrNull(pageId) ||
    !stringOrNull(nameSnapshot) ||
    !stringOrNull(pageNameSnapshot) ||
    !stringOrNull(nodeType)
  ) {
    return fail('INVALID_TARGET', 'target fields must be string or null');
  }
  if (type === 'file') {
    if (id !== null || pageId !== null) {
      return fail('INVALID_TARGET', 'file target must not have id or pageId');
    }
  } else if (id === null || id === '') {
    return fail('INVALID_TARGET', `${type} target requires an id`);
  }
  return {
    ok: true,
    value: {
      type: type as ProbeTargetType,
      id,
      pageId,
      nameSnapshot,
      pageNameSnapshot,
      nodeType,
    },
  };
}

export function parseNote(raw: string): ParsedNote {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', reason: 'invalid JSON' };
  }
  if (!isRecord(data)) return { status: 'corrupt', reason: 'not an object' };
  const { schemaVersion } = data;
  if (typeof schemaVersion !== 'number') {
    return { status: 'corrupt', reason: 'missing schemaVersion' };
  }
  if (schemaVersion > 1) return { status: 'future', schemaVersion };
  if (schemaVersion !== 1) {
    return { status: 'corrupt', reason: 'unsupported schemaVersion' };
  }
  const { id, authorId, text, createdAt, updatedAt, revision } = data;
  if (!isValidNoteId(id)) return { status: 'corrupt', reason: 'bad id' };
  if (typeof authorId !== 'string' || authorId === '') {
    return { status: 'corrupt', reason: 'bad authorId' };
  }
  if (typeof text !== 'string')
    return { status: 'corrupt', reason: 'bad text' };
  if (
    typeof createdAt !== 'number' ||
    typeof updatedAt !== 'number' ||
    typeof revision !== 'number' ||
    !Number.isInteger(revision) ||
    revision < 1
  ) {
    return { status: 'corrupt', reason: 'bad numeric fields' };
  }
  const target = validateTarget(data.target);
  if (!target.ok) return { status: 'corrupt', reason: target.message };
  return {
    status: 'ok',
    note: {
      schemaVersion: 1,
      id,
      authorId,
      text,
      target: target.value,
      createdAt,
      updatedAt,
      revision,
    },
  };
}

// ---------------------------------------------------------------- listing

export interface ListProblem {
  key: string;
  noteId: string;
  reason: 'corrupt' | 'future-schema' | 'author-mismatch' | 'key-mismatch';
  detail: string;
}

export interface KeyCounts {
  rootKeys: number;
  nonProbeKeys: number;
  malformedProbeKeys: number;
  ownKeys: number;
  otherAuthorKeys: number;
}

export interface ListReport {
  notes: ProbeNote[];
  problems: ListProblem[];
  counts: KeyCounts;
}

/**
 * Reads only the current author's keys. Keys of other authors and non-probe
 * keys are counted, never read.
 */
export function listOwnNotes(
  store: PluginDataStore,
  userId: string,
): ListReport {
  const ownPart = encodeAuthorId(userId);
  const counts: KeyCounts = {
    rootKeys: 0,
    nonProbeKeys: 0,
    malformedProbeKeys: 0,
    ownKeys: 0,
    otherAuthorKeys: 0,
  };
  const notes: ProbeNote[] = [];
  const problems: ListProblem[] = [];
  for (const key of store.keys()) {
    counts.rootKeys += 1;
    if (!key.startsWith(PROBE_KEY_PREFIX)) {
      counts.nonProbeKeys += 1;
      continue;
    }
    const parts = splitProbeKey(key);
    if (!parts) {
      counts.malformedProbeKeys += 1;
      continue;
    }
    if (parts.authorPart !== ownPart) {
      counts.otherAuthorKeys += 1;
      continue;
    }
    counts.ownKeys += 1;
    const parsed = parseNote(store.get(key));
    if (parsed.status === 'corrupt') {
      problems.push({
        key,
        noteId: parts.noteId,
        reason: 'corrupt',
        detail: parsed.reason,
      });
    } else if (parsed.status === 'future') {
      problems.push({
        key,
        noteId: parts.noteId,
        reason: 'future-schema',
        detail: `schemaVersion ${parsed.schemaVersion}`,
      });
    } else if (parsed.note.authorId !== userId) {
      problems.push({
        key,
        noteId: parts.noteId,
        reason: 'author-mismatch',
        detail: 'authorId inside the value differs from the key author',
      });
    } else if (parsed.note.id !== parts.noteId) {
      problems.push({
        key,
        noteId: parts.noteId,
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

// ---------------------------------------------------------------- mutations

function requireUser(userId: string | null): Failure | null {
  return userId === null || userId === ''
    ? fail('NO_USER', 'figma.currentUser.id is unavailable')
    : null;
}

function validateText(text: unknown): Result<string> {
  if (typeof text !== 'string' || text.trim() === '') {
    return fail('INVALID_TEXT', 'text must be a non-empty string');
  }
  if ([...text].length > MAX_TEXT_LENGTH) {
    return fail('INVALID_TEXT', `text is longer than ${MAX_TEXT_LENGTH}`);
  }
  return { ok: true, value: text };
}

function write(
  store: PluginDataStore,
  key: string,
  value: string,
): Failure | null {
  if (value.length > MAX_VALUE_LENGTH) {
    return fail('TOO_LARGE', 'serialized value exceeds the probe limit');
  }
  try {
    store.set(key, value);
  } catch (error) {
    return fail(
      'WRITE_FAILED',
      error instanceof Error ? error.message : 'setPluginData threw',
    );
  }
  return null;
}

export interface CreateInput {
  id: string;
  text: string;
  target: ProbeTarget;
}

/** The author always comes from the caller (Plugin Main), never from the UI. */
export function createNote(
  store: PluginDataStore,
  userId: string | null,
  now: number,
  input: CreateInput,
): Result<ProbeNote> {
  const noUser = requireUser(userId);
  if (noUser || userId === null) return noUser ?? fail('NO_USER', 'no user');
  if (!isValidNoteId(input.id)) {
    return fail('INVALID_ID', 'note id has unsupported characters');
  }
  const text = validateText(input.text);
  if (!text.ok) return text;
  const target = validateTarget(input.target);
  if (!target.ok) return target;
  const note: ProbeNote = {
    schemaVersion: 1,
    id: input.id,
    authorId: userId,
    text: text.value,
    target: target.value,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
  const key = noteKey(userId, input.id);
  const existing = store.get(key);
  if (existing !== '') {
    const parsed = parseNote(existing);
    const same =
      parsed.status === 'ok' &&
      parsed.note.authorId === userId &&
      parsed.note.text === note.text &&
      JSON.stringify(parsed.note.target) === JSON.stringify(note.target);
    return same && parsed.status === 'ok'
      ? { ok: true, value: parsed.note }
      : fail('ALREADY_EXISTS', 'a different value already uses this id');
  }
  const failure = write(store, key, JSON.stringify(note));
  return failure ?? { ok: true, value: note };
}

export interface MutationRef {
  noteId: string;
  /** authorId claimed by the UI command. Only compared, never trusted. */
  claimedAuthorId: string | null;
  expectedRevision: number | null;
}

/**
 * Resolves a note for mutation. Order matters: the key is derived from the
 * authenticated user and the command has no way to name a raw key.
 */
function loadForMutation(
  store: PluginDataStore,
  userId: string | null,
  ref: MutationRef,
): Result<{ key: string; note: ProbeNote }> {
  const noUser = requireUser(userId);
  if (noUser || userId === null) return noUser ?? fail('NO_USER', 'no user');
  if (!isValidNoteId(ref.noteId)) {
    return fail('INVALID_ID', 'note id has unsupported characters');
  }
  if (ref.claimedAuthorId !== null && ref.claimedAuthorId !== userId) {
    return fail(
      'FOREIGN_AUTHOR',
      'command author differs from the current Figma user',
    );
  }
  const key = noteKey(userId, ref.noteId);
  const raw = store.get(key);
  if (raw === '') {
    return fail('NOT_FOUND', 'no record with this id for the current user');
  }
  const parsed = parseNote(raw);
  if (parsed.status === 'corrupt') return fail('CORRUPT', parsed.reason);
  if (parsed.status === 'future') {
    return fail('UNSUPPORTED_SCHEMA', `schemaVersion ${parsed.schemaVersion}`);
  }
  if (parsed.note.authorId !== userId || parsed.note.id !== ref.noteId) {
    return fail('AUTHOR_MISMATCH', 'stored record does not belong to the user');
  }
  if (
    ref.expectedRevision !== null &&
    ref.expectedRevision !== parsed.note.revision
  ) {
    return fail(
      'REVISION_CONFLICT',
      `expected ${ref.expectedRevision}, stored ${parsed.note.revision}`,
    );
  }
  return { ok: true, value: { key, note: parsed.note } };
}

export function updateNote(
  store: PluginDataStore,
  userId: string | null,
  now: number,
  ref: MutationRef,
  text: string,
): Result<ProbeNote> {
  const loaded = loadForMutation(store, userId, ref);
  if (!loaded.ok) return loaded;
  const nextText = validateText(text);
  if (!nextText.ok) return nextText;
  const next: ProbeNote = {
    ...loaded.value.note,
    text: nextText.value,
    updatedAt: now,
    revision: loaded.value.note.revision + 1,
  };
  const failure = write(store, loaded.value.key, JSON.stringify(next));
  return failure ?? { ok: true, value: next };
}

export function deleteNote(
  store: PluginDataStore,
  userId: string | null,
  ref: MutationRef,
): Result<{ key: string }> {
  const loaded = loadForMutation(store, userId, ref);
  if (!loaded.ok) return loaded;
  const failure = write(store, loaded.value.key, '');
  if (failure) return failure;
  if (store.get(loaded.value.key) !== '') {
    return fail('WRITE_FAILED', 'value still present after deletion');
  }
  return { ok: true, value: { key: loaded.value.key } };
}

// ------------------------------------------------- synthetic foreign data

export const SYNTHETIC_FOREIGN_NOTE_ID = 'synthetic-foreign-a';
export const SYNTHETIC_TAMPERED_NOTE_ID = 'synthetic-tampered-b';

/**
 * Writes two clearly fake records for the "foreign author" scenarios:
 * A under a different author's key, B under the current author's key but with
 * a different authorId inside. Both carry probe-only content.
 */
export function seedSyntheticForeign(
  store: PluginDataStore,
  userId: string | null,
  now: number,
): Result<{ keys: string[] }> {
  const noUser = requireUser(userId);
  if (noUser || userId === null) return noUser ?? fail('NO_USER', 'no user');
  if (userId === SYNTHETIC_FOREIGN_AUTHOR_ID) {
    return fail('INVALID_COMMAND', 'user id equals the synthetic author id');
  }
  const target: ProbeTarget = {
    type: 'file',
    id: null,
    pageId: null,
    nameSnapshot: null,
    pageNameSnapshot: null,
    nodeType: null,
  };
  const make = (id: string): ProbeNote => ({
    schemaVersion: 1,
    id,
    authorId: SYNTHETIC_FOREIGN_AUTHOR_ID,
    text: 'synthetic foreign probe record',
    target,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  });
  const entries: [string, ProbeNote][] = [
    [
      noteKey(SYNTHETIC_FOREIGN_AUTHOR_ID, SYNTHETIC_FOREIGN_NOTE_ID),
      make(SYNTHETIC_FOREIGN_NOTE_ID),
    ],
    [
      noteKey(userId, SYNTHETIC_TAMPERED_NOTE_ID),
      make(SYNTHETIC_TAMPERED_NOTE_ID),
    ],
  ];
  const keys: string[] = [];
  for (const [key, note] of entries) {
    const failure = write(store, key, JSON.stringify(note));
    if (failure) return failure;
    keys.push(key);
  }
  return { ok: true, value: { keys } };
}

/**
 * Removes only: the current author's probe keys and the synthetic foreign
 * author's probe keys. Values are not read; nothing else is touched.
 */
export function cleanProbeData(
  store: PluginDataStore,
  userId: string | null,
): Result<{ removed: string[] }> {
  const noUser = requireUser(userId);
  if (noUser || userId === null) return noUser ?? fail('NO_USER', 'no user');
  const prefixes = [
    authorKeyPrefix(userId),
    authorKeyPrefix(SYNTHETIC_FOREIGN_AUTHOR_ID),
  ];
  const removed: string[] = [];
  for (const key of store.keys()) {
    if (!prefixes.some((prefix) => key.startsWith(prefix))) continue;
    if (splitProbeKey(key) === null) continue;
    const failure = write(store, key, '');
    if (failure) return failure;
    removed.push(key);
  }
  return { ok: true, value: { removed } };
}
