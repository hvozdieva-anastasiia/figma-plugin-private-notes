// Messages between the UI (React) and Plugin Main. No author field exists in
// any command: Plugin Main always uses figma.currentUser.
//
// Every command carries protocolVersion, requestId and runId. The runId is
// chosen by one UI load and filters out answers addressed to an older window.

import type {
  ErrorCode,
  Note,
  NoteKind,
  NoteProblem,
  NoteTarget,
  Result,
  TaskStatus,
} from './model';
import {
  fail,
  isNoteKind,
  isRecord,
  isTaskStatus,
  isValidTargetId,
  validateTarget,
} from './validation';

export const PROTOCOL_VERSION = 1;

// ---------------------------------------------------------------- data

export interface SelectionItem {
  id: string;
  /** Figma node type, for example FRAME. */
  type: string;
  name: string;
}

/** What the window knows about the document right now. Not the editor draft. */
export interface DocumentContext {
  page: { id: string; name: string };
  /** At most the first 20 selected nodes. */
  selection: SelectionItem[];
  selectionCount: number;
  /**
   * The frame the user is working in: the selected frame, or the nearest frame
   * around a single selected layer. `null` for no selection or several nodes.
   * Absent in older senders: then a single selected frame is used.
   */
  focusFrame?: { id: string; name: string } | null;
}

/** Preferences of the person using the window; not part of any note. */
export interface Prefs {
  /** The view the list opens in. */
  scope: 'all' | 'current';
}

export const DEFAULT_PREFS: Prefs = { scope: 'all' };

export interface NotesData {
  notes: Note[];
  /** Own records that could not be read; the rest of the notes are intact. */
  problems: NoteProblem[];
}

export interface InitData extends NotesData {
  context: DocumentContext;
  prefs: Prefs;
}

/** A page or a frame the user may choose in "Target". */
export interface TargetOption {
  type: 'page' | 'frame';
  id: string;
  pageId: string;
  name: string;
  pageName: string;
}

export interface TargetsData {
  options: TargetOption[];
  /** `true` when more matches exist than were returned. */
  truncated: boolean;
}

/** A page or frame whose current state the window wants to know. */
export interface TargetRef {
  type: 'page' | 'frame';
  id: string;
}

/**
 * What Plugin Main found for one target. `error` means the API failed and
 * says nothing about the target: it is never treated as "deleted".
 */
export type TargetResolution =
  | {
      type: 'page' | 'frame';
      id: string;
      state: 'available';
      /** Current name of the page or frame. */
      name: string;
      /** The page the node really lives on now. */
      pageId: string;
      pageName: string;
      /**
       * IDs of the frames around this one, nearest first, up to the page.
       * Lets "current selection" include the notes of nested frames.
       */
      ancestorFrameIds?: string[];
    }
  | { type: 'page' | 'frame'; id: string; state: 'missing' }
  | { type: 'page' | 'frame'; id: string; state: 'error' };

export interface FocusData {
  outcome: 'page' | 'frame';
  /** `false` when the target was already on the current page. */
  pageSwitched: boolean;
}

/** Most targets one REFRESH_TARGETS command may carry. */
export const MAX_TARGET_REFS = 25;

/** One note of a bulk command, with the revision the window last saw. */
export interface BulkItem {
  id: string;
  expectedRevision: number;
}

/**
 * Outcome of one note in a bulk command. Notes are changed one by one, so a
 * batch can succeed in part: every note gets its own answer.
 */
export type BulkItemResult =
  | {
      id: string;
      ok: true;
      /** The changed note, or `null` when the note was deleted. */
      note: Note | null;
    }
  | { id: string; ok: false; code: ErrorCode; message: string };

export interface BulkData {
  results: BulkItemResult[];
}

/** Most notes one bulk command may carry: the per-author limit. */
export const MAX_BULK_ITEMS = 500;

export interface WindowSize {
  width: number;
  height: number;
}

export const MIN_WINDOW: WindowSize = { width: 320, height: 360 };
export const MAX_WINDOW: WindowSize = { width: 1000, height: 1200 };
export const DEFAULT_WINDOW: WindowSize = { width: 400, height: 640 };

/** Keeps a requested window size inside the allowed range; whole pixels. */
export function clampWindow(width: number, height: number): WindowSize {
  const fit = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.round(value)));
  return {
    width: fit(width, MIN_WINDOW.width, MAX_WINDOW.width),
    height: fit(height, MIN_WINDOW.height, MAX_WINDOW.height),
  };
}

// ---------------------------------------------------------------- commands

export interface CommandPayloads {
  READY: Record<string, never>;
  REFRESH_NOTES: Record<string, never>;
  LIST_TARGETS: {
    kind: 'page' | 'frame';
    /** Page whose frames are listed; `null` for the list of pages. */
    pageId: string | null;
    query: string;
  };
  CREATE_NOTE: { id: string; kind: NoteKind; text: string; target: NoteTarget };
  UPDATE_NOTE: {
    id: string;
    expectedRevision: number;
    text?: string;
    target?: NoteTarget;
  };
  SET_TASK_STATUS: { id: string; expectedRevision: number; status: TaskStatus };
  DELETE_NOTE: { id: string; expectedRevision: number };
  REBIND_NOTE: { id: string; expectedRevision: number; target: NoteTarget };
  REFRESH_TARGETS: { targets: TargetRef[] };
  FOCUS_NOTE: { id: string };
  BULK_DELETE: { items: BulkItem[] };
  BULK_SET_STATUS: { items: BulkItem[]; status: TaskStatus };
  BULK_REBIND: { items: BulkItem[]; target: NoteTarget };
  RESIZE_WINDOW: WindowSize;
  SET_PREFS: Prefs;
}

export type CommandType = keyof CommandPayloads;

export interface CommandResults {
  READY: InitData;
  /** The context is included so that a refresh also corrects the "now" line. */
  REFRESH_NOTES: InitData;
  LIST_TARGETS: TargetsData;
  CREATE_NOTE: Note;
  UPDATE_NOTE: Note;
  SET_TASK_STATUS: Note;
  DELETE_NOTE: { id: string };
  REBIND_NOTE: Note;
  REFRESH_TARGETS: { resolutions: TargetResolution[] };
  FOCUS_NOTE: FocusData;
  BULK_DELETE: BulkData;
  BULK_SET_STATUS: BulkData;
  BULK_REBIND: BulkData;
  RESIZE_WINDOW: WindowSize;
  SET_PREFS: Prefs;
}

export interface CommandMessage<C extends CommandType = CommandType> {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: C;
  requestId: string;
  runId: string;
  payload: CommandPayloads[C];
}

export type AnyCommand = { [C in CommandType]: CommandMessage<C> }[CommandType];

export interface ResponseMessage<C extends CommandType = CommandType> {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: 'RESPONSE';
  command: C;
  requestId: string;
  runId: string;
  result: Result<CommandResults[C]>;
}

export type AnyResponse = {
  [C in CommandType]: ResponseMessage<C>;
}[CommandType];

/** Pushed by Plugin Main when the selection or the current page changes. */
export interface ContextMessage {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: 'CONTEXT_CHANGED';
  context: DocumentContext;
}

export type PluginMessage = AnyResponse | ContextMessage;

// ---------------------------------------------------------------- parsing

const COMMAND_TYPES: readonly string[] = [
  'READY',
  'REFRESH_NOTES',
  'LIST_TARGETS',
  'CREATE_NOTE',
  'UPDATE_NOTE',
  'SET_TASK_STATUS',
  'DELETE_NOTE',
  'REBIND_NOTE',
  'REFRESH_TARGETS',
  'FOCUS_NOTE',
  'BULK_DELETE',
  'BULK_SET_STATUS',
  'BULK_REBIND',
  'RESIZE_WINDOW',
  'SET_PREFS',
];

export function isCommandType(value: unknown): value is CommandType {
  return typeof value === 'string' && COMMAND_TYPES.includes(value);
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64;
}

export interface MessageIds {
  command: CommandType;
  requestId: string;
  runId: string;
}

/** Extracts what is needed to answer a command even when its payload is bad. */
export function readMessageIds(raw: unknown): MessageIds | null {
  if (!isRecord(raw)) return null;
  const { type, requestId, runId } = raw;
  if (!isCommandType(type) || !isId(requestId) || !isId(runId)) return null;
  return { command: type, requestId, runId };
}

const MAX_QUERY_LENGTH = 200;

function parseBulkItems(value: unknown): Result<BulkItem[]> {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_BULK_ITEMS
  ) {
    return fail('INVALID_MESSAGE', 'bad items');
  }
  const items: BulkItem[] = [];
  const seen = new Set<string>();
  for (const item of value as unknown[]) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.expectedRevision !== 'number' ||
      seen.has(item.id)
    ) {
      return fail('INVALID_MESSAGE', 'bad item');
    }
    seen.add(item.id);
    items.push({ id: item.id, expectedRevision: item.expectedRevision });
  }
  return { ok: true, value: items };
}

function parsePayload(
  type: CommandType,
  payload: Record<string, unknown>,
): Result<AnyCommand['payload']> {
  const invalid = (message: string) => fail('INVALID_MESSAGE', message);
  switch (type) {
    case 'READY':
    case 'REFRESH_NOTES':
      return { ok: true, value: {} };
    case 'LIST_TARGETS': {
      const { kind, pageId, query } = payload;
      if (kind !== 'page' && kind !== 'frame') return invalid('bad kind');
      if (pageId !== null && typeof pageId !== 'string') {
        return invalid('bad pageId');
      }
      if (typeof query !== 'string' || query.length > MAX_QUERY_LENGTH) {
        return invalid('bad query');
      }
      return { ok: true, value: { kind, pageId, query } };
    }
    case 'REFRESH_TARGETS': {
      const { targets } = payload;
      if (!Array.isArray(targets) || targets.length > MAX_TARGET_REFS) {
        return invalid('bad targets');
      }
      const refs: TargetRef[] = [];
      for (const item of targets as unknown[]) {
        if (!isRecord(item)) return invalid('bad target ref');
        const { type: refType, id: refId } = item;
        if (
          (refType !== 'page' && refType !== 'frame') ||
          !isValidTargetId(refType, refId)
        ) {
          return invalid('bad target ref');
        }
        refs.push({ type: refType, id: refId });
      }
      return { ok: true, value: { targets: refs } };
    }
    case 'FOCUS_NOTE': {
      if (typeof payload.id !== 'string') return invalid('bad id');
      return { ok: true, value: { id: payload.id } };
    }
    case 'BULK_DELETE': {
      const items = parseBulkItems(payload.items);
      return items.ok ? { ok: true, value: { items: items.value } } : items;
    }
    case 'BULK_SET_STATUS': {
      const items = parseBulkItems(payload.items);
      if (!items.ok) return items;
      if (!isTaskStatus(payload.status)) return invalid('bad status');
      return {
        ok: true,
        value: { items: items.value, status: payload.status },
      };
    }
    case 'BULK_REBIND': {
      const items = parseBulkItems(payload.items);
      if (!items.ok) return items;
      const checked = validateTarget(payload.target);
      if (!checked.ok) return checked;
      return { ok: true, value: { items: items.value, target: checked.value } };
    }
    case 'SET_PREFS': {
      const { scope } = payload;
      if (scope !== 'all' && scope !== 'current') return invalid('bad scope');
      return { ok: true, value: { scope } };
    }
    case 'RESIZE_WINDOW': {
      const { width, height } = payload;
      if (
        typeof width !== 'number' ||
        typeof height !== 'number' ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        return invalid('bad size');
      }
      // A size is a request: it is clamped, not refused.
      return { ok: true, value: clampWindow(width, height) };
    }
    case 'CREATE_NOTE': {
      const { id, kind, text, target } = payload;
      if (typeof id !== 'string') return invalid('bad id');
      if (!isNoteKind(kind)) return invalid('bad kind');
      if (typeof text !== 'string') return invalid('bad text');
      const checked = validateTarget(target);
      if (!checked.ok) return checked;
      return { ok: true, value: { id, kind, text, target: checked.value } };
    }
    case 'UPDATE_NOTE': {
      const { id, expectedRevision, text, target } = payload;
      if (typeof id !== 'string') return invalid('bad id');
      if (typeof expectedRevision !== 'number') return invalid('bad revision');
      const value: CommandPayloads['UPDATE_NOTE'] = { id, expectedRevision };
      if (text !== undefined) {
        if (typeof text !== 'string') return invalid('bad text');
        value.text = text;
      }
      if (target !== undefined) {
        const checked = validateTarget(target);
        if (!checked.ok) return checked;
        value.target = checked.value;
      }
      return { ok: true, value };
    }
    case 'SET_TASK_STATUS': {
      const { id, expectedRevision, status } = payload;
      if (typeof id !== 'string') return invalid('bad id');
      if (typeof expectedRevision !== 'number') return invalid('bad revision');
      if (!isTaskStatus(status)) return invalid('bad status');
      return { ok: true, value: { id, expectedRevision, status } };
    }
    case 'DELETE_NOTE': {
      const { id, expectedRevision } = payload;
      if (typeof id !== 'string') return invalid('bad id');
      if (typeof expectedRevision !== 'number') return invalid('bad revision');
      return { ok: true, value: { id, expectedRevision } };
    }
    case 'REBIND_NOTE': {
      const { id, expectedRevision, target } = payload;
      if (typeof id !== 'string') return invalid('bad id');
      if (typeof expectedRevision !== 'number') return invalid('bad revision');
      const checked = validateTarget(target);
      if (!checked.ok) return checked;
      return {
        ok: true,
        value: { id, expectedRevision, target: checked.value },
      };
    }
  }
}

/** Checks an unknown message from the UI. Unknown fields, including any author, are dropped. */
export function parseCommand(raw: unknown): Result<AnyCommand> {
  if (!isRecord(raw))
    return fail('INVALID_MESSAGE', 'message is not an object');
  if (raw.protocolVersion !== PROTOCOL_VERSION) {
    return fail('INVALID_MESSAGE', 'unsupported protocolVersion');
  }
  const ids = readMessageIds(raw);
  if (!ids) return fail('INVALID_MESSAGE', 'bad type, requestId or runId');
  if (!isRecord(raw.payload)) {
    return fail('INVALID_MESSAGE', 'payload is not an object');
  }
  const payload = parsePayload(ids.command, raw.payload);
  if (!payload.ok) return payload;
  return {
    ok: true,
    value: {
      protocolVersion: PROTOCOL_VERSION,
      type: ids.command,
      requestId: ids.requestId,
      runId: ids.runId,
      payload: payload.value,
    } as AnyCommand,
  };
}
