import { useEffect } from 'react';
import { useNotes } from './NotesProvider';
import { NoteEditor } from './components/NoteEditor';
import { NoteList } from './components/NoteList';
import { NotesToolbar } from './components/NotesToolbar';

const NOTICE_MS = 3500;

function NoticeBar() {
  const { state, actions } = useNotes();
  const { notice } = state;
  const noticeId = notice?.id;

  useEffect(() => {
    if (noticeId === undefined) return;
    const timer = setTimeout(actions.dismissNotice, NOTICE_MS);
    return () => clearTimeout(timer);
    // The timer restarts only for a new notice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeId]);

  if (!notice) return <div className="notice-slot" />;
  return (
    <div className="notice-slot">
      <p
        className={`notice notice--${notice.kind}`}
        role={notice.kind === 'error' ? 'alert' : 'status'}
      >
        <span>{notice.text}</span>
        <button
          type="button"
          className="notice__close"
          onClick={actions.dismissNotice}
        >
          Закрыть
        </button>
      </p>
    </div>
  );
}

export function App() {
  const { state, actions } = useNotes();

  if (state.phase === 'loading') {
    return (
      <main className="app app--center" aria-busy="true">
        <p className="muted">Загружаю ваши заметки…</p>
      </main>
    );
  }

  if (state.phase === 'failed') {
    return (
      <main className="app app--center">
        <p className="error" role="alert">
          {state.failure}
        </p>
        <button
          type="button"
          className="btn"
          onClick={() => void actions.retryInit()}
        >
          Повторить
        </button>
      </main>
    );
  }

  return (
    <main className="app">
      {state.editor ? (
        <NoteEditor editor={state.editor} />
      ) : (
        <>
          <NotesToolbar />
          {state.unreadable > 0 ? (
            <p className="warning" role="status">
              Не удалось прочитать записей: {state.unreadable}. Остальные
              заметки доступны, повреждённые данные не изменялись.
            </p>
          ) : null}
          <div className="scroll">
            <NoteList />
          </div>
        </>
      )}
      <NoticeBar />
    </main>
  );
}
