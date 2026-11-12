import { useId } from 'react';
import type { NoteTarget } from '../../shared/model';
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
 * "Target": the selected frame, the current page, the whole file, or another
 * page or frame. It only reports the user's choice; whoever owns the draft
 * decides what to do with it (an editor, or the bulk "move" panel).
 */
export function TargetField({
  label,
  target,
  disabled = false,
  onChange,
  onChooseOther,
}: {
  label: string;
  target: NoteTarget;
  disabled?: boolean;
  onChange: (target: NoteTarget) => void;
  onChooseOther: () => void;
}) {
  const { state } = useNotes();
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
  if (!choices.some((item) => keyOf(item) === keyOf(target))) {
    choices.unshift(target);
  }

  return (
    <div className="field">
      <label htmlFor={selectId} className="field__label">
        {label}
      </label>
      <select
        id={selectId}
        className="select"
        value={keyOf(target)}
        disabled={disabled}
        onChange={(event) => {
          const value = event.target.value;
          if (value === OTHER) {
            onChooseOther();
            return;
          }
          const next = choices.find((item) => keyOf(item) === value);
          if (next) onChange(next);
        }}
      >
        {choices.map((item) => (
          <option key={keyOf(item)} value={keyOf(item)}>
            {targetLabel(item)}
          </option>
        ))}
        <option value={OTHER}>Choose another page or frame…</option>
      </select>
    </div>
  );
}
