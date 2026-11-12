// Search and filters over the notes the window already holds. Pure: nothing is
// written and nothing is read from the document.

import type { Note, NoteTarget } from './model';

export type KindFilter = 'all' | 'notes' | 'open' | 'done';
export type Scope = 'all' | 'current';

/** What the "current selection" mode follows: one selected frame, else the page. */
export interface CurrentSelection {
  frameId: string | null;
  pageId: string | null;
}

export interface SelectOptions {
  query: string;
  filter: KindFilter;
  scope: Scope;
  current: CurrentSelection;
}

export const DEFAULT_SELECT: Omit<SelectOptions, 'current'> = {
  query: '',
  filter: 'all',
  scope: 'all',
};

export function matchesFilter(note: Note, filter: KindFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'notes':
      return note.kind === 'note';
    case 'open':
      return note.kind === 'task' && note.status === 'open';
    case 'done':
      return note.kind === 'task' && note.status === 'done';
  }
}

function targetNames(target: NoteTarget): string {
  return `${target.nameSnapshot ?? ''} ${target.pageNameSnapshot ?? ''}`;
}

export function matchesQuery(note: Note, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  return (
    note.text.toLowerCase().includes(needle) ||
    targetNames(note.target).toLowerCase().includes(needle)
  );
}

/**
 * "По текущему выбору": the notes of one selected frame; without such a frame,
 * the notes of the current page and of the frames saved on it. Whole-file notes
 * belong to the general mode only.
 */
export function matchesScope(
  note: Note,
  scope: Scope,
  current: CurrentSelection,
): boolean {
  if (scope === 'all') return true;
  const { target } = note;
  if (current.frameId !== null) {
    return target.type === 'frame' && target.id === current.frameId;
  }
  if (current.pageId !== null) {
    return (
      (target.type === 'page' && target.id === current.pageId) ||
      (target.type === 'frame' && target.pageId === current.pageId)
    );
  }
  return false;
}

export function selectNotes(
  notes: readonly Note[],
  options: SelectOptions,
): Note[] {
  return notes.filter(
    (note) =>
      matchesFilter(note, options.filter) &&
      matchesQuery(note, options.query) &&
      matchesScope(note, options.scope, options.current),
  );
}
