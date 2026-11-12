import { useId, type ReactNode } from 'react';
import { useNotes } from '../NotesProvider';
import { ChevronIcon } from './Icons';

/**
 * A collapsible section. Collapsing hides the notes only: the count in the
 * heading always includes them.
 */
export function NoteGroup({
  groupKey,
  title,
  count,
  level,
  children,
}: {
  groupKey: string;
  title: string;
  count: number;
  level: 'top' | 'nested';
  children: ReactNode;
}) {
  const { state, actions } = useNotes();
  const panelId = useId();
  const collapsed = state.collapsed[groupKey] === true;

  return (
    <section className={`group group--${level}`}>
      <h2 className="group__title">
        <button
          type="button"
          className="group__toggle"
          aria-expanded={!collapsed}
          aria-controls={panelId}
          onClick={() => actions.toggleGroup(groupKey)}
        >
          <span className={`chevron${collapsed ? '' : ' chevron--open'}`}>
            <ChevronIcon />
          </span>
          <span className="group__name">{title}</span>
          <span className="group__count" aria-label={`Заметок: ${count}`}>
            {count}
          </span>
        </button>
      </h2>
      <div id={panelId} hidden={collapsed} className="group__panel">
        {children}
      </div>
    </section>
  );
}
