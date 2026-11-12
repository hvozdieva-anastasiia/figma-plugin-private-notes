import { currentSelection } from '../state';
import { useNotes } from '../NotesProvider';
import { targetLabel } from '../labels';
import { pageTargetFromContext, frameTargetFromContext } from '../state';
import type { KindFilter } from '../../shared/select-notes';
import { PlusIcon, RefreshIcon, SearchIcon } from './Icons';

const FILTERS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'notes', label: 'Заметки' },
  { value: 'open', label: 'Открытые' },
  { value: 'done', label: 'Выполненные' },
];

export function NotesToolbar() {
  const { state, actions } = useNotes();
  const { query, filter, scope, context, refreshing } = state;
  const selection = currentSelection(context);
  const currentTarget = context
    ? (frameTargetFromContext(context) ?? pageTargetFromContext(context))
    : null;

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <button
          type="button"
          className="btn btn--primary"
          onClick={actions.openCreate}
        >
          <PlusIcon />
          Добавить заметку
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Обновить список"
          title="Обновить список"
          disabled={refreshing}
          onClick={() => void actions.refresh()}
        >
          <span className={refreshing ? 'spin' : undefined}>
            <RefreshIcon />
          </span>
        </button>
      </div>

      <label className="search">
        <SearchIcon />
        <span className="visually-hidden">Поиск по заметкам</span>
        <input
          type="search"
          value={query}
          placeholder="Поиск по тексту и привязке"
          onChange={(event) => actions.setQuery(event.target.value)}
        />
      </label>

      <div className="segmented" role="group" aria-label="Тип записей">
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
        <div
          className="segmented"
          role="group"
          aria-label="Какие заметки показывать"
        >
          <button
            type="button"
            aria-pressed={state.scope === 'all'}
            onClick={() => actions.setScope('all')}
          >
            Все заметки
          </button>
          <button
            type="button"
            aria-pressed={scope === 'current'}
            onClick={() => actions.setScope('current')}
          >
            По текущему выбору
          </button>
        </div>
        {currentTarget ? (
          <p className="scope__hint">
            Сейчас: {targetLabel(currentTarget)}
            {selection.frameId === null ? ' (фреймы страницы тоже)' : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}
