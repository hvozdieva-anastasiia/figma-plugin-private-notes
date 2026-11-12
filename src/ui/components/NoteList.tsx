import { totalCount } from '../../shared/group-notes';
import { useNotes } from '../NotesProvider';
import { useVisibleNotes } from '../visible';
import { NoteGroup } from './NoteGroup';
import { NoteItem } from './NoteItem';

const ids = (notes: { id: string }[]) => notes.map((note) => note.id);

/** Filter first, then group, then count what is visible. Nothing here writes data. */
export function NoteList() {
  const { state, actions } = useNotes();
  const { grouped } = useVisibleNotes();

  if (state.notes.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">No notes yet</p>
        <p className="empty__hint">
          Press + to add a note. Only you can see it, and it does not appear in
          the file as a layer or a comment.
        </p>
      </div>
    );
  }

  if (totalCount(grouped) === 0) {
    return (
      <div className="empty">
        <p className="empty__title">Nothing found</p>
        <p className="empty__hint">
          {state.scope === 'current'
            ? 'There are no notes for the current selection. Select another frame or show all notes.'
            : 'Change the search or the filter.'}
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            actions.setQuery('');
            actions.setFilter('all');
            actions.setScope('all');
          }}
        >
          Reset search and filters
        </button>
      </div>
    );
  }

  return (
    <div className="list">
      {grouped.file ? (
        <NoteGroup
          groupKey={grouped.file.key}
          title="Whole file"
          count={grouped.file.count}
          level="top"
          noteIds={ids(grouped.file.notes)}
        >
          <ul className="notes">
            {grouped.file.notes.map((note) => (
              <NoteItem key={note.id} note={note} showTarget={false} />
            ))}
          </ul>
        </NoteGroup>
      ) : null}
      {grouped.pages.map((page) => (
        <NoteGroup
          key={page.key}
          groupKey={page.key}
          title={`Page · ${page.label || '(untitled)'}`}
          count={page.count}
          level="top"
          noteIds={[
            ...ids(page.notes),
            ...page.frames.flatMap((frame) => ids(frame.notes)),
          ]}
        >
          {page.notes.length ? (
            <ul className="notes">
              {page.notes.map((note) => (
                <NoteItem key={note.id} note={note} showTarget={false} />
              ))}
            </ul>
          ) : null}
          {page.frames.map((frame) => (
            <NoteGroup
              key={frame.key}
              groupKey={frame.key}
              title={`Frame · ${frame.label || '(untitled)'}`}
              count={frame.count}
              level="nested"
              noteIds={ids(frame.notes)}
            >
              <ul className="notes">
                {frame.notes.map((note) => (
                  <NoteItem key={note.id} note={note} showTarget={false} />
                ))}
              </ul>
            </NoteGroup>
          ))}
        </NoteGroup>
      ))}
      {grouped.unresolved ? (
        <NoteGroup
          groupKey={grouped.unresolved.key}
          title="No available target"
          count={grouped.unresolved.count}
          level="top"
          noteIds={ids(grouped.unresolved.notes)}
        >
          <ul className="notes">
            {grouped.unresolved.notes.map((note) => (
              <NoteItem key={note.id} note={note} showTarget />
            ))}
          </ul>
        </NoteGroup>
      ) : null}
    </div>
  );
}
