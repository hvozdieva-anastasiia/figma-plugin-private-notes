// Messages between the probe UI and Plugin Main. Types and a runtime guard only:
// no Figma or DOM globals. The UI never sends an authorId that Plugin Main
// trusts; `claimedAuthorId` exists only so the probe can test its rejection.

import type {
  KeyCounts,
  ListProblem,
  ProbeNote,
  ProbeTargetType,
} from './probe-core';

export type Command =
  | { op: 'INIT' }
  | { op: 'SNAPSHOT' }
  | { op: 'LIST' }
  | { op: 'SAVE'; targetType: ProbeTargetType; text: string }
  | { op: 'SAVE_ALL'; text: string }
  | { op: 'NAVIGATE'; noteId: string }
  | {
      op: 'UPDATE';
      noteId: string;
      text: string;
      expectedRevision: number | null;
      claimedAuthorId: string | null;
    }
  | {
      op: 'DELETE';
      noteId: string;
      expectedRevision: number | null;
      claimedAuthorId: string | null;
    }
  | { op: 'SEED_FOREIGN' }
  | { op: 'CLEAN' };

export interface Request {
  requestId: number;
  command: Command;
}

export interface NodeInfo {
  id: string;
  type: string;
  name: string;
  visible: boolean | null;
  locked: boolean | null;
  insideInstance: boolean | null;
}

export interface ContextSnapshot {
  user: { id: string | null; name: string } | null;
  documentName: string;
  rootId: string;
  page: { id: string; name: string; childCount: number };
  selection: NodeInfo[];
  selectionTruncated: boolean;
}

export interface NoteView {
  note: ProbeNote;
  resolution: {
    state: 'file' | 'available' | 'missing' | 'type-mismatch' | 'error';
    nodeType: string | null;
    pageName: string | null;
    detail: string | null;
  };
}

export interface ListData {
  user: { id: string | null; name: string };
  notes: NoteView[];
  problems: ListProblem[];
  counts: KeyCounts;
}

export type Reply =
  | {
      kind: 'result';
      requestId: number;
      op: Command['op'];
      ok: boolean;
      code: string | null;
      message: string | null;
      data: unknown;
    }
  | { kind: 'context'; context: ContextSnapshot };

const COMMAND_OPS: readonly string[] = [
  'INIT',
  'SNAPSHOT',
  'LIST',
  'SAVE',
  'SAVE_ALL',
  'NAVIGATE',
  'UPDATE',
  'DELETE',
  'SEED_FOREIGN',
  'CLEAN',
];
const TARGET_TYPES: readonly string[] = ['file', 'page', 'frame', 'node'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function stringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
function numberOrNull(value: unknown): value is number | null {
  return (
    value === null || (typeof value === 'number' && Number.isFinite(value))
  );
}

/** Validates an untrusted UI message; returns null when it is malformed. */
export function parseRequest(raw: unknown): Request | null {
  if (!isObject(raw) || typeof raw.requestId !== 'number') return null;
  const command = raw.command;
  if (!isObject(command) || typeof command.op !== 'string') return null;
  if (!COMMAND_OPS.includes(command.op)) return null;
  const requestId = raw.requestId;
  switch (command.op) {
    case 'INIT':
    case 'SNAPSHOT':
    case 'LIST':
    case 'SEED_FOREIGN':
    case 'CLEAN':
      return { requestId, command: { op: command.op } };
    case 'SAVE':
      return typeof command.text === 'string' &&
        typeof command.targetType === 'string' &&
        TARGET_TYPES.includes(command.targetType)
        ? {
            requestId,
            command: {
              op: 'SAVE',
              targetType: command.targetType as ProbeTargetType,
              text: command.text,
            },
          }
        : null;
    case 'SAVE_ALL':
      return typeof command.text === 'string'
        ? { requestId, command: { op: 'SAVE_ALL', text: command.text } }
        : null;
    case 'NAVIGATE':
      return typeof command.noteId === 'string'
        ? { requestId, command: { op: 'NAVIGATE', noteId: command.noteId } }
        : null;
    case 'UPDATE':
      return typeof command.noteId === 'string' &&
        typeof command.text === 'string' &&
        numberOrNull(command.expectedRevision) &&
        stringOrNull(command.claimedAuthorId)
        ? {
            requestId,
            command: {
              op: 'UPDATE',
              noteId: command.noteId,
              text: command.text,
              expectedRevision: command.expectedRevision,
              claimedAuthorId: command.claimedAuthorId,
            },
          }
        : null;
    case 'DELETE':
      return typeof command.noteId === 'string' &&
        numberOrNull(command.expectedRevision) &&
        stringOrNull(command.claimedAuthorId)
        ? {
            requestId,
            command: {
              op: 'DELETE',
              noteId: command.noteId,
              expectedRevision: command.expectedRevision,
              claimedAuthorId: command.claimedAuthorId,
            },
          }
        : null;
    default:
      return null;
  }
}
