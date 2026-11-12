import { useEffect, useId, useRef } from 'react';
import { codePointLength } from '../../shared/validation';
import { LIMITS } from '../../shared/model';
import { useNotes } from '../NotesProvider';
import { isDirty, type EditorDraft } from '../state';
import { targetLabel } from '../labels';
import { TargetField } from './TargetField';
import { TargetPicker } from './TargetPicker';

/** Plain-text editor. Its target is fixed at opening and changed only by the dropdown. */
export function NoteEditor({ editor }: { editor: EditorDraft }) {
  const { actions } = useNotes();
  const textId = useId();
  const errorId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const creating = editor.mode === 'create';
  const length = codePointLength(editor.text);
  const tooLong = length > LIMITS.maxTextLength;
  const canSave = !editor.saving && editor.text.trim() !== '' && !tooLong;

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  const cancel = () => {
    if (isDirty(editor) && !editor.discardAsked) actions.askDiscard(true);
    else actions.closeEditor();
  };

  return (
    <form
      className="editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) void actions.saveEditor(editor);
      }}
    >
      <h2 className="editor__title">{creating ? 'New note' : 'Edit note'}</h2>

      {creating ? (
        <div className="segmented" role="group" aria-label="Kind">
          <button
            type="button"
            aria-pressed={editor.kind === 'note'}
            onClick={() => actions.setEditorKind('note')}
          >
            Note
          </button>
          <button
            type="button"
            aria-pressed={editor.kind === 'task'}
            onClick={() => actions.setEditorKind('task')}
          >
            Task
          </button>
        </div>
      ) : null}

      <TargetField
        label="Target"
        target={editor.draftTarget}
        disabled={editor.saving}
        onChange={actions.setEditorTarget}
        onChooseOther={() => actions.setPickerOpen(true)}
      />
      {editor.pickerOpen ? (
        <TargetPicker
          onPick={actions.setEditorTarget}
          onClose={() => actions.setPickerOpen(false)}
        />
      ) : null}

      <div className="field">
        <label htmlFor={textId} className="field__label">
          Text
        </label>
        <textarea
          id={textId}
          ref={textRef}
          className="textarea"
          rows={8}
          value={editor.text}
          disabled={editor.saving}
          aria-invalid={tooLong || editor.error !== null}
          aria-describedby={editor.error ? errorId : undefined}
          onChange={(event) => actions.setEditorText(event.target.value)}
        />
        <p className={`counter${tooLong ? ' counter--over' : ''}`}>
          {length} / {LIMITS.maxTextLength}
        </p>
      </div>

      {editor.error ? (
        <p id={errorId} className="error" role="alert">
          {editor.error}
        </p>
      ) : null}

      {editor.conflict ? <ConflictPanel editor={editor} /> : null}

      {editor.conflict ? null : editor.discardAsked ? (
        <div className="confirm" role="group" aria-label="Confirm discarding">
          <span>Discard the unsaved text?</span>
          <button
            type="button"
            className="btn btn--danger"
            onClick={actions.closeEditor}
          >
            Discard
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => actions.askDiscard(false)}
          >
            Keep editing
          </button>
        </div>
      ) : (
        <div className="editor__actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!canSave}
          >
            {editor.saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={editor.saving}
            onClick={cancel}
          >
            Cancel
          </button>
        </div>
      )}
    </form>
  );
}

/**
 * Shown when saving found that the note changed after the editor opened, or
 * vanished (another window, Undo, Redo). The user's text stays in the editor;
 * nothing is overwritten until the user chooses to.
 */
function ConflictPanel({ editor }: { editor: EditorDraft }) {
  const { actions } = useNotes();
  const { conflict } = editor;
  if (!conflict) return null;
  const changed = conflict.kind === 'changed';
  return (
    <div className="conflict" role="alert">
      {changed ? (
        <>
          <p className="conflict__title">
            This note was changed in the document after you opened it (in
            another window, or by Undo or Redo).
          </p>
          <p className="conflict__label">Current version</p>
          <p className="conflict__text">{conflict.current.text}</p>
          <p className="note__meta">{targetLabel(conflict.current.target)}</p>
        </>
      ) : (
        <p className="conflict__title">
          This note no longer exists in the document (it was deleted, or Undo
          removed it). Your text is still here.
        </p>
      )}
      <div className="editor__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={editor.saving}
          onClick={() => void actions.resolveConflict(editor, 'overwrite')}
        >
          {changed ? 'Save my version' : 'Save as a new note'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void actions.resolveConflict(editor, 'keep')}
        >
          Keep editing
        </button>
        <button
          type="button"
          className="btn btn--danger-text"
          onClick={() => void actions.resolveConflict(editor, 'discard')}
        >
          {changed ? 'Use the current version' : 'Discard'}
        </button>
      </div>
    </div>
  );
}
