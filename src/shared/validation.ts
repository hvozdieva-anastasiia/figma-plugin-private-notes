// Checks of unknown data: commands from the UI and values read from pluginData.
// Pure functions, no DOM or Figma globals.

import {
  LIMITS,
  SCHEMA_VERSION,
  type ErrorCode,
  type Failure,
  type Limits,
  type Note,
  type NoteKind,
  type NoteTarget,
  type Result,
  type TaskStatus,
} from './model';

export function fail(code: ErrorCode, message: string): Failure {
  return { ok: false, code, message };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------- strings

/** Number of Unicode code points (an emoji counts as one). */
export function codePointLength(text: string): number {
  let count = 0;
  for (const _ of text) {
    void _;
    count += 1;
  }
  return count;
}

/** UTF-8 size of a string without TextEncoder (not guaranteed in the sandbox). */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

export function hasLoneSurrogate(text: string): boolean {
  return LONE_SURROGATE.test(text);
}

function truncateCodePoints(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}

// ---------------------------------------------------------------- ids

const NOTE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const PAGE_ID_PATTERN = /^\d+:\d+$/;
// A frame inside an instance has an id such as `I1:11;1:9`.
const FRAME_ID_PATTERN = /^I?\d+:\d+(;\d+:\d+)*$/;

/** A note id is part of the pluginData key, so `_` and other separators are refused. */
export function isValidNoteId(id: unknown): id is string {
  return typeof id === 'string' && NOTE_ID_PATTERN.test(id);
}

export function isValidRevision(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

// ---------------------------------------------------------------- fields

export function validateText(
  text: unknown,
  limits: Pick<Limits, 'maxTextLength'> = LIMITS,
): Result<string> {
  if (typeof text !== 'string' || text.trim() === '') {
    return fail('INVALID_TEXT', 'text must be a non-empty string');
  }
  if (hasLoneSurrogate(text)) {
    return fail('INVALID_TEXT', 'text contains an unpaired surrogate');
  }
  if (codePointLength(text) > limits.maxTextLength) {
    return fail(
      'INVALID_TEXT',
      `text is longer than ${limits.maxTextLength} characters`,
    );
  }
  return { ok: true, value: text };
}

export function isNoteKind(value: unknown): value is NoteKind {
  return value === 'note' || value === 'task';
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return value === 'open' || value === 'done';
}

/** `note` has no status; `task` is `open` or `done`. */
export function statusMatchesKind(kind: NoteKind, status: unknown): boolean {
  return kind === 'note' ? status === null : isTaskStatus(status);
}

function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Checks a target and returns a normalized copy: file has only nulls, page has
 * `pageId === id`, names are cut to `maxNameLength` code points. A target that
 * no longer exists in the document is still valid: existence is not checked here.
 */
export function validateTarget(
  value: unknown,
  limits: Pick<Limits, 'maxNameLength'> = LIMITS,
): Result<NoteTarget> {
  if (!isRecord(value)) {
    return fail('INVALID_TARGET', 'target is not an object');
  }
  const { type, id, pageId, nameSnapshot, pageNameSnapshot } = value;
  if (type === 'file') {
    if (
      !isNullish(id) ||
      !isNullish(pageId) ||
      !isNullish(nameSnapshot) ||
      !isNullish(pageNameSnapshot)
    ) {
      return fail('INVALID_TARGET', 'file target must not name a page or node');
    }
    return {
      ok: true,
      value: {
        type: 'file',
        id: null,
        pageId: null,
        nameSnapshot: null,
        pageNameSnapshot: null,
      },
    };
  }
  if (type !== 'page' && type !== 'frame') {
    return fail('INVALID_TARGET', 'unknown target type');
  }
  if (typeof id !== 'string' || typeof pageId !== 'string') {
    return fail('INVALID_TARGET', `${type} target requires id and pageId`);
  }
  if (
    typeof nameSnapshot !== 'string' ||
    typeof pageNameSnapshot !== 'string'
  ) {
    return fail('INVALID_TARGET', `${type} target requires name snapshots`);
  }
  if (!PAGE_ID_PATTERN.test(pageId)) {
    return fail('INVALID_TARGET', 'pageId is not a page id');
  }
  if (type === 'page') {
    if (!PAGE_ID_PATTERN.test(id)) {
      return fail('INVALID_TARGET', 'page target id is not a page id');
    }
    if (pageId !== id) {
      return fail('INVALID_TARGET', 'page target must have pageId equal to id');
    }
  } else if (!FRAME_ID_PATTERN.test(id)) {
    return fail('INVALID_TARGET', 'frame target id is not a node id');
  }
  return {
    ok: true,
    value: {
      type,
      id,
      pageId,
      nameSnapshot: truncateCodePoints(nameSnapshot, limits.maxNameLength),
      pageNameSnapshot: truncateCodePoints(
        pageNameSnapshot,
        limits.maxNameLength,
      ),
    },
  };
}

export function targetsEqual(a: NoteTarget, b: NoteTarget): boolean {
  return (
    a.type === b.type &&
    a.id === b.id &&
    a.pageId === b.pageId &&
    a.nameSnapshot === b.nameSnapshot &&
    a.pageNameSnapshot === b.pageNameSnapshot
  );
}

// ---------------------------------------------------------------- stored value

export type ParsedNote =
  | { status: 'ok'; note: Note }
  | { status: 'future'; schemaVersion: number }
  | { status: 'corrupt'; reason: string };

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Parses a stored value. A newer schemaVersion is reported as `future`, never
 * as corrupt, so that an older plugin leaves it alone.
 */
export function parseNote(
  raw: string,
  limits: Pick<Limits, 'maxNameLength'> = LIMITS,
): ParsedNote {
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
  if (schemaVersion > SCHEMA_VERSION) {
    return { status: 'future', schemaVersion };
  }
  if (schemaVersion !== SCHEMA_VERSION) {
    return { status: 'corrupt', reason: 'unsupported schemaVersion' };
  }
  const { id, authorId, kind, text, status, createdAt, updatedAt, revision } =
    data;
  if (!isValidNoteId(id)) return { status: 'corrupt', reason: 'bad id' };
  if (typeof authorId !== 'string' || authorId === '') {
    return { status: 'corrupt', reason: 'bad authorId' };
  }
  if (!isNoteKind(kind)) return { status: 'corrupt', reason: 'bad kind' };
  if (typeof text !== 'string' || text.trim() === '') {
    return { status: 'corrupt', reason: 'bad text' };
  }
  if (!statusMatchesKind(kind, status)) {
    return { status: 'corrupt', reason: 'status does not match kind' };
  }
  if (
    !isTimestamp(createdAt) ||
    !isTimestamp(updatedAt) ||
    !isValidRevision(revision)
  ) {
    return { status: 'corrupt', reason: 'bad numeric fields' };
  }
  const target = validateTarget(data.target, limits);
  if (!target.ok) return { status: 'corrupt', reason: target.message };
  return {
    status: 'ok',
    note: {
      schemaVersion: SCHEMA_VERSION,
      id,
      authorId,
      kind,
      text,
      status: status as TaskStatus | null,
      target: target.value,
      createdAt,
      updatedAt,
      revision,
    },
  };
}
