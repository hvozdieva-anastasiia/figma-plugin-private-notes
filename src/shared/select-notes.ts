// Search and filters over the notes the window already holds. Pure: nothing is
// written and nothing is read from the document.

import type { Note, NoteTarget } from './model';
import { resolutionKey, type Resolutions } from './group-notes';
import type { TargetResolution } from './messages';

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
  /** What Figma reported for the notes' targets; absent entries are unchecked. */
  resolutions?: Resolutions;
}

export const DEFAULT_SELECT: Pick<SelectOptions, 'query' | 'filter' | 'scope'> =
  {
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

function resolutionOf(
  note: Note,
  resolutions: Resolutions | undefined,
): TargetResolution | undefined {
  const { target } = note;
  if (target.type === 'file') return undefined;
  return resolutions?.get(resolutionKey(target.type, target.id));
}

export function matchesQuery(
  note: Note,
  query: string,
  resolutions?: Resolutions,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;
  const live = resolutionOf(note, resolutions);
  const names =
    live?.state === 'available'
      ? `${live.name} ${live.pageName}`
      : targetNames(note.target);
  return (
    note.text.toLowerCase().includes(needle) ||
    names.toLowerCase().includes(needle)
  );
}

/**
 * "Current selection": the notes of the working frame and of the frames inside
 * it; without such a frame,
 * the notes of the current page and of the frames saved on it. Whole-file notes
 * belong to the general mode only.
 */
export function matchesScope(
  note: Note,
  scope: Scope,
  current: CurrentSelection,
  resolutions?: Resolutions,
): boolean {
  if (scope === 'all') return true;
  const { target } = note;
  const live = resolutionOf(note, resolutions);
  // A note whose target is gone is not on any page: only the general list shows it.
  if (live?.state === 'missing') return false;
  if (current.frameId !== null) {
    if (target.type !== 'frame') return false;
    if (target.id === current.frameId) return true;
    // A frame inside the working frame counts too, however deep it is.
    return (
      live?.state === 'available' &&
      (live.ancestorFrameIds ?? []).includes(current.frameId)
    );
  }
  if (current.pageId !== null) {
    if (target.type === 'page') return target.id === current.pageId;
    if (target.type === 'frame') {
      // The page a frame is on now, not the one remembered when it was saved.
      const pageId = live?.state === 'available' ? live.pageId : target.pageId;
      return pageId === current.pageId;
    }
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
      matchesQuery(note, options.query, options.resolutions) &&
      matchesScope(note, options.scope, options.current, options.resolutions),
  );
}

/**
 * IDs of the notes that belong to the current selection, whatever the search,
 * the filter or the scope: the "here" indicator never hides anything.
 */
export function hereIds(
  notes: readonly Note[],
  current: CurrentSelection,
  resolutions?: Resolutions,
): Set<string> {
  const ids = new Set<string>();
  for (const note of notes) {
    if (matchesScope(note, 'current', current, resolutions)) ids.add(note.id);
  }
  return ids;
}
