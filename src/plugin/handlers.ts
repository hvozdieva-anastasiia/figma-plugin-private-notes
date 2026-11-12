// Plugin Main's command handler. Everything that touches Figma is injected, so
// the handler is tested with fakes. Commands carry no author; the notes service
// reads figma.currentUser on every call.

import type { Failure, NoteTarget, Result } from '../shared/model';
import {
  PROTOCOL_VERSION,
  parseCommand,
  readMessageIds,
  type AnyCommand,
  type AnyResponse,
  type CommandResults,
  type CommandType,
  type DocumentContext,
  type NotesData,
  type ResponseMessage,
  type TargetsData,
} from '../shared/messages';
import { fail } from '../shared/validation';
import type { ListReport } from './storage/document-notes';
import type { NotesService } from './notes-service';

export interface HandlerDeps {
  service: NotesService;
  getContext(): DocumentContext;
  /**
   * Checks that a page or frame exists and returns the target with current
   * names and the real page of a frame. `file` passes unchanged.
   */
  resolveTarget(target: NoteTarget): Promise<Result<NoteTarget>>;
  listTargets(request: {
    kind: 'page' | 'frame';
    pageId: string | null;
    query: string;
  }): Promise<Result<TargetsData>>;
}

function notesData(report: ListReport): NotesData {
  return {
    notes: report.notes,
    problems: report.problems.map(({ noteId, reason, detail }) => ({
      noteId,
      reason,
      detail,
    })),
  };
}

function respond<C extends CommandType>(
  command: C,
  ids: { requestId: string; runId: string },
  result: Result<CommandResults[C]>,
): ResponseMessage<C> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'RESPONSE',
    command,
    requestId: ids.requestId,
    runId: ids.runId,
    result,
  };
}

/** A failure fits every command's result type; the cast only joins the union. */
function respondFailure(
  command: CommandType,
  ids: { requestId: string; runId: string },
  failure: Failure,
): AnyResponse {
  return respond(command, ids, failure) as AnyResponse;
}

export type CommandHandler = (raw: unknown) => Promise<AnyResponse | null>;

export function createCommandHandler(deps: HandlerDeps): CommandHandler {
  const { service } = deps;

  async function execute(command: AnyCommand): Promise<AnyResponse> {
    const ids = command;
    switch (command.type) {
      case 'READY': {
        const listed = service.list();
        return respond(
          'READY',
          ids,
          listed.ok
            ? {
                ok: true,
                value: {
                  ...notesData(listed.value),
                  context: deps.getContext(),
                },
              }
            : listed,
        );
      }
      case 'REFRESH_NOTES': {
        const listed = service.list();
        return respond(
          'REFRESH_NOTES',
          ids,
          listed.ok ? { ok: true, value: notesData(listed.value) } : listed,
        );
      }
      case 'LIST_TARGETS':
        return respond(
          'LIST_TARGETS',
          ids,
          await deps.listTargets(command.payload),
        );
      case 'CREATE_NOTE': {
        const target = await deps.resolveTarget(command.payload.target);
        if (!target.ok) return respond('CREATE_NOTE', ids, target);
        return respond(
          'CREATE_NOTE',
          ids,
          service.create({ ...command.payload, target: target.value }),
        );
      }
      case 'UPDATE_NOTE': {
        const { id, expectedRevision, text, target } = command.payload;
        const input: Parameters<NotesService['update']>[0] = {
          id,
          expectedRevision,
        };
        if (text !== undefined) input.text = text;
        if (target !== undefined) {
          // A changed target must exist; an unchanged text edit never checks it.
          const resolved = await deps.resolveTarget(target);
          if (!resolved.ok) return respond('UPDATE_NOTE', ids, resolved);
          input.target = resolved.value;
        }
        return respond('UPDATE_NOTE', ids, service.update(input));
      }
      case 'REBIND_NOTE': {
        const resolved = await deps.resolveTarget(command.payload.target);
        if (!resolved.ok) return respond('REBIND_NOTE', ids, resolved);
        return respond(
          'REBIND_NOTE',
          ids,
          service.rebind({ ...command.payload, target: resolved.value }),
        );
      }
      case 'SET_TASK_STATUS':
        return respond(
          'SET_TASK_STATUS',
          ids,
          service.setStatus(command.payload),
        );
      case 'DELETE_NOTE':
        return respond('DELETE_NOTE', ids, service.remove(command.payload));
    }
  }

  return async (raw) => {
    const parsed = parseCommand(raw);
    if (!parsed.ok) {
      // Answer only when the sender can be identified.
      const ids = readMessageIds(raw);
      return ids ? respondFailure(ids.command, ids, parsed) : null;
    }
    try {
      return await execute(parsed.value);
    } catch {
      // An API exception is reported as a failure, never as success, and not retried.
      return respondFailure(
        parsed.value.type,
        parsed.value,
        fail('INTERNAL', 'Figma API error'),
      );
    }
  };
}
