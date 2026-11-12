import { useMemo } from 'react';
import { groupNotes, totalCount } from '../../shared/group-notes';
import { selectNotes } from '../../shared/select-notes';
import { useNotes } from '../NotesProvider';
import { currentSelection } from '../state';
import { NoteGroup } from './NoteGroup';
import { NoteItem } from './NoteItem';

/** Filter first, then group, then count what is visible. Nothing here writes data. */
export function NoteList() {
  const { state, actions } = useNotes();
  const { notes, query, filter, scope, context } = state;

  const grouped = useMemo(() => {
    const visible = selectNotes(notes, {
      query,
      filter,
      scope,
      current: currentSelection(context),
    });
    return groupNotes(visible);
  }, [notes, query, filter, scope, context]);

  if (notes.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">Заметок пока нет</p>
        <p className="empty__hint">
          Нажмите «Добавить заметку»: её увидите только вы, а в файле она не
          появится ни слоем, ни комментарием.
        </p>
      </div>
    );
  }

  if (totalCount(grouped) === 0) {
    return (
      <div className="empty">
        <p className="empty__title">Ничего не найдено</p>
        <p className="empty__hint">
          {scope === 'current'
            ? 'Для текущего выбора заметок нет. Выберите другой фрейм или покажите все заметки.'
            : 'Измените поиск или фильтр.'}
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
          Сбросить поиск и фильтры
        </button>
      </div>
    );
  }

  return (
    <div className="list">
      {grouped.file ? (
        <NoteGroup
          groupKey={grouped.file.key}
          title="Весь файл"
          count={grouped.file.count}
          level="top"
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
          title={`Страница · ${page.label || '(без названия)'}`}
          count={page.count}
          level="top"
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
              title={`Фрейм · ${frame.label || '(без названия)'}`}
              count={frame.count}
              level="nested"
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
          title="Без доступной привязки"
          count={grouped.unresolved.count}
          level="top"
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
