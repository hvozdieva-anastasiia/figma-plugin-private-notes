import type { Note } from '../../shared/model';
import { useNotes } from '../NotesProvider';
import { targetLabel } from '../labels';
import { CheckIcon, EditIcon, TrashIcon } from './Icons';

/** One note: optional task checkbox, text, where it is attached, actions. */
export function NoteItem({
  note,
  showTarget,
}: {
  note: Note;
  /** The group heading already names the target; the whole-file group does not need it twice. */
  showTarget: boolean;
}) {
  const { state, actions } = useNotes();
  const busy = state.busyIds.includes(note.id);
  const confirming = state.confirmDeleteId === note.id;
  const done = note.status === 'done';

  return (
    <li className={`note${done ? ' note--done' : ''}`} aria-busy={busy}>
      {note.kind === 'task' ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={
            done ? 'Вернуть задачу в открытые' : 'Отметить задачу выполненной'
          }
          className="check"
          disabled={busy}
          onClick={() => void actions.toggleStatus(note)}
        >
          {done ? <CheckIcon /> : null}
        </button>
      ) : null}
      <div className="note__body">
        <p className="note__text">{note.text}</p>
        {showTarget ? (
          <p className="note__meta">{targetLabel(note.target)}</p>
        ) : null}
        {confirming ? (
          <div
            className="confirm"
            role="group"
            aria-label="Подтверждение удаления"
          >
            <span>Удалить эту заметку насовсем?</span>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => void actions.confirmDelete(note)}
            >
              Удалить
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => actions.askDelete(null)}
            >
              Отмена
            </button>
          </div>
        ) : null}
      </div>
      {confirming ? null : (
        <div className="note__actions">
          <button
            type="button"
            className="icon-btn"
            aria-label="Редактировать заметку"
            title="Редактировать"
            disabled={busy}
            onClick={() => actions.openEdit(note)}
          >
            <EditIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Удалить заметку"
            title="Удалить"
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
