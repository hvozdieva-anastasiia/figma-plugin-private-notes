import { useId, type ReactNode } from 'react';
import { useNotes } from '../NotesProvider';
import { CheckIcon, ChevronIcon } from './Icons';

/**
 * A collapsible section. Collapsing hides the notes only: the count in the
 * heading always includes them. In selection mode a checkbox ticks or unticks
 * every note of the group (`noteIds`), including the nested ones.
 */
export function NoteGroup({
  groupKey,
  title,
  count,
  level,
  noteIds,
  children,
}: {
  groupKey: string;
  title: string;
  count: number;
  level: 'top' | 'nested';
  noteIds: string[];
  children: ReactNode;
}) {
  const { state, actions } = useNotes();
  const panelId = useId();
  const collapsed = state.collapsed[groupKey] === true;
  const selecting = state.selection.active;
  const ticked = noteIds.filter((id) => state.selection.ids.includes(id));
  const all = noteIds.length > 0 && ticked.length === noteIds.length;
  const some = ticked.length > 0 && !all;

  return (
    <section className={`group group--${level}`}>
      <h2 className="group__title">
        {selecting ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={some ? 'mixed' : all}
            aria-label={`Select all in ${title}`}
            className={`check${all || some ? ' check--on' : ''}`}
            onClick={() => actions.setSelected(noteIds, !all)}
          >
            {all ? (
              <CheckIcon />
            ) : some ? (
              <span className="check__dash" />
            ) : null}
          </button>
        ) : null}
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
          <span className="group__count" aria-label={`Notes: ${count}`}>
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
