import type { Note, NoteTarget } from '../../src/shared/model';

export const FILE: NoteTarget = {
  type: 'file',
  id: null,
  pageId: null,
  nameSnapshot: null,
  pageNameSnapshot: null,
};

export const page = (id: string, name: string): NoteTarget => ({
  type: 'page',
  id,
  pageId: id,
  nameSnapshot: name,
  pageNameSnapshot: name,
});

export const frame = (
  id: string,
  name: string,
  pageId: string,
  pageName: string,
): NoteTarget => ({
  type: 'frame',
  id,
  pageId,
  nameSnapshot: name,
  pageNameSnapshot: pageName,
});

let counter = 0;

export function makeNote(patch: Partial<Note> & { target: NoteTarget }): Note {
  counter += 1;
  return {
    schemaVersion: 1,
    id: `n${counter}`,
    authorId: '42',
    kind: 'note',
    text: `text ${counter}`,
    status: null,
    createdAt: 1000 + counter,
    updatedAt: 1000 + counter,
    revision: 1,
    ...patch,
  };
}
