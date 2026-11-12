// The only component that knows how state is produced: reducer + bridge. UI
// components read `state`, `actions` and `meta` from the context and do not
// know about messages.

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type {
  Note,
  NoteKind,
  NoteTarget,
  Result,
  TaskStatus,
} from '../shared/model';
import { resolutionKey } from '../shared/group-notes';
import {
  MAX_TARGET_REFS,
  type BulkData,
  type BulkItem,
  type TargetRef,
} from '../shared/messages';
import type { KindFilter, Scope } from '../shared/select-notes';
import { targetsEqual } from '../shared/validation';
import { randomId, type Bridge } from './bridge';
import { count, errorText } from './labels';
import {
  defaultTarget,
  initialState,
  neededTargets,
  reducer,
  type EditorDraft,
  type State,
} from './state';

export interface NotesActions {
  refresh(): Promise<void>;
  retryInit(): Promise<void>;
  setQuery(query: string): void;
  setFilter(filter: KindFilter): void;
  setScope(scope: Scope): void;
  toggleGroup(key: string): void;
  openCreate(): void;
  /** `rebind` opens the editor with the choice of another target already open. */
  openEdit(note: Note, options?: { rebind?: boolean }): void;
  /** Moves the user to the page or frame of the note. Whole-file notes have nowhere to go. */
  focusNote(note: Note): Promise<void>;
  /** Checks the target of a note again after the check failed. */
  retryTarget(note: Note): void;
  closeEditor(): void;
  askDiscard(asked: boolean): void;
  setEditorText(text: string): void;
  setEditorKind(kind: NoteKind): void;
  setEditorTarget(target: NoteTarget): void;
  setPickerOpen(open: boolean): void;
  saveEditor(editor: EditorDraft): Promise<void>;
  /**
   * After a conflict: `overwrite` repeats the user's change on the current
   * version (or recreates a vanished note), `discard` drops the draft, `keep`
   * goes back to editing.
   */
  resolveConflict(
    editor: EditorDraft,
    choice: 'overwrite' | 'discard' | 'keep',
  ): Promise<void>;
  toggleStatus(note: Note): Promise<void>;
  askDelete(id: string | null): void;
  confirmDelete(note: Note): Promise<void>;
  dismissNotice(): void;

  // Selection mode and bulk actions.
  setSelectMode(on: boolean): void;
  toggleSelected(id: string): void;
  /** Tick (`on`) or untick several notes at once, for example a whole group. */
  setSelected(ids: string[], on: boolean): void;
  selectOnly(ids: string[]): void;
  openBulkPanel(panel: 'move' | 'delete'): void;
  closeBulkPanel(): void;
  setMoveTarget(target: NoteTarget): void;
  setMovePicker(open: boolean): void;
  bulkDelete(): Promise<void>;
  bulkStatus(status: TaskStatus): Promise<void>;
  bulkMove(): Promise<void>;

  /** Asks Plugin Main to resize the window; the size is clamped there. */
  resizeWindow(width: number, height: number): void;
}

export interface NotesContextValue {
  state: State;
  actions: NotesActions;
  meta: { bridge: Bridge };
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function useNotes(): NotesContextValue {
  const value = use(NotesContext);
  if (!value) throw new Error('useNotes must be used inside NotesProvider');
  return value;
}

const SAVED = 'Saved to the document';

/** Coming back to the window refreshes the list, but not more often than this. */
const FOCUS_REFRESH_MIN_MS = 1500;

export function NotesProvider({
  bridge,
  children,
}: {
  bridge: Bridge;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  async function loadInit(): Promise<void> {
    dispatch({ type: 'LOADING' });
    const result = await bridge.request('READY', {});
    if (result.ok) dispatch({ type: 'INIT_OK', data: result.value });
    else {
      dispatch({
        type: 'INIT_FAILED',
        message: errorText(result.code, result.message),
      });
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await bridge.request('READY', {});
      if (!active) return;
      if (result.ok) dispatch({ type: 'INIT_OK', data: result.value });
      else {
        dispatch({
          type: 'INIT_FAILED',
          message: errorText(result.code, result.message),
        });
      }
    })();
    const off = bridge.onContext((context) =>
      dispatch({ type: 'CONTEXT', context }),
    );
    return () => {
      active = false;
      off();
    };
  }, [bridge]);

  const fail = (code: Parameters<typeof errorText>[0], message: string) =>
    errorText(code, message);

  const selectedNotes = (): Note[] => {
    const ids = new Set(state.selection.ids);
    return state.notes.filter((note) => ids.has(note.id));
  };
  const toItems = (list: Note[]): BulkItem[] =>
    list.map((note) => ({ id: note.id, expectedRevision: note.revision }));

  /**
   * Applies the per-note answers of a bulk command and tells the user what
   * happened. Notes that failed stay selected so that the action can be repeated.
   */
  function reportBulk(
    result: Result<BulkData>,
    done: (n: number) => string,
    extra = '',
  ): void {
    if (!result.ok) {
      dispatch({ type: 'BULK_BUSY', busy: false });
      dispatch({
        type: 'NOTICE',
        notice: { kind: 'error', text: fail(result.code, result.message) },
      });
      return;
    }
    const { results } = result.value;
    dispatch({ type: 'BULK_APPLIED', results });
    const succeeded = results.filter((item) => item.ok).length;
    const firstFailure = results.find((item) => !item.ok);
    const tail = extra === '' ? '' : ` ${extra}.`;
    if (firstFailure && !firstFailure.ok) {
      dispatch({
        type: 'NOTICE',
        notice: {
          kind: 'error',
          text: `${done(succeeded)}, ${results.length - succeeded} failed: ${fail(firstFailure.code, firstFailure.message)}${tail}`,
        },
      });
    } else {
      dispatch({
        type: 'NOTICE',
        notice: { kind: 'success', text: `${done(succeeded)}.${tail}` },
      });
    }
  }

  // Targets are checked on demand, in bounded batches, only for the notes held
  // here; the document is never scanned. `error` answers are not retried by
  // themselves, so a failing API cannot cause an endless loop.
  const { notes, resolutions, checking, generation } = state;
  const neededKey = neededTargets(notes, resolutions, checking)
    .map((ref) => resolutionKey(ref.type, ref.id))
    .join('|');
  useEffect(() => {
    if (neededKey === '') return;
    const refs: TargetRef[] = neededKey.split('|').map((key) => {
      const split = key.indexOf(':');
      return {
        type: key.slice(0, split) === 'page' ? 'page' : 'frame',
        id: key.slice(split + 1),
      };
    });
    dispatch({
      type: 'RESOLVE_STARTED',
      keys: refs.map((ref) => resolutionKey(ref.type, ref.id)),
    });
    for (let i = 0; i < refs.length; i += MAX_TARGET_REFS) {
      const chunk = refs.slice(i, i + MAX_TARGET_REFS);
      void bridge
        .request('REFRESH_TARGETS', { targets: chunk })
        .then((result) => {
          dispatch({
            type: 'RESOLVED',
            generation,
            keys: chunk.map((ref) => resolutionKey(ref.type, ref.id)),
            resolutions: result.ok
              ? result.value.resolutions
              : chunk.map((ref) => ({ ...ref, state: 'error' as const })),
          });
        });
    }
  }, [bridge, neededKey, generation]);

  // The document is the source of truth and can change under the window
  // (Undo, Redo, another window). The list is read again on request and when
  // the window gets the focus back, at most once in a short time. A failed
  // reading is reported, never repeated by itself.
  const inFlight = useRef(false);
  const lastRefresh = useRef(0);
  const refreshNotes = useCallback(
    async (reason: 'manual' | 'focus'): Promise<void> => {
      if (inFlight.current) return;
      inFlight.current = true;
      lastRefresh.current = Date.now();
      // Renames, moves and deletions are asked about again as well.
      dispatch({ type: 'CLEAR_RESOLUTIONS' });
      dispatch({ type: 'REFRESHING', value: true });
      const result = await bridge.request('REFRESH_NOTES', {});
      inFlight.current = false;
      if (result.ok) {
        dispatch({ type: 'NOTES_LOADED', data: result.value });
        return;
      }
      dispatch({ type: 'REFRESHING', value: false });
      const why = errorText(result.code, result.message);
      dispatch({
        type: 'NOTICE',
        notice: {
          kind: 'error',
          text:
            reason === 'focus'
              ? `Could not refresh the list; it may be out of date. ${why}`
              : why,
        },
      });
    },
    [bridge],
  );

  const ready = state.phase === 'ready';
  useEffect(() => {
    if (!ready) return;
    lastRefresh.current = Date.now();
    const onFocus = () => {
      if (Date.now() - lastRefresh.current < FOCUS_REFRESH_MIN_MS) return;
      void refreshNotes('focus');
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [ready, refreshNotes]);

  const actions: NotesActions = {
    refresh: () => refreshNotes('manual'),
    retryInit: loadInit,
    setQuery: (query) => dispatch({ type: 'SET_QUERY', query }),
    setFilter: (filter) => dispatch({ type: 'SET_FILTER', filter }),
    setScope: (scope) => dispatch({ type: 'SET_SCOPE', scope }),
    toggleGroup: (key) => dispatch({ type: 'TOGGLE_GROUP', key }),

    openCreate() {
      dispatch({
        type: 'OPEN_EDITOR',
        editor: {
          mode: 'create',
          noteId: randomId(),
          expectedRevision: null,
          kind: 'note',
          text: '',
          originalText: '',
          originalTarget: null,
          // Fixed now; only the dropdown changes it from here on.
          draftTarget: defaultTarget(state.context),
          saving: false,
          error: null,
          pickerOpen: false,
          discardAsked: false,
          conflict: null,
        },
      });
    },
    async focusNote(note) {
      const { target } = note;
      if (target.type === 'file') return;
      const result = await bridge.request('FOCUS_NOTE', { id: note.id });
      if (result.ok) return;
      if (result.code === 'TARGET_NOT_FOUND') {
        // Only a definite "not found" moves the note to the group without a target.
        dispatch({
          type: 'TARGET_MISSING',
          target: { type: target.type, id: target.id },
        });
      }
      dispatch({
        type: 'NOTICE',
        notice: { kind: 'error', text: fail(result.code, result.message) },
      });
    },
    retryTarget(note) {
      const { target } = note;
      if (target.type === 'file') return;
      dispatch({
        type: 'RETRY_RESOLUTIONS',
        keys: [resolutionKey(target.type, target.id)],
      });
    },
    openEdit(note, options) {
      dispatch({
        type: 'OPEN_EDITOR',
        editor: {
          mode: 'edit',
          noteId: note.id,
          expectedRevision: note.revision,
          kind: note.kind,
          text: note.text,
          originalText: note.text,
          originalTarget: note.target,
          draftTarget: note.target,
          saving: false,
          error: null,
          pickerOpen: options?.rebind === true,
          discardAsked: false,
          conflict: null,
        },
      });
    },
    closeEditor: () => dispatch({ type: 'CLOSE_EDITOR' }),
    askDiscard: (asked) =>
      dispatch({ type: 'EDITOR_PATCH', patch: { discardAsked: asked } }),
    setEditorText: (text) =>
      dispatch({ type: 'EDITOR_PATCH', patch: { text, error: null } }),
    setEditorKind: (kind) =>
      dispatch({ type: 'EDITOR_PATCH', patch: { kind } }),
    setEditorTarget: (target) =>
      dispatch({
        type: 'EDITOR_PATCH',
        patch: { draftTarget: target, pickerOpen: false, error: null },
      }),
    setPickerOpen: (open) =>
      dispatch({ type: 'EDITOR_PATCH', patch: { pickerOpen: open } }),

    async saveEditor(editor) {
      if (editor.saving) return;
      dispatch({
        type: 'EDITOR_PATCH',
        patch: { saving: true, error: null },
      });
      let result;
      if (editor.mode === 'create') {
        result = await bridge.request('CREATE_NOTE', {
          id: editor.noteId,
          kind: editor.kind,
          text: editor.text,
          target: editor.draftTarget,
        });
      } else {
        const payload: {
          id: string;
          expectedRevision: number;
          text?: string;
          target?: NoteTarget;
        } = {
          id: editor.noteId,
          expectedRevision: editor.expectedRevision ?? 0,
        };
        if (editor.text !== editor.originalText) payload.text = editor.text;
        // The old target may be gone: only a changed target is sent and checked.
        if (
          editor.originalTarget === null ||
          !targetsEqual(editor.draftTarget, editor.originalTarget)
        ) {
          payload.target = editor.draftTarget;
        }
        if (payload.text === undefined && payload.target === undefined) {
          dispatch({ type: 'CLOSE_EDITOR' });
          return;
        }
        result = await bridge.request('UPDATE_NOTE', payload);
      }
      if (result.ok) {
        dispatch({ type: 'NOTE_SAVED', note: result.value });
        dispatch({ type: 'CLOSE_EDITOR' });
        dispatch({ type: 'NOTICE', notice: { kind: 'success', text: SAVED } });
      } else if (
        editor.mode === 'edit' &&
        (result.code === 'REVISION_CONFLICT' || result.code === 'NOT_FOUND')
      ) {
        // The note changed or vanished after the editor opened: read the
        // document, show how the note is now and let the user decide.
        const fresh = await bridge.request('REFRESH_NOTES', {});
        if (fresh.ok) {
          dispatch({ type: 'NOTES_LOADED', data: fresh.value });
          const current = fresh.value.notes.find(
            (note) => note.id === editor.noteId,
          );
          dispatch({
            type: 'EDITOR_PATCH',
            patch: {
              saving: false,
              error: null,
              conflict: current
                ? { kind: 'changed', current }
                : { kind: 'deleted' },
            },
          });
          return;
        }
        dispatch({
          type: 'EDITOR_PATCH',
          patch: { saving: false, error: fail(fresh.code, fresh.message) },
        });
      } else {
        // The draft stays so that nothing typed is lost.
        dispatch({
          type: 'EDITOR_PATCH',
          patch: {
            saving: false,
            error: fail(result.code, result.message),
          },
        });
      }
    },

    async resolveConflict(editor, choice) {
      const conflict = editor.conflict;
      if (!conflict || editor.saving) return;
      if (choice === 'keep') {
        dispatch({ type: 'EDITOR_PATCH', patch: { conflict: null } });
        return;
      }
      if (choice === 'discard') {
        dispatch({ type: 'CLOSE_EDITOR' });
        return;
      }
      // Repeat the user's own change on top of the version that is there now.
      if (conflict.kind === 'changed') {
        const { current } = conflict;
        await actions.saveEditor({
          ...editor,
          expectedRevision: current.revision,
          originalText: current.text,
          originalTarget: current.target,
          conflict: null,
        });
        return;
      }
      // The note is gone: the same text and target become a new note.
      await actions.saveEditor({
        ...editor,
        mode: 'create',
        noteId: randomId(),
        expectedRevision: null,
        originalText: '',
        originalTarget: null,
        conflict: null,
      });
    },

    async toggleStatus(note) {
      if (note.kind !== 'task' || state.busyIds.includes(note.id)) return;
      dispatch({ type: 'BUSY', id: note.id, busy: true });
      const result = await bridge.request('SET_TASK_STATUS', {
        id: note.id,
        expectedRevision: note.revision,
        status: note.status === 'done' ? 'open' : 'done',
      });
      dispatch({ type: 'BUSY', id: note.id, busy: false });
      if (result.ok) dispatch({ type: 'NOTE_SAVED', note: result.value });
      else {
        dispatch({
          type: 'NOTICE',
          notice: { kind: 'error', text: fail(result.code, result.message) },
        });
      }
    },

    askDelete: (id) => dispatch({ type: 'ASK_DELETE', id }),
    async confirmDelete(note) {
      if (state.busyIds.includes(note.id)) return;
      dispatch({ type: 'BUSY', id: note.id, busy: true });
      const result = await bridge.request('DELETE_NOTE', {
        id: note.id,
        expectedRevision: note.revision,
      });
      dispatch({ type: 'BUSY', id: note.id, busy: false });
      // NOT_FOUND on delete means it is already gone: the card can go too.
      if (result.ok || result.code === 'NOT_FOUND') {
        dispatch({ type: 'NOTE_DELETED', id: note.id });
      } else {
        dispatch({
          type: 'NOTICE',
          notice: { kind: 'error', text: fail(result.code, result.message) },
        });
      }
    },

    dismissNotice: () => dispatch({ type: 'NOTICE', notice: null }),

    setSelectMode: (on) => dispatch({ type: 'SELECT_MODE', on }),
    toggleSelected: (id) => dispatch({ type: 'SELECT_TOGGLE', id }),
    setSelected: (ids, on) => dispatch({ type: 'SELECT_SET', ids, on }),
    selectOnly: (ids) => dispatch({ type: 'SELECT_ONLY', ids }),
    openBulkPanel(panel) {
      dispatch(
        panel === 'move'
          ? {
              type: 'BULK_PANEL',
              panel,
              // Fixed now; only the move panel's dropdown changes it.
              moveTarget: defaultTarget(state.context),
            }
          : { type: 'BULK_PANEL', panel },
      );
    },
    closeBulkPanel: () => dispatch({ type: 'BULK_PANEL', panel: 'none' }),
    setMoveTarget: (target) => dispatch({ type: 'BULK_MOVE_TARGET', target }),
    setMovePicker: (open) => dispatch({ type: 'BULK_PICKER', open }),

    async bulkDelete() {
      const selected = selectedNotes();
      if (selected.length === 0 || state.bulk.busy) return;
      dispatch({ type: 'BULK_BUSY', busy: true });
      const result = await bridge.request('BULK_DELETE', {
        items: toItems(selected),
      });
      reportBulk(result, (n) => `Deleted ${count(n, 'note')}`);
    },
    async bulkStatus(status) {
      const selected = selectedNotes();
      const tasks = selected.filter((note) => note.kind === 'task');
      if (state.bulk.busy) return;
      if (tasks.length === 0) {
        dispatch({
          type: 'NOTICE',
          notice: { kind: 'error', text: 'Select at least one task.' },
        });
        return;
      }
      const skipped = selected.length - tasks.length;
      dispatch({ type: 'BULK_BUSY', busy: true });
      const result = await bridge.request('BULK_SET_STATUS', {
        items: toItems(tasks),
        status,
      });
      reportBulk(
        result,
        (n) =>
          `Marked ${count(n, 'task')} ${status === 'done' ? 'done' : 'open'}`,
        skipped > 0 ? `${count(skipped, 'note')} skipped (not tasks)` : '',
      );
    },
    async bulkMove() {
      const selected = selectedNotes();
      if (selected.length === 0 || state.bulk.busy) return;
      dispatch({ type: 'BULK_BUSY', busy: true });
      const result = await bridge.request('BULK_REBIND', {
        items: toItems(selected),
        target: state.bulk.moveTarget,
      });
      reportBulk(result, (n) => `Moved ${count(n, 'note')}`);
    },

    resizeWindow(width, height) {
      void bridge.request('RESIZE_WINDOW', { width, height });
    },
  };

  return (
    <NotesContext value={{ state, actions, meta: { bridge } }}>
      {children}
    </NotesContext>
  );
}
