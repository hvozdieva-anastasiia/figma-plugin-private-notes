// Data model of a private note. No DOM or Figma globals: this file is compiled
// by both the plugin and the UI TypeScript programs.

export const SCHEMA_VERSION = 1;

/** Prefix of every note key on `figma.root`: `private_notes_note_<author>_<id>`. */
export const KEY_PREFIX = 'private_notes_note_';

export interface Limits {
  /** Unicode code points in the note text. */
  readonly maxTextLength: number;
  /** Notes (keys) one author may keep in a document. */
  readonly maxNotesPerAuthor: number;
  /** UTF-8 bytes of one serialized value; the API entry limit is 100 kB. */
  readonly maxValueBytes: number;
  /** Unicode code points kept in a target name snapshot. */
  readonly maxNameLength: number;
}

/** Product limits, see architecture v4, section 5. They are implementation settings. */
export const LIMITS: Limits = {
  maxTextLength: 4000,
  maxNotesPerAuthor: 500,
  maxValueBytes: 80_000,
  maxNameLength: 200,
};

export type NoteKind = 'note' | 'task';
export type TaskStatus = 'open' | 'done';

export interface FileTarget {
  type: 'file';
  id: null;
  pageId: null;
  nameSnapshot: null;
  pageNameSnapshot: null;
}

export interface PageTarget {
  type: 'page';
  /** ID of the PAGE node. */
  id: string;
  /** Same as `id` for a page target. */
  pageId: string;
  nameSnapshot: string;
  pageNameSnapshot: string;
}

export interface FrameTarget {
  type: 'frame';
  /** ID of the FRAME node. */
  id: string;
  /** Last known page of the frame; the real page is resolved from its parents. */
  pageId: string;
  nameSnapshot: string;
  pageNameSnapshot: string;
}

export type NoteTarget = FileTarget | PageTarget | FrameTarget;

export interface Note {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  authorId: string;
  kind: NoteKind;
  text: string;
  /** `null` for a note, `open` or `done` for a task. */
  status: TaskStatus | null;
  target: NoteTarget;
  /** UTC milliseconds since the Unix epoch. */
  createdAt: number;
  updatedAt: number;
  /** Starts at 1 and grows by one on every change; detects stale commands. */
  revision: number;
}

/** A stored note of the current author that could not be used. Shown as a count. */
export interface NoteProblem {
  /** Note id from the key, or `null` when the key has no valid id. */
  noteId: string | null;
  reason:
    | 'corrupt'
    | 'future-schema'
    | 'author-mismatch'
    | 'key-mismatch'
    | 'bad-key';
  detail: string;
}

export type ErrorCode =
  | 'NO_USER'
  | 'INVALID_MESSAGE'
  | 'INTERNAL'
  | 'TIMEOUT'
  | 'TARGET_NOT_FOUND'
  | 'NAVIGATION_FAILED'
  | 'INVALID_COMMAND'
  | 'INVALID_ID'
  | 'INVALID_TEXT'
  | 'INVALID_TARGET'
  | 'INVALID_STATUS'
  | 'TOO_LARGE'
  | 'LIMIT_REACHED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'AUTHOR_MISMATCH'
  | 'CORRUPT'
  | 'UNSUPPORTED_SCHEMA'
  | 'REVISION_CONFLICT'
  | 'WRITE_FAILED';

export interface Failure {
  ok: false;
  code: ErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | Failure;
