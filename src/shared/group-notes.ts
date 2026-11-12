// Builds the single grouped list: whole file, pages with their own notes and
// their frames, and notes without a reachable target. Pure.
//
// Groups are keyed by target type and ID, never by name. Names and the page of
// a frame come from `resolutions` (what Figma reported for the target) when
// they are known, and from the snapshot stored in the note otherwise. A target
// whose resolution is `missing` moves its notes to "No available target";
// `unchecked`, `checking` and `error` never do.

import type { Note } from './model';
import type { TargetResolution } from './messages';

export type Resolutions = ReadonlyMap<string, TargetResolution>;

export function resolutionKey(type: 'page' | 'frame', id: string): string {
  return `${type}:${id}`;
}

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
  resolutions?: Resolutions;
}

const byRecent = (a: Note, b: Note) =>
  b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);

const byLabel = <T extends { label: string; id: string }>(a: T, b: T) =>
  a.label.localeCompare(b.label) || a.id.localeCompare(b.id);

interface Placed {
  note: Note;
  name: string;
  pageId: string;
  pageName: string;
  /** Names come from Figma now, not from the snapshot in the note. */
  live: boolean;
}

interface Label {
  text: string;
  live: boolean;
  updatedAt: number;
}

/** A live name beats a snapshot; among equals the newest note decides. */
function better(candidate: Label, current: Label | undefined): boolean {
  if (!current) return true;
  if (candidate.live !== current.live) return candidate.live;
  return candidate.updatedAt > current.updatedAt;
}

function place(note: Note, resolution: TargetResolution | undefined): Placed {
  const { target } = note;
  if (resolution?.state === 'available') {
    return {
      note,
      name: resolution.name,
      pageId: resolution.pageId,
      pageName: resolution.pageName,
      live: true,
    };
  }
  return {
    note,
    name: target.nameSnapshot ?? '',
    pageId: target.pageId ?? '',
    pageName: target.pageNameSnapshot ?? '',
    live: false,
  };
}

export function groupNotes(
  notes: readonly Note[],
  options: GroupOptions = {},
): GroupedNotes {
  const fileNotes: Note[] = [];
  const unresolvedNotes: Note[] = [];
  const pageNotes = new Map<string, Placed[]>();
  const frameNotes = new Map<string, Placed[]>();

  for (const note of notes) {
    const { target } = note;
    if (target.type === 'file') {
      fileNotes.push(note);
      continue;
    }
    const resolution = options.resolutions?.get(
      resolutionKey(target.type, target.id),
    );
    if (resolution?.state === 'missing') {
      unresolvedNotes.push(note);
      continue;
    }
    const placed = place(note, resolution);
    const map = target.type === 'page' ? pageNotes : frameNotes;
    const list = map.get(target.id) ?? [];
    list.push(placed);
    map.set(target.id, list);
  }

  const pages = new Map<string, PageGroup>();
  const pageLabels = new Map<string, Label>();
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
  const offerPageLabel = (pageId: string, p: Placed, text: string) => {
    const candidate = { text, live: p.live, updatedAt: p.note.updatedAt };
    if (better(candidate, pageLabels.get(pageId))) {
      pageLabels.set(pageId, candidate);
    }
  };

  for (const [id, list] of pageNotes) {
    const group = ensurePage(id);
    group.notes = list.map((p) => p.note).sort(byRecent);
    for (const p of list) offerPageLabel(id, p, p.name);
  }

  for (const [id, list] of frameNotes) {
    // All notes of one frame share its resolution, so any of them names it.
    let label: Label | undefined;
    let pageId = '';
    for (const p of list) {
      const candidate = {
        text: p.name,
        live: p.live,
        updatedAt: p.note.updatedAt,
      };
      if (better(candidate, label)) {
        label = candidate;
        pageId = p.pageId;
      }
    }
    const frameGroup: FrameGroup = {
      key: `frame:${id}`,
      id,
      label: label?.text ?? '',
      notes: list.map((p) => p.note).sort(byRecent),
      count: list.length,
    };
    ensurePage(pageId).frames.push(frameGroup);
    for (const p of list) {
      if (p.pageId === pageId) offerPageLabel(pageId, p, p.pageName);
    }
  }

  for (const [pageId, group] of pages) {
    group.label = pageLabels.get(pageId)?.text ?? '';
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
