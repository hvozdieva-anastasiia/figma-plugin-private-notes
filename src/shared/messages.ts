// Messages between the UI (React) and Plugin Main. No author field exists in
// any command: Plugin Main always uses figma.currentUser.
//
// Every command carries protocolVersion, requestId and runId. The runId is
// chosen by one UI load and filters out answers addressed to an older window.

import type {
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
}

export interface NotesData {
  notes: Note[];
  /** Own records that could not be read; the rest of the notes are intact. */
  problems: NoteProblem[];
}

export interface InitData extends NotesData {
  context: DocumentContext;
}

/** A page or a frame the user may choose in "Привязка". */
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
}

export type CommandType = keyof CommandPayloads;

export interface CommandResults {
  READY: InitData;
  REFRESH_NOTES: NotesData;
  LIST_TARGETS: TargetsData;
  CREATE_NOTE: Note;
  UPDATE_NOTE: Note;
  SET_TASK_STATUS: Note;
  DELETE_NOTE: { id: string };
  REBIND_NOTE: Note;
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
