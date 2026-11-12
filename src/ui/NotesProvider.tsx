// The only component that knows how state is produced: reducer + bridge. UI
// components read `state`, `actions` and `meta` from the context and do not
// know about messages.

import {
  createContext,
  use,
  useEffect,
  useReducer,
  type ReactNode,
} from 'react';
import type { Note, NoteKind, NoteTarget } from '../shared/model';
import type { KindFilter, Scope } from '../shared/select-notes';
import { targetsEqual } from '../shared/validation';
import { randomId, type Bridge } from './bridge';
import { errorText } from './labels';
import {
  defaultTarget,
  initialState,
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
  openEdit(note: Note): void;
  closeEditor(): void;
  askDiscard(asked: boolean): void;
  setEditorText(text: string): void;
  setEditorKind(kind: NoteKind): void;
  setEditorTarget(target: NoteTarget): void;
  setPickerOpen(open: boolean): void;
  saveEditor(editor: EditorDraft): Promise<void>;
  toggleStatus(note: Note): Promise<void>;
  askDelete(id: string | null): void;
  confirmDelete(note: Note): Promise<void>;
  dismissNotice(): void;
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

const SAVED = 'Записано в документ';

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

  const actions: NotesActions = {
    async refresh() {
      dispatch({ type: 'REFRESHING', value: true });
      const result = await bridge.request('REFRESH_NOTES', {});
      if (result.ok) dispatch({ type: 'NOTES_LOADED', data: result.value });
      else {
        dispatch({ type: 'REFRESHING', value: false });
        dispatch({
          type: 'NOTICE',
          notice: { kind: 'error', text: fail(result.code, result.message) },
        });
      }
    },
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
        },
      });
    },
    openEdit(note) {
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
          pickerOpen: false,
          discardAsked: false,
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
  };

  return (
    <NotesContext value={{ state, actions, meta: { bridge } }}>
      {children}
    </NotesContext>
  );
}
