// The single owner of UI state. The editor draft (text and its target) lives
// apart from the document context: selection and page changes update only
// `context`, never `editor.draftTarget`.

import type { Note, NoteKind, NoteTarget } from '../shared/model';
import type {
  DocumentContext,
  InitData,
  NotesData,
  TargetRef,
  TargetResolution,
  BulkItemResult,
} from '../shared/messages';
import { resolutionKey } from '../shared/group-notes';
import {
  DEFAULT_SELECT,
  type CurrentSelection,
  type KindFilter,
  type Scope,
} from '../shared/select-notes';

export interface EditorDraft {
  mode: 'create' | 'edit';
  /** New id for a created note (reused on retry), or the id being edited. */
  noteId: string;
  expectedRevision: number | null;
  kind: NoteKind;
  text: string;
  originalText: string;
  /** Target stored in the note being edited; `null` when creating. */
  originalTarget: NoteTarget | null;
  /** Chosen by the dropdown only; the canvas never changes it. */
  draftTarget: NoteTarget;
  saving: boolean;
  error: string | null;
  pickerOpen: boolean;
  discardAsked: boolean;
}

export interface Notice {
  kind: 'success' | 'error';
  text: string;
  /** Changes with every notice so that identical texts restart the timer. */
  id: number;
}

export interface State {
  phase: 'loading' | 'ready' | 'failed';
  failure: string | null;
  notes: Note[];
  /** Own records that could not be read. */
  unreadable: number;
  context: DocumentContext | null;
  query: string;
  filter: KindFilter;
  scope: Scope;
  collapsed: Record<string, true>;
  editor: EditorDraft | null;
  confirmDeleteId: string | null;
  busyIds: string[];
  refreshing: boolean;
  notice: Notice | null;
  /**
   * What Figma reported for page and frame targets, keyed `type:id`. Absent
   * means unchecked. This is a cache of the document, never of the notes.
   */
  resolutions: Record<string, TargetResolution>;
  /** Targets with a request in flight. */
  checking: Record<string, true>;
  /** Grows when the cache is cleared, so that answers to old requests are dropped. */
  generation: number;
  /** Selection mode: which notes are ticked for a bulk action. */
  selection: { active: boolean; ids: string[] };
  bulk: BulkPanel;
}

export interface BulkPanel {
  /** `move` and `delete` ask for the last details before a bulk action runs. */
  panel: 'none' | 'move' | 'delete';
  /** Chosen by the dropdown of the move panel only, like an editor's target. */
  moveTarget: NoteTarget;
  pickerOpen: boolean;
  busy: boolean;
}

export const initialState: State = {
  phase: 'loading',
  failure: null,
  notes: [],
  unreadable: 0,
  context: null,
  query: DEFAULT_SELECT.query,
  filter: DEFAULT_SELECT.filter,
  scope: DEFAULT_SELECT.scope,
  collapsed: {},
  editor: null,
  confirmDeleteId: null,
  busyIds: [],
  refreshing: false,
  notice: null,
  resolutions: {},
  checking: {},
  generation: 0,
  selection: { active: false, ids: [] },
  bulk: {
    panel: 'none',
    moveTarget: {
      type: 'file',
      id: null,
      pageId: null,
      nameSnapshot: null,
      pageNameSnapshot: null,
    },
    pickerOpen: false,
    busy: false,
  },
};

export type EditorPatch = Partial<
  Pick<
    EditorDraft,
    | 'text'
    | 'kind'
    | 'draftTarget'
    | 'pickerOpen'
    | 'error'
    | 'saving'
    | 'discardAsked'
  >
>;

export type Action =
  | { type: 'LOADING' }
  | { type: 'INIT_OK'; data: InitData }
  | { type: 'INIT_FAILED'; message: string }
  | { type: 'NOTES_LOADED'; data: NotesData }
  | { type: 'REFRESHING'; value: boolean }
  | { type: 'CONTEXT'; context: DocumentContext }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'SET_FILTER'; filter: KindFilter }
  | { type: 'SET_SCOPE'; scope: Scope }
  | { type: 'TOGGLE_GROUP'; key: string }
  | { type: 'OPEN_EDITOR'; editor: EditorDraft }
  | { type: 'EDITOR_PATCH'; patch: EditorPatch }
  | { type: 'CLOSE_EDITOR' }
  | { type: 'NOTE_SAVED'; note: Note }
  | { type: 'NOTE_DELETED'; id: string }
  | { type: 'ASK_DELETE'; id: string | null }
  | { type: 'BUSY'; id: string; busy: boolean }
  | { type: 'NOTICE'; notice: Omit<Notice, 'id'> | null }
  | { type: 'RESOLVE_STARTED'; keys: string[] }
  | {
      type: 'RESOLVED';
      generation: number;
      keys: string[];
      resolutions: TargetResolution[];
    }
  /** Forget what is known about all targets; the next check asks Figma again. */
  | { type: 'CLEAR_RESOLUTIONS' }
  /** Forget `error` results of some targets so that they are checked again. */
  | { type: 'RETRY_RESOLUTIONS'; keys: string[] }
  | { type: 'TARGET_MISSING'; target: TargetRef }
  | { type: 'SELECT_MODE'; on: boolean }
  | { type: 'SELECT_TOGGLE'; id: string }
  /** Tick (`on`) or untick several notes at once, for example a whole group. */
  | { type: 'SELECT_SET'; ids: string[]; on: boolean }
  | { type: 'SELECT_ONLY'; ids: string[] }
  | { type: 'BULK_PANEL'; panel: BulkPanel['panel']; moveTarget?: NoteTarget }
  | { type: 'BULK_MOVE_TARGET'; target: NoteTarget }
  | { type: 'BULK_PICKER'; open: boolean }
  | { type: 'BULK_BUSY'; busy: boolean }
  /** Applies the per-note answers of a bulk command. */
  | { type: 'BULK_APPLIED'; results: BulkItemResult[] };

let noticeCounter = 0;

function upsert(notes: Note[], note: Note): Note[] {
  const index = notes.findIndex((item) => item.id === note.id);
  if (index === -1) return [...notes, note];
  const next = notes.slice();
  next[index] = note;
  return next;
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADING':
      return { ...state, phase: 'loading', failure: null };
    case 'INIT_OK':
      return {
        ...state,
        phase: 'ready',
        failure: null,
        notes: action.data.notes,
        unreadable: action.data.problems.length,
        context: action.data.context,
      };
    case 'INIT_FAILED':
      return { ...state, phase: 'failed', failure: action.message };
    case 'NOTES_LOADED':
      return {
        ...state,
        notes: action.data.notes,
        unreadable: action.data.problems.length,
        refreshing: false,
      };
    case 'REFRESHING':
      return { ...state, refreshing: action.value };
    case 'CONTEXT':
      // Only the context changes. The draft target of an open editor stays.
      return { ...state, context: action.context };
    case 'SET_QUERY':
      return { ...state, query: action.query };
    case 'SET_FILTER':
      return { ...state, filter: action.filter };
    case 'SET_SCOPE':
      return { ...state, scope: action.scope };
    case 'TOGGLE_GROUP': {
      const collapsed = { ...state.collapsed };
      if (collapsed[action.key]) delete collapsed[action.key];
      else collapsed[action.key] = true;
      return { ...state, collapsed };
    }
    case 'OPEN_EDITOR':
      return { ...state, editor: action.editor, confirmDeleteId: null };
    case 'EDITOR_PATCH':
      return state.editor
        ? { ...state, editor: { ...state.editor, ...action.patch } }
        : state;
    case 'CLOSE_EDITOR':
      return { ...state, editor: null };
    case 'NOTE_SAVED':
      return { ...state, notes: upsert(state.notes, action.note) };
    case 'NOTE_DELETED':
      return {
        ...state,
        notes: state.notes.filter((note) => note.id !== action.id),
        confirmDeleteId: null,
        selection: {
          ...state.selection,
          ids: state.selection.ids.filter((id) => id !== action.id),
        },
      };
    case 'SELECT_MODE':
      return {
        ...state,
        selection: { active: action.on, ids: [] },
        bulk: { ...state.bulk, panel: 'none', pickerOpen: false },
        confirmDeleteId: null,
      };
    case 'SELECT_TOGGLE': {
      const has = state.selection.ids.includes(action.id);
      return {
        ...state,
        selection: {
          ...state.selection,
          ids: has
            ? state.selection.ids.filter((id) => id !== action.id)
            : [...state.selection.ids, action.id],
        },
      };
    }
    case 'SELECT_SET': {
      const ids = new Set(state.selection.ids);
      for (const id of action.ids) {
        if (action.on) ids.add(id);
        else ids.delete(id);
      }
      return { ...state, selection: { ...state.selection, ids: [...ids] } };
    }
    case 'SELECT_ONLY':
      return {
        ...state,
        selection: { ...state.selection, ids: [...new Set(action.ids)] },
      };
    case 'BULK_PANEL':
      return {
        ...state,
        bulk: {
          ...state.bulk,
          panel: action.panel,
          pickerOpen: false,
          moveTarget: action.moveTarget ?? state.bulk.moveTarget,
        },
      };
    case 'BULK_MOVE_TARGET':
      return {
        ...state,
        bulk: { ...state.bulk, moveTarget: action.target, pickerOpen: false },
      };
    case 'BULK_PICKER':
      return { ...state, bulk: { ...state.bulk, pickerOpen: action.open } };
    case 'BULK_BUSY':
      return { ...state, bulk: { ...state.bulk, busy: action.busy } };
    case 'BULK_APPLIED': {
      let notes = state.notes;
      const failed: string[] = [];
      for (const result of action.results) {
        if (!result.ok) {
          failed.push(result.id);
        } else if (result.note === null) {
          notes = notes.filter((note) => note.id !== result.id);
        } else {
          notes = upsert(notes, result.note);
        }
      }
      // Notes that failed stay ticked so that the action can be repeated for them.
      const kept = state.selection.ids.filter((id) => failed.includes(id));
      return {
        ...state,
        notes,
        selection: { ...state.selection, ids: kept },
        bulk: { ...state.bulk, panel: 'none', pickerOpen: false, busy: false },
      };
    }
    case 'ASK_DELETE':
      return { ...state, confirmDeleteId: action.id };
    case 'BUSY': {
      const rest = state.busyIds.filter((id) => id !== action.id);
      return {
        ...state,
        busyIds: action.busy ? [...rest, action.id] : rest,
      };
    }
    case 'RESOLVE_STARTED': {
      const checking = { ...state.checking };
      for (const key of action.keys) checking[key] = true;
      return { ...state, checking };
    }
    case 'RESOLVED': {
      // An answer to a request made before the cache was cleared is stale.
      if (action.generation !== state.generation) return state;
      const checking = { ...state.checking };
      for (const key of action.keys) delete checking[key];
      const resolutions = { ...state.resolutions };
      for (const item of action.resolutions) {
        resolutions[resolutionKey(item.type, item.id)] = item;
      }
      return { ...state, checking, resolutions };
    }
    case 'CLEAR_RESOLUTIONS':
      return {
        ...state,
        resolutions: {},
        checking: {},
        generation: state.generation + 1,
      };
    case 'RETRY_RESOLUTIONS': {
      const resolutions = { ...state.resolutions };
      for (const key of action.keys) {
        if (resolutions[key]?.state === 'error') delete resolutions[key];
      }
      return { ...state, resolutions };
    }
    case 'TARGET_MISSING': {
      const { type, id } = action.target;
      return {
        ...state,
        resolutions: {
          ...state.resolutions,
          [resolutionKey(type, id)]: { type, id, state: 'missing' },
        },
      };
    }
    case 'NOTICE':
      return {
        ...state,
        notice: action.notice
          ? { ...action.notice, id: (noticeCounter += 1) }
          : null,
      };
  }
}

// ---------------------------------------------------------------- selectors

/** One selected FRAME is the current frame; anything else is not. */
export function currentSelection(
  context: DocumentContext | null,
): CurrentSelection {
  if (!context) return { frameId: null, pageId: null };
  const [only] = context.selection;
  const frameId =
    context.selectionCount === 1 && only?.type === 'FRAME' ? only.id : null;
  return { frameId, pageId: context.page.id };
}

export function frameTargetFromContext(
  context: DocumentContext,
): NoteTarget | null {
  const [only] = context.selection;
  if (context.selectionCount !== 1 || only?.type !== 'FRAME') return null;
  return {
    type: 'frame',
    id: only.id,
    pageId: context.page.id,
    nameSnapshot: only.name,
    pageNameSnapshot: context.page.name,
  };
}

export function pageTargetFromContext(context: DocumentContext): NoteTarget {
  return {
    type: 'page',
    id: context.page.id,
    pageId: context.page.id,
    nameSnapshot: context.page.name,
    pageNameSnapshot: context.page.name,
  };
}

export const FILE_TARGET: NoteTarget = {
  type: 'file',
  id: null,
  pageId: null,
  nameSnapshot: null,
  pageNameSnapshot: null,
};

/** Default target of a new note: the selected frame, else the current page. */
export function defaultTarget(context: DocumentContext | null): NoteTarget {
  if (!context) return FILE_TARGET;
  return frameTargetFromContext(context) ?? pageTargetFromContext(context);
}

/** Distinct page and frame targets of the notes that nobody has asked about yet. */
export function neededTargets(
  notes: readonly Note[],
  resolutions: Record<string, TargetResolution>,
  checking: Record<string, true>,
): TargetRef[] {
  const found = new Map<string, TargetRef>();
  for (const note of notes) {
    const { target } = note;
    if (target.type === 'file') continue;
    const key = resolutionKey(target.type, target.id);
    if (resolutions[key] || checking[key] || found.has(key)) continue;
    found.set(key, { type: target.type, id: target.id });
  }
  return [...found.values()];
}

export function isDirty(editor: EditorDraft): boolean {
  return editor.text !== editor.originalText;
}
