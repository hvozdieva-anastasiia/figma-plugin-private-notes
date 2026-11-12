import { useId } from 'react';
import type { NoteTarget } from '../../shared/model';
import type { EditorDraft } from '../state';
import { useNotes } from '../NotesProvider';
import {
  FILE_TARGET,
  frameTargetFromContext,
  pageTargetFromContext,
} from '../state';
import { targetLabel } from '../labels';

const OTHER = '__other__';

function keyOf(target: NoteTarget): string {
  return `${target.type}:${target.id ?? ''}`;
}

/**
 * "Привязка": the selected frame, the current page, the whole file, or another
 * page or frame. It is the only control that changes `draftTarget`.
 */
export function TargetDropdown({ editor }: { editor: EditorDraft }) {
  const { state, actions } = useNotes();
  const selectId = useId();
  const { context } = state;

  const choices: NoteTarget[] = [];
  if (context) {
    const frame = frameTargetFromContext(context);
    if (frame) choices.push(frame);
    choices.push(pageTargetFromContext(context));
  }
  choices.push(FILE_TARGET);
  // A target chosen earlier (another page, or the note's old target) stays selectable.
  if (!choices.some((item) => keyOf(item) === keyOf(editor.draftTarget))) {
    choices.unshift(editor.draftTarget);
  }

  return (
    <div className="field">
      <label htmlFor={selectId} className="field__label">
        Привязка
      </label>
      <select
        id={selectId}
        className="select"
        value={keyOf(editor.draftTarget)}
        disabled={editor.saving}
        onChange={(event) => {
          const value = event.target.value;
          if (value === OTHER) {
            actions.setPickerOpen(true);
            return;
          }
          const next = choices.find((item) => keyOf(item) === value);
          if (next) actions.setEditorTarget(next);
        }}
      >
        {choices.map((item) => (
          <option key={keyOf(item)} value={keyOf(item)}>
            {targetLabel(item)}
          </option>
        ))}
        <option value={OTHER}>Выбрать другую страницу или фрейм…</option>
      </select>
    </div>
  );
}
