import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROTOCOL_VERSION,
  type DocumentContext,
} from '../../src/shared/messages';
import { createBridge, randomId, type Transport } from '../../src/ui/bridge';
import {
  currentSelection,
  defaultTarget,
  initialState,
  reducer,
  type EditorDraft,
  type State,
} from '../../src/ui/state';
import { FILE, frame, makeNote, page } from './fixtures';

function fakeTransport() {
  const sent: Record<string, unknown>[] = [];
  const listeners = new Set<(message: unknown) => void>();
  const transport: Transport = {
    post: (message) => sent.push(message as Record<string, unknown>),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const emit = (message: unknown) => listeners.forEach((l) => l(message));
  return { transport, sent, emit, listeners };
}

describe('bridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('sends protocolVersion, requestId and runId and resolves with the matching answer', async () => {
    const { transport, sent, emit } = fakeTransport();
    const bridge = createBridge(transport, {
      runId: 'run-1',
      newId: () => 'req-1',
    });
    const pending = bridge.request('DELETE_NOTE', {
      id: 'a',
      expectedRevision: 2,
    });
    expect(sent[0]).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: 'DELETE_NOTE',
      requestId: 'req-1',
      runId: 'run-1',
      payload: { id: 'a', expectedRevision: 2 },
    });
    emit({
      protocolVersion: PROTOCOL_VERSION,
      type: 'RESPONSE',
      command: 'DELETE_NOTE',
      requestId: 'req-1',
      runId: 'run-1',
      result: { ok: true, value: { id: 'a' } },
    });
    expect(await pending).toEqual({ ok: true, value: { id: 'a' } });
  });

  it('never puts an author into a request', () => {
    const { transport, sent } = fakeTransport();
    const bridge = createBridge(transport);
    void bridge.request('CREATE_NOTE', {
      id: 'a',
      kind: 'note',
      text: 't',
      target: FILE,
    });
    expect(JSON.stringify(sent[0])).not.toMatch(/author/i);
  });

  it('ignores answers of another window run, another request or another command', async () => {
    const { transport, emit } = fakeTransport();
    const bridge = createBridge(transport, {
      runId: 'run-1',
      newId: () => 'req-1',
      timeoutMs: 100,
    });
    const pending = bridge.request('REFRESH_NOTES', {});
    const answer = (patch: Record<string, unknown>) =>
      emit({
        protocolVersion: PROTOCOL_VERSION,
        type: 'RESPONSE',
        command: 'REFRESH_NOTES',
        requestId: 'req-1',
        runId: 'run-1',
        result: { ok: true, value: { notes: [], problems: [] } },
        ...patch,
      });
    answer({ runId: 'old-run' });
    answer({ requestId: 'other' });
    answer({ command: 'READY' });
    answer({ protocolVersion: 99 });
    emit('noise');
    await vi.advanceTimersByTimeAsync(100);
    expect(await pending).toMatchObject({ ok: false, code: 'TIMEOUT' });
  });

  it('times out when the plugin does not answer and drops a late answer', async () => {
    const { transport, emit } = fakeTransport();
    const bridge = createBridge(transport, {
      runId: 'r',
      newId: () => 'q',
      timeoutMs: 50,
    });
    const pending = bridge.request('REFRESH_NOTES', {});
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ ok: false, code: 'TIMEOUT' });
    expect(() =>
      emit({
        protocolVersion: PROTOCOL_VERSION,
        type: 'RESPONSE',
        command: 'REFRESH_NOTES',
        requestId: 'q',
        runId: 'r',
        result: { ok: true, value: { notes: [], problems: [] } },
      }),
    ).not.toThrow();
  });

  it('forwards context events and stops after dispose', () => {
    const { transport, emit, listeners } = fakeTransport();
    const bridge = createBridge(transport);
    const seen: DocumentContext[] = [];
    bridge.onContext((context) => seen.push(context));
    const context: DocumentContext = {
      page: { id: '0:1', name: 'P' },
      selection: [],
      selectionCount: 0,
    };
    emit({
      protocolVersion: PROTOCOL_VERSION,
      type: 'CONTEXT_CHANGED',
      context,
    });
    expect(seen).toEqual([context]);
    bridge.dispose();
    expect(listeners.size).toBe(0);
  });

  it('makes ids that are valid note ids', () => {
    expect(randomId()).toMatch(/^[A-Za-z0-9-]{1,64}$/);
  });
});

describe('state', () => {
  const context: DocumentContext = {
    page: { id: '0:1', name: 'Mobile' },
    selection: [{ id: '1:4', type: 'FRAME', name: 'Checkout' }],
    selectionCount: 1,
  };
  const editor: EditorDraft = {
    mode: 'create',
    noteId: 'n',
    expectedRevision: null,
    kind: 'note',
    text: 'draft',
    originalText: '',
    originalTarget: null,
    draftTarget: page('0:1', 'Mobile'),
    saving: false,
    error: null,
    pickerOpen: false,
    discardAsked: false,
  };
  const ready = (patch: Partial<State> = {}): State => ({
    ...initialState,
    phase: 'ready',
    context,
    ...patch,
  });

  it('keeps the draft target when the selection or the page changes', () => {
    const state = ready({ editor });
    const moved: DocumentContext = {
      page: { id: '0:9', name: 'Other' },
      selection: [{ id: '5:5', type: 'FRAME', name: 'Elsewhere' }],
      selectionCount: 1,
    };
    const next = reducer(state, { type: 'CONTEXT', context: moved });
    expect(next.context).toEqual(moved);
    expect(next.editor?.draftTarget).toEqual(editor.draftTarget);
    expect(next.editor?.text).toBe('draft');
  });

  it('changes the draft target only through the editor patch', () => {
    const target = frame('1:4', 'Checkout', '0:1', 'Mobile');
    const next = reducer(ready({ editor }), {
      type: 'EDITOR_PATCH',
      patch: { draftTarget: target },
    });
    expect(next.editor?.draftTarget).toEqual(target);
  });

  it('collapses and expands a group without touching the notes', () => {
    const note = makeNote({ target: FILE });
    const state = ready({ notes: [note] });
    const collapsed = reducer(state, { type: 'TOGGLE_GROUP', key: 'file' });
    expect(collapsed.collapsed).toEqual({ file: true });
    expect(collapsed.notes).toBe(state.notes);
    expect(
      reducer(collapsed, { type: 'TOGGLE_GROUP', key: 'file' }).collapsed,
    ).toEqual({});
  });

  it('search, filter and scope do not change the data', () => {
    const state = ready({ notes: [makeNote({ target: FILE })] });
    let next = reducer(state, { type: 'SET_QUERY', query: 'x' });
    next = reducer(next, { type: 'SET_FILTER', filter: 'done' });
    next = reducer(next, { type: 'SET_SCOPE', scope: 'current' });
    expect(next.notes).toBe(state.notes);
    expect(next).toMatchObject({
      query: 'x',
      filter: 'done',
      scope: 'current',
    });
  });

  it('replaces a saved note by id and removes a deleted one', () => {
    const note = makeNote({ target: FILE, text: 'old' });
    let state = ready({ notes: [note] });
    state = reducer(state, {
      type: 'NOTE_SAVED',
      note: { ...note, text: 'new', revision: 2 },
    });
    expect(state.notes).toHaveLength(1);
    expect(state.notes[0]?.text).toBe('new');
    state = reducer(state, { type: 'NOTE_DELETED', id: note.id });
    expect(state.notes).toEqual([]);
  });

  it('counts unreadable records without dropping the readable ones', () => {
    const note = makeNote({ target: FILE });
    const next = reducer(initialState, {
      type: 'INIT_OK',
      data: {
        notes: [note],
        problems: [{ noteId: 'x', reason: 'corrupt', detail: '' }],
        context,
      },
    });
    expect(next).toMatchObject({ phase: 'ready', unreadable: 1 });
    expect(next.notes).toEqual([note]);
  });

  it('derives the current frame only from exactly one selected FRAME', () => {
    expect(currentSelection(context)).toEqual({
      frameId: '1:4',
      pageId: '0:1',
    });
    expect(
      currentSelection({ ...context, selectionCount: 2 }).frameId,
    ).toBeNull();
    expect(
      currentSelection({
        ...context,
        selection: [{ id: '1:5', type: 'RECTANGLE', name: 'r' }],
      }).frameId,
    ).toBeNull();
    expect(currentSelection(null)).toEqual({ frameId: null, pageId: null });
  });

  it('defaults a new note to the selected frame, else the page, else the file', () => {
    expect(defaultTarget(context)).toMatchObject({
      type: 'frame',
      id: '1:4',
      pageId: '0:1',
    });
    expect(
      defaultTarget({ ...context, selection: [], selectionCount: 0 }),
    ).toMatchObject({
      type: 'page',
      id: '0:1',
    });
    expect(defaultTarget(null)).toEqual(FILE);
  });
});
