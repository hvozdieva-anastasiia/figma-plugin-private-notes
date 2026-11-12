import { useEffect, useId, useRef } from 'react';
import { codePointLength } from '../../shared/validation';
import { LIMITS } from '../../shared/model';
import { useNotes } from '../NotesProvider';
import { isDirty, type EditorDraft } from '../state';
import { TargetDropdown } from './TargetDropdown';
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
      <h2 className="editor__title">
        {creating ? 'Новая заметка' : 'Редактирование заметки'}
      </h2>

      {creating ? (
        <div className="segmented" role="group" aria-label="Тип записи">
          <button
            type="button"
            aria-pressed={editor.kind === 'note'}
            onClick={() => actions.setEditorKind('note')}
          >
            Заметка
          </button>
          <button
            type="button"
            aria-pressed={editor.kind === 'task'}
            onClick={() => actions.setEditorKind('task')}
          >
            Задача
          </button>
        </div>
      ) : null}

      <TargetDropdown editor={editor} />
      {editor.pickerOpen ? <TargetPicker /> : null}

      <div className="field">
        <label htmlFor={textId} className="field__label">
          Текст
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

      {editor.discardAsked ? (
        <div className="confirm" role="group" aria-label="Подтверждение отмены">
          <span>Отменить несохранённый текст?</span>
          <button
            type="button"
            className="btn btn--danger"
            onClick={actions.closeEditor}
          >
            Отменить
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => actions.askDiscard(false)}
          >
            Продолжить
          </button>
        </div>
      ) : (
        <div className="editor__actions">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={!canSave}
          >
            {editor.saving ? 'Записываю…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={editor.saving}
            onClick={cancel}
          >
            Отмена
          </button>
        </div>
      )}
    </form>
  );
}
