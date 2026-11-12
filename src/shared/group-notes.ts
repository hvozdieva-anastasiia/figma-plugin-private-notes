// Builds the single grouped list: whole file, pages with their own notes and
// their frames, and notes without a reachable target. Pure and driven by what
// the notes already say about their targets; resolving moved or deleted
// targets is a later step (stage 6) that feeds `missingNoteIds`.

import type { Note } from './model';

export interface FileGroup {
  key: 'file';
  notes: Note[];
  count: number;
}

export interface FrameGroup {
  key: string;
  id: string;
  label: string;
  notes: Note[];
  count: number;
}

export interface PageGroup {
  key: string;
  id: string;
  label: string;
  /** Notes attached to the page itself. */
  notes: Note[];
  frames: FrameGroup[];
  /** Own notes plus the notes of its frames, each note counted once. */
  count: number;
}

export interface UnresolvedGroup {
  key: 'unresolved';
  notes: Note[];
  count: number;
}

export interface GroupedNotes {
  file: FileGroup | null;
  pages: PageGroup[];
  unresolved: UnresolvedGroup | null;
}

export interface GroupOptions {
  /** Notes whose target is known to be missing. */
  missingNoteIds?: ReadonlySet<string>;
}

const byRecent = (a: Note, b: Note) =>
  b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);

const byLabel = <T extends { label: string; id: string }>(a: T, b: T) =>
  a.label.localeCompare(b.label) || a.id.localeCompare(b.id);

/** The newest note of a group decides its label: names are only snapshots. */
function newest(notes: readonly Note[]): Note {
  let best = notes[0] as Note;
  for (const note of notes) if (note.updatedAt > best.updatedAt) best = note;
  return best;
}

export function groupNotes(
  notes: readonly Note[],
  options: GroupOptions = {},
): GroupedNotes {
  const missing = options.missingNoteIds;
  const fileNotes: Note[] = [];
  const unresolvedNotes: Note[] = [];
  const pageNotes = new Map<string, Note[]>();
  const frameNotes = new Map<string, Note[]>();

  for (const note of notes) {
    const { target } = note;
    if (missing?.has(note.id)) {
      unresolvedNotes.push(note);
    } else if (target.type === 'file') {
      fileNotes.push(note);
    } else if (target.type === 'page') {
      const list = pageNotes.get(target.id) ?? [];
      list.push(note);
      pageNotes.set(target.id, list);
    } else {
      const list = frameNotes.get(target.id) ?? [];
      list.push(note);
      frameNotes.set(target.id, list);
    }
  }

  // A page group exists when the page or any of its frames has a note.
  const pages = new Map<string, PageGroup>();
  const labelSources = new Map<string, Note[]>();
  const rememberLabel = (pageId: string, note: Note) => {
    const list = labelSources.get(pageId) ?? [];
    list.push(note);
    labelSources.set(pageId, list);
  };
  const ensurePage = (pageId: string): PageGroup => {
    let group = pages.get(pageId);
    if (!group) {
      group = {
        key: `page:${pageId}`,
        id: pageId,
        label: '',
        notes: [],
        frames: [],
        count: 0,
      };
      pages.set(pageId, group);
    }
    return group;
  };

  for (const [id, list] of pageNotes) {
    const group = ensurePage(id);
    group.notes = [...list].sort(byRecent);
    for (const note of list) rememberLabel(id, note);
  }
  for (const [id, list] of frameNotes) {
    const latest = newest(list);
    const pageId = latest.target.pageId as string;
    const frame: FrameGroup = {
      key: `frame:${id}`,
      id,
      label: latest.target.nameSnapshot ?? '',
      notes: [...list].sort(byRecent),
      count: list.length,
    };
    const page = ensurePage(pageId);
    page.frames.push(frame);
    rememberLabel(pageId, latest);
  }

  for (const [pageId, group] of pages) {
    const sources = labelSources.get(pageId) ?? [];
    group.label = sources.length
      ? (newest(sources).target.pageNameSnapshot ?? '')
      : '';
    group.frames.sort(byLabel);
    group.count =
      group.notes.length +
      group.frames.reduce((sum, frame) => sum + frame.count, 0);
  }

  return {
    file: fileNotes.length
      ? {
          key: 'file',
          notes: [...fileNotes].sort(byRecent),
          count: fileNotes.length,
        }
      : null,
    pages: [...pages.values()].sort(byLabel),
    unresolved: unresolvedNotes.length
      ? {
          key: 'unresolved',
          notes: [...unresolvedNotes].sort(byRecent),
          count: unresolvedNotes.length,
        }
      : null,
  };
}

/** Number of notes in the whole grouped list, each counted once. */
export function totalCount(grouped: GroupedNotes): number {
  return (
    (grouped.file?.count ?? 0) +
    grouped.pages.reduce((sum, page) => sum + page.count, 0) +
    (grouped.unresolved?.count ?? 0)
  );
}
