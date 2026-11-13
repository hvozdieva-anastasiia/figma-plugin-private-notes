import { count } from '../labels';
import { useNotes } from '../NotesProvider';
import { useVisibleNotes } from '../visible';
import { CopyIcon, DoneIcon, MoveIcon, ReopenIcon, TrashIcon } from './Icons';
import { TargetField } from './TargetField';
import { TargetPicker } from './TargetPicker';

/**
 * Bulk actions for the notes ticked in selection mode. It appears only while
 * selecting. Every action works note by note, so a partial failure is reported
 * and the notes that failed stay ticked.
 */
export function BulkBar() {
  const { state, actions } = useNotes();
  const { visible } = useVisibleNotes();
  const { selection, bulk, notes } = state;
  const selected = notes.filter((note) => selection.ids.includes(note.id));
  const tasks = selected.filter((note) => note.kind === 'task');
  const none = selected.length === 0;
  const allVisible =
    visible.length > 0 &&
    visible.every((note) => selection.ids.includes(note.id));

  return (
    <section className="bulk" aria-label="Bulk actions">
      <div className="bulk__row">
        <p className="bulk__count" aria-live="polite">
          {none ? 'Nothing selected' : `${selected.length} selected`}
        </p>
        {bulk.panel === 'none' ? (
          <div className="bulk__tools" role="group" aria-label="Actions">
            <button
              type="button"
              className="icon-btn"
              aria-label="Mark done"
              title="Mark the selected tasks as done"
              disabled={tasks.length === 0 || bulk.busy}
              onClick={() => void actions.bulkStatus('done')}
            >
              <DoneIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Reopen"
              title="Reopen the selected tasks"
              disabled={tasks.length === 0 || bulk.busy}
              onClick={() => void actions.bulkStatus('open')}
            >
              <ReopenIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Move to…"
              title="Move the selected notes to another page or frame"
              disabled={none || bulk.busy}
              onClick={() => actions.openBulkPanel('move')}
            >
              <MoveIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Copy as Markdown"
              title="Copy the selected notes as Markdown"
              disabled={none || bulk.busy}
              onClick={() => void actions.copyMarkdown()}
            >
              <CopyIcon />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--danger"
              aria-label="Delete"
              title="Delete the selected notes"
              disabled={none || bulk.busy}
              onClick={() => actions.openBulkPanel('delete')}
            >
              <TrashIcon />
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="link bulk__all"
          onClick={() =>
            allVisible
              ? actions.selectOnly([])
              : actions.selectOnly(visible.map((note) => note.id))
          }
        >
          {allVisible ? 'Clear' : `Select all (${visible.length})`}
        </button>
      </div>

      {bulk.panel === 'move' ? (
        <div
          className="bulk__panel"
          role="group"
          aria-label="Move the selected notes"
        >
          <TargetField
            label="Move to"
            target={bulk.moveTarget}
            disabled={bulk.busy}
            onChange={actions.setMoveTarget}
            onChooseOther={() => actions.setMovePicker(true)}
          />
          {bulk.pickerOpen ? (
            <TargetPicker
              onPick={actions.setMoveTarget}
              onClose={() => actions.setMovePicker(false)}
            />
          ) : null}
          <div className="bulk__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={bulk.busy}
              onClick={() => void actions.bulkMove()}
            >
              {bulk.busy ? 'Moving…' : `Move ${count(selected.length, 'note')}`}
            </button>
            <button
              type="button"
              className="btn"
              disabled={bulk.busy}
              onClick={actions.closeBulkPanel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {bulk.panel === 'export' ? (
        <div className="bulk__panel" role="group" aria-label="Markdown to copy">
          <p className="bulk__ask">
            The clipboard is not available here. Select the text below and copy
            it by hand.
          </p>
          <textarea
            className="textarea"
            name="markdown"
            readOnly
            rows={8}
            aria-label="Markdown of the selected notes"
            value={bulk.exportText}
            onFocus={(event) => event.currentTarget.select()}
          />
          <div className="bulk__actions">
            <button
              type="button"
              className="btn"
              onClick={actions.closeBulkPanel}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {bulk.panel === 'delete' ? (
        <div className="bulk__panel" role="group" aria-label="Confirm deletion">
          <p className="bulk__ask">
            Delete {count(selected.length, 'note')} for good? This cannot be
            undone from the plugin.
          </p>
          <div className="bulk__actions">
            <button
              type="button"
              className="btn btn--danger"
              disabled={bulk.busy}
              onClick={() => void actions.bulkDelete()}
            >
              {bulk.busy ? 'Deleting…' : 'Delete'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={bulk.busy}
              onClick={actions.closeBulkPanel}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
