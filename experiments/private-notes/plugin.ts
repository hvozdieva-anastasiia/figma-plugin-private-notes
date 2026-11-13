// Personal Notes & Tasks API probe (stage 2). Plugin Main.
// Writes only probe-prefixed pluginData on figma.root, never closes the window,
// never changes visible/locked of any layer and never creates nodes/comments.

import {
  cleanProbeData,
  createNote,
  deleteNote,
  listOwnNotes,
  seedSyntheticForeign,
  updateNote,
  type Failure,
  type PluginDataStore,
  type ProbeNote,
  type ProbeTarget,
  type ProbeTargetType,
} from './probe-core';
import {
  parseRequest,
  type Command,
  type ContextSnapshot,
  type ListData,
  type NodeInfo,
  type NoteView,
  type Reply,
} from './protocol';

const store: PluginDataStore = {
  keys: () => figma.root.getPluginDataKeys(),
  get: (key) => figma.root.getPluginData(key),
  set: (key, value) => figma.root.setPluginData(key, value),
};

// The author is always read here, never taken from a UI message.
function currentUser(): { id: string | null; name: string } | null {
  const user = figma.currentUser;
  return user ? { id: user.id, name: user.name } : null;
}
function currentUserId(): string | null {
  return currentUser()?.id ?? null;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeNoteId(): string {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  ).slice(0, 24);
}

function post(reply: Reply): void {
  figma.ui.postMessage(reply);
}

// ------------------------------------------------------------- node helpers

function isInsideInstance(node: BaseNode): boolean | null {
  try {
    let current: BaseNode | null = node.parent;
    while (current) {
      if (current.type === 'INSTANCE') return true;
      current = current.parent;
    }
    return false;
  } catch {
    return null;
  }
}

function describeNode(node: BaseNode): NodeInfo {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    visible: 'visible' in node ? node.visible : null,
    locked: 'locked' in node ? node.locked : null,
    insideInstance: isInsideInstance(node),
  };
}

function pageOf(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === 'PAGE') return current;
    current = current.parent;
  }
  return null;
}

function buildContext(): ContextSnapshot {
  const page = figma.currentPage;
  const selection = page.selection;
  return {
    user: currentUser(),
    documentName: figma.root.name,
    rootId: figma.root.id,
    page: { id: page.id, name: page.name, childCount: page.children.length },
    selection: selection.slice(0, 10).map(describeNode),
    selectionTruncated: selection.length > 10,
  };
}

// ------------------------------------------------------------ target capture

type TargetResult =
  | { ok: true; target: ProbeTarget }
  | { ok: false; code: string; message: string };

function captureTarget(type: ProbeTargetType): TargetResult {
  if (type === 'file') {
    return {
      ok: true,
      target: {
        type,
        id: null,
        pageId: null,
        nameSnapshot: null,
        pageNameSnapshot: null,
        nodeType: null,
      },
    };
  }
  const page = figma.currentPage;
  if (type === 'page') {
    return {
      ok: true,
      target: {
        type,
        id: page.id,
        pageId: page.id,
        nameSnapshot: page.name,
        pageNameSnapshot: page.name,
        nodeType: 'PAGE',
      },
    };
  }
  const selection = page.selection;
  const [node] = selection;
  if (selection.length !== 1 || !node) {
    return {
      ok: false,
      code: 'INVALID_TARGET',
      message: 'Выделите ровно один слой на текущей странице.',
    };
  }
  if (type === 'frame' && node.type !== 'FRAME') {
    return {
      ok: false,
      code: 'INVALID_TARGET',
      message: `Для цели frame нужен FRAME, выделен ${node.type}.`,
    };
  }
  return {
    ok: true,
    target: {
      type,
      id: node.id,
      pageId: page.id,
      nameSnapshot: node.name,
      pageNameSnapshot: page.name,
      nodeType: node.type,
    },
  };
}

// ------------------------------------------------------------- resolution

async function resolveNote(note: ProbeNote): Promise<NoteView> {
  const { target } = note;
  if (target.type === 'file' || target.id === null) {
    return {
      note,
      resolution: {
        state: 'file',
        nodeType: null,
        pageName: null,
        detail: null,
      },
    };
  }
  try {
    const node = await figma.getNodeByIdAsync(target.id);
    if (!node) {
      return {
        note,
        resolution: {
          state: 'missing',
          nodeType: null,
          pageName: null,
          detail: null,
        },
      };
    }
    const expected =
      target.type === 'page'
        ? 'PAGE'
        : target.type === 'frame'
          ? 'FRAME'
          : node.type;
    return {
      note,
      resolution: {
        state: node.type === expected ? 'available' : 'type-mismatch',
        nodeType: node.type,
        pageName: pageOf(node)?.name ?? null,
        detail: null,
      },
    };
  } catch (error) {
    return {
      note,
      resolution: {
        state: 'error',
        nodeType: null,
        pageName: null,
        detail: describeError(error),
      },
    };
  }
}

// -------------------------------------------------------------- navigation

interface FlagsSnapshot {
  visible: boolean | null;
  locked: boolean | null;
}

function flagsOf(node: BaseNode): FlagsSnapshot {
  return {
    visible: 'visible' in node ? node.visible : null,
    locked: 'locked' in node ? node.locked : null,
  };
}

function viewportState(): { center: { x: number; y: number }; zoom: number } {
  const { center, zoom } = figma.viewport;
  return { center: { x: center.x, y: center.y }, zoom };
}

async function navigate(note: ProbeNote) {
  const { target } = note;
  const report: Record<string, unknown> = {
    noteId: note.id,
    targetType: target.type,
    pageBefore: { id: figma.currentPage.id, name: figma.currentPage.name },
    selectionBefore: figma.currentPage.selection.map((node) => node.id),
    viewportBefore: viewportState(),
  };
  if (target.type === 'file' || target.id === null) {
    report.found = true;
    report.action = 'none: file target needs no navigation';
    return { ok: true, report };
  }
  const node = await figma.getNodeByIdAsync(target.id);
  if (!node) {
    report.found = false;
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'Цель не найдена (getNodeByIdAsync вернул null).',
      report,
    };
  }
  report.found = true;
  report.nodeType = node.type;
  report.flagsBefore = flagsOf(node);
  report.insideInstance = isInsideInstance(node);
  const page = pageOf(node);
  if (!page) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'У найденного узла нет предка PAGE.',
      report,
    };
  }
  report.targetPage = { id: page.id, name: page.name };
  if (page.id !== figma.currentPage.id) {
    await figma.setCurrentPageAsync(page);
    report.pageSwitched = true;
  } else {
    report.pageSwitched = false;
  }
  if (node.type === 'PAGE') {
    report.action = 'page switched only; selection and camera not changed';
  } else if (node.type !== 'DOCUMENT') {
    try {
      figma.currentPage.selection = [node];
      report.selectionError = null;
    } catch (error) {
      report.selectionError = describeError(error);
    }
    try {
      figma.viewport.scrollAndZoomIntoView([node]);
      report.viewportError = null;
    } catch (error) {
      report.viewportError = describeError(error);
    }
    report.action = 'selection + scrollAndZoomIntoView attempted';
  }
  const selectionAfter = figma.currentPage.selection.map((item) => item.id);
  report.pageAfter = { id: figma.currentPage.id, name: figma.currentPage.name };
  report.selectionAfter = selectionAfter;
  report.selectionMatchesTarget =
    selectionAfter.length === 1 && selectionAfter[0] === node.id;
  report.viewportAfter = viewportState();
  const flagsAfter = flagsOf(node);
  report.flagsAfter = flagsAfter;
  const before = report.flagsBefore as FlagsSnapshot;
  report.flagsUnchanged =
    before.visible === flagsAfter.visible &&
    before.locked === flagsAfter.locked;
  report.windowStillOpen = true;
  return { ok: true, report };
}

// ------------------------------------------------------------------ handler

interface Outcome {
  ok: boolean;
  code?: string | undefined;
  message?: string | undefined;
  data: unknown;
}

function fromFailure(failure: Failure): Outcome {
  return {
    ok: false,
    code: failure.code,
    message: failure.message,
    data: null,
  };
}

async function listData(): Promise<Outcome> {
  const user = currentUser();
  if (!user || user.id === null) {
    return {
      ok: false,
      code: 'NO_USER',
      message: 'figma.currentUser недоступен.',
      data: null,
    };
  }
  const report = listOwnNotes(store, user.id);
  const notes: NoteView[] = [];
  for (const note of report.notes) notes.push(await resolveNote(note));
  const data: ListData = {
    user,
    notes,
    problems: report.problems,
    counts: report.counts,
  };
  return { ok: true, data };
}

async function execute(command: Command): Promise<Outcome> {
  const userId = currentUserId();
  const now = Date.now();
  switch (command.op) {
    case 'INIT':
    case 'SNAPSHOT':
      return { ok: true, data: buildContext() };
    case 'LIST':
      return listData();
    case 'SAVE': {
      const captured = captureTarget(command.targetType);
      if (!captured.ok) {
        return {
          ok: false,
          code: captured.code,
          message: captured.message,
          data: null,
        };
      }
      const result = createNote(store, userId, now, {
        id: makeNoteId(),
        text: command.text,
        target: captured.target,
      });
      return result.ok ? { ok: true, data: result.value } : fromFailure(result);
    }
    case 'SAVE_ALL': {
      const results: unknown[] = [];
      let allOk = true;
      for (const type of ['file', 'page', 'frame'] as const) {
        const captured = captureTarget(type);
        if (!captured.ok) {
          allOk = false;
          results.push({
            type,
            ok: false,
            code: captured.code,
            message: captured.message,
          });
          continue;
        }
        const result = createNote(store, userId, now, {
          id: makeNoteId(),
          text: `${command.text} (${type})`,
          target: captured.target,
        });
        if (result.ok) results.push({ type, ok: true, id: result.value.id });
        else {
          allOk = false;
          results.push({
            type,
            ok: false,
            code: result.code,
            message: result.message,
          });
        }
      }
      return {
        ok: allOk,
        code: allOk ? undefined : 'PARTIAL',
        message: allOk ? undefined : 'Часть записей не сохранена.',
        data: results,
      };
    }
    case 'NAVIGATE': {
      if (userId === null)
        return fromFailure({ ok: false, code: 'NO_USER', message: 'no user' });
      const report = listOwnNotes(store, userId);
      const note = report.notes.find((item) => item.id === command.noteId);
      if (!note) {
        return {
          ok: false,
          code: 'NOT_FOUND',
          message: 'Своей записи с таким ID нет.',
          data: null,
        };
      }
      try {
        const outcome = await navigate(note);
        return {
          ok: outcome.ok,
          ...(outcome.ok
            ? {}
            : { code: outcome.code, message: outcome.message }),
          data: outcome.report,
        };
      } catch (error) {
        return {
          ok: false,
          code: 'API_ERROR',
          message: describeError(error),
          data: null,
        };
      }
    }
    case 'UPDATE': {
      const result = updateNote(
        store,
        userId,
        now,
        {
          noteId: command.noteId,
          claimedAuthorId: command.claimedAuthorId,
          expectedRevision: command.expectedRevision,
        },
        command.text,
      );
      return result.ok ? { ok: true, data: result.value } : fromFailure(result);
    }
    case 'DELETE': {
      const result = deleteNote(store, userId, {
        noteId: command.noteId,
        claimedAuthorId: command.claimedAuthorId,
        expectedRevision: command.expectedRevision,
      });
      return result.ok ? { ok: true, data: result.value } : fromFailure(result);
    }
    case 'SEED_FOREIGN': {
      const result = seedSyntheticForeign(store, userId, now);
      return result.ok ? { ok: true, data: result.value } : fromFailure(result);
    }
    case 'CLEAN': {
      const result = cleanProbeData(store, userId);
      return result.ok ? { ok: true, data: result.value } : fromFailure(result);
    }
  }
}

async function handle(raw: unknown): Promise<void> {
  const request = parseRequest(raw);
  if (!request) {
    post({
      kind: 'result',
      requestId: -1,
      op: 'INIT',
      ok: false,
      code: 'INVALID_COMMAND',
      message: 'Plugin Main отклонил неразобранное сообщение UI.',
      data: null,
    });
    return;
  }
  let outcome: Outcome;
  try {
    outcome = await execute(request.command);
  } catch (error) {
    outcome = {
      ok: false,
      code: 'API_ERROR',
      message: describeError(error),
      data: null,
    };
  }
  post({
    kind: 'result',
    requestId: request.requestId,
    op: request.command.op,
    ok: outcome.ok,
    code: outcome.code ?? null,
    message: outcome.message ?? null,
    data: outcome.data,
  });
}

figma.showUI(__html__, { width: 460, height: 720, themeColors: true });
figma.ui.onmessage = (message: unknown) => {
  void handle(message);
};
figma.on('selectionchange', () =>
  post({ kind: 'context', context: buildContext() }),
);
figma.on('currentpagechange', () =>
  post({ kind: 'context', context: buildContext() }),
);
// Intentionally no figma.closePlugin(): the window must stay open.
