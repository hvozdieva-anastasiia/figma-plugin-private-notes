import type { KindFilter } from '../../shared/select-notes';
import { useNotes } from '../NotesProvider';
import { count, targetLabel } from '../labels';
import { currentSelection, workingTarget } from '../state';
import { PlusIcon, RefreshIcon, SearchIcon } from './Icons';

const FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'notes', label: 'Notes' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Done' },
];

/**
 * Top of the window. First line, left to right: search, a small "add note"
 * button, the refresh button. Below: the kind filter and the scope.
 */
export function NotesToolbar() {
  const { state, actions, meta } = useNotes();
  const { query, filter, scope, context, refreshing } = state;
  const selection = currentSelection(context);
  const currentTarget = context ? workingTarget(context) : null;
  const hereCount = meta.here.size;

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <label className="search">
          <SearchIcon />
          <span className="visually-hidden">Search notes</span>
          <input
            type="search"
            name="search"
            autoComplete="off"
            value={query}
            placeholder="Search text and target…"
            onChange={(event) => actions.setQuery(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="icon-btn icon-btn--primary"
          aria-label="Add note"
          title="Add note"
          onClick={actions.openCreate}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Refresh the list"
          title="Refresh the list"
          disabled={refreshing}
          onClick={() => void actions.refresh()}
        >
          <span className={refreshing ? 'spin' : undefined}>
            <RefreshIcon />
          </span>
        </button>
      </div>

      <div className="segmented" role="group" aria-label="Kind">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => actions.setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="scope">
        <div className="scope__row">
          <div
            className="segmented"
            role="group"
            aria-label="Which notes to show"
          >
            <button
              type="button"
              aria-pressed={scope === 'all'}
              onClick={() => actions.setScope('all')}
            >
              All notes
            </button>
            <button
              type="button"
              aria-pressed={scope === 'current'}
              onClick={() => actions.setScope('current')}
            >
              Current selection
            </button>
          </div>
          <button
            type="button"
            className="btn"
            aria-pressed={state.selection.active}
            aria-label={
              state.selection.active ? 'Exit selection mode' : undefined
            }
            title={
              state.selection.active
                ? 'Exit selection mode'
                : 'Select several notes for bulk actions'
            }
            onClick={() => actions.setSelectMode(!state.selection.active)}
          >
            {state.selection.active ? 'Exit' : 'Select'}
          </button>
        </div>
        {currentTarget ? (
          <p className="scope__hint">
            Now: {targetLabel(currentTarget)}
            {selection.frameId === null
              ? ' (and its frames)'
              : ' (and frames inside)'}
            {' · '}
            {hereCount === 0
              ? 'no notes here'
              : `${count(hereCount, 'note')} here`}
          </p>
        ) : null}
      </div>
    </div>
  );
}
