import { useMemo } from 'react';
import { groupNotes, type GroupedNotes } from '../shared/group-notes';
import type { Note } from '../shared/model';
import { selectNotes } from '../shared/select-notes';
import { useNotes } from './NotesProvider';
import { currentSelection } from './state';

/**
 * The notes the list shows right now: search, filter and scope first, then
 * grouping and counts over what is left. Nothing here writes data.
 */
export function useVisibleNotes(): { visible: Note[]; grouped: GroupedNotes } {
  const { state } = useNotes();
  const { notes, query, filter, scope, context, resolutions } = state;
  return useMemo(() => {
    const known = new Map(Object.entries(resolutions));
    const visible = selectNotes(notes, {
      query,
      filter,
      scope,
      current: currentSelection(context),
      resolutions: known,
    });
    return { visible, grouped: groupNotes(visible, { resolutions: known }) };
  }, [notes, query, filter, scope, context, resolutions]);
}
