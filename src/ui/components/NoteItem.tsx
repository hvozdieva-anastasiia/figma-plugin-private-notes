import type { Note } from '../../shared/model';
import { resolutionKey } from '../../shared/group-notes';
import { useNotes } from '../NotesProvider';
import { targetLabel } from '../labels';
import { CheckIcon, EditIcon, GoToIcon, TrashIcon } from './Icons';

/**
 * One note. Normally: optional task checkbox, text, where it is attached and
 * its actions. In selection mode the task checkbox and the actions give way to
 * a selection checkbox, and a click on the note ticks it.
 */
export function NoteItem({
  note,
  showTarget,
}: {
  note: Note;
  /** The group heading already names the target; only the lost group repeats it. */
  showTarget: boolean;
}) {
  const { state, actions, meta } = useNotes();
  const busy = state.busyIds.includes(note.id);
  const confirming = state.confirmDeleteId === note.id;
  const done = note.status === 'done';
  const selecting = state.selection.active;
  const selected = state.selection.ids.includes(note.id);
  const { target } = note;
  // Marked only when a frame is being worked on; the page's own notes need no mark.
  const here =
    state.scope === 'all' &&
    state.context?.focusFrame != null &&
    meta.here.has(note.id);
  const resolution =
    target.type === 'file'
      ? undefined
      : state.resolutions[resolutionKey(target.type, target.id)];
  const missing = resolution?.state === 'missing';
  const checkFailed = resolution?.state === 'error';
  // A whole-file note has nowhere to go; a note without a target cannot be shown.
  const canGo = target.type !== 'file' && !missing;

  return (
    <li
      className={`note${done ? ' note--done' : ''}${selected ? ' note--selected' : ''}`}
      aria-busy={busy}
    >
      {selecting ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select note: ${note.text.slice(0, 40)}`}
          className={`check check--row${selected ? ' check--on' : ''}`}
          onClick={() => actions.toggleSelected(note.id)}
        >
          {selected ? <CheckIcon /> : null}
        </button>
      ) : note.kind === 'task' ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? 'Reopen the task' : 'Mark the task done'}
          className={`check${done ? ' check--on' : ''}`}
          disabled={busy}
          onClick={() => void actions.toggleStatus(note)}
        >
          {done ? <CheckIcon /> : null}
        </button>
      ) : null}
      <div className="note__body">
        <p className="note__text">{note.text}</p>
        {here ? <p className="note__meta note__meta--here">Here</p> : null}
        {showTarget || missing ? (
          <p className="note__meta">
            {targetLabel(note.target)}
            {missing ? ' · target not found, text kept' : ''}
          </p>
        ) : null}
        {checkFailed ? (
          <p className="note__meta note__meta--warn">
            Could not check the target.{' '}
            <button
              type="button"
              className="link"
              onClick={() => actions.retryTarget(note)}
            >
              Check again
            </button>
          </p>
        ) : null}
        {missing && !confirming && !selecting ? (
          <button
            type="button"
            className="btn btn--small"
            disabled={busy}
            onClick={() => actions.openEdit(note, { rebind: true })}
          >
            Rebind
          </button>
        ) : null}
        {confirming ? (
          <div className="confirm" role="group" aria-label="Confirm deletion">
            <span>Delete this note for good?</span>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => void actions.confirmDelete(note)}
            >
              Delete
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => actions.askDelete(null)}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
      {confirming || selecting ? null : (
        <div className="note__actions">
          {canGo ? (
            <button
              type="button"
              className="icon-btn"
              aria-label="Go to the target"
              title="Go to the target"
              disabled={busy}
              onClick={() => void actions.focusNote(note)}
            >
              <GoToIcon />
            </button>
          ) : null}
          <button
            type="button"
            className="icon-btn"
            aria-label="Edit note"
            title="Edit"
            disabled={busy}
            onClick={() => actions.openEdit(note)}
          >
            <EditIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Delete note"
            title="Delete"
            disabled={busy}
            onClick={() => actions.askDelete(note.id)}
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </li>
  );
}
