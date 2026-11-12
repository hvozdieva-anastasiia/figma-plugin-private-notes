import { useEffect, useId, useState } from 'react';
import type { TargetOption } from '../../shared/messages';
import { useNotes } from '../NotesProvider';

type Listing =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; options: TargetOption[]; truncated: boolean };

/**
 * Choosing another page or frame. Pages are listed first; the frames of the
 * chosen page are requested only now. Equal names are told apart by the page
 * and the node id shown next to them.
 */
export function TargetPicker() {
  const { state, actions, meta } = useNotes();
  const { bridge } = meta;
  const pageSelectId = useId();
  const searchId = useId();
  const [pages, setPages] = useState<Listing>({ state: 'loading' });
  const [pageId, setPageId] = useState<string>(state.context?.page.id ?? '');
  const [query, setQuery] = useState('');
  const [frames, setFrames] = useState<Listing>({ state: 'loading' });

  useEffect(() => {
    let active = true;
    void bridge
      .request('LIST_TARGETS', { kind: 'page', pageId: null, query: '' })
      .then((result) => {
        if (!active) return;
        setPages(
          result.ok ? { state: 'ready', ...result.value } : { state: 'error' },
        );
      });
    return () => {
      active = false;
    };
  }, [bridge]);

  useEffect(() => {
    if (pageId === '') return;
    let active = true;
    void bridge
      .request('LIST_TARGETS', { kind: 'frame', pageId, query })
      .then((result) => {
        if (!active) return;
        setFrames(
          result.ok ? { state: 'ready', ...result.value } : { state: 'error' },
        );
      });
    return () => {
      active = false;
    };
  }, [bridge, pageId, query]);

  const pageList = pages.state === 'ready' ? pages.options : [];
  const pageOption = pageList.find((item) => item.id === pageId);

  const choose = (option: TargetOption) =>
    actions.setEditorTarget({
      type: option.type,
      id: option.id,
      pageId: option.pageId,
      nameSnapshot: option.name,
      pageNameSnapshot: option.pageName,
    });

  return (
    <div className="picker" role="group" aria-label="Выбор другой привязки">
      <div className="field">
        <label htmlFor={pageSelectId} className="field__label">
          Страница
        </label>
        <select
          id={pageSelectId}
          className="select"
          value={pageId}
          onChange={(event) => {
            setFrames({ state: 'loading' });
            setPageId(event.target.value);
          }}
        >
          {pageList.map((page) => (
            <option key={page.id} value={page.id}>
              {page.name}
            </option>
          ))}
        </select>
      </div>
      {pages.state === 'error' ? (
        <p className="error" role="alert">
          Не удалось загрузить страницы. Закройте выбор и повторите.
        </p>
      ) : null}
      {pageOption ? (
        <button
          type="button"
          className="btn"
          onClick={() => choose(pageOption)}
        >
          Привязать к странице «{pageOption.name}»
        </button>
      ) : null}
      <div className="field">
        <label htmlFor={searchId} className="field__label">
          Фрейм на этой странице
        </label>
        <input
          id={searchId}
          type="search"
          className="input"
          value={query}
          placeholder="Название фрейма"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {frames.state === 'error' ? (
        <p className="error" role="alert">
          Не удалось загрузить фреймы. Повторите поиск.
        </p>
      ) : frames.state === 'loading' ? (
        <p className="picker__none">Загружаю…</p>
      ) : (
        <ul className="picker__list">
          {frames.options.map((frame) => (
            <li key={frame.id}>
              <button
                type="button"
                className="picker__item"
                onClick={() => choose(frame)}
              >
                <span>{frame.name || '(без названия)'}</span>
                <span className="picker__id">{frame.id}</span>
              </button>
            </li>
          ))}
          {frames.options.length === 0 ? (
            <li className="picker__none">
              На этой странице нет подходящих фреймов верхнего уровня
            </li>
          ) : null}
          {frames.truncated ? (
            <li className="picker__none">
              Показаны первые 100. Уточните поиск.
            </li>
          ) : null}
        </ul>
      )}
      <button
        type="button"
        className="btn"
        onClick={() => actions.setPickerOpen(false)}
      >
        Закрыть выбор
      </button>
    </div>
  );
}
