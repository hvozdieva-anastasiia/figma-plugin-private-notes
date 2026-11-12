// Turns a chosen set of notes into Markdown for handing over to someone else.
// Pure: nothing is read from or written to the document, and the notes stay
// personal. Structure follows the list: whole file, pages with their own
// notes, frames below their page, and notes whose target is gone.

import { groupNotes, type Resolutions } from './group-notes';
import type { Note } from './model';

/** Escapes what would turn a name into Markdown syntax, and keeps it on one line. */
function inline(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.replace(/([\\`*_[\]<>])/g, '\\$1') || '(untitled)';
}

function item(note: Note): string {
  const mark =
    note.kind === 'task' ? (note.status === 'done' ? '[x] ' : '[ ] ') : '';
  const [first = '', ...rest] = note.text.replace(/\r\n?/g, '\n').split('\n');
  // Later lines are indented so that they stay inside the same list item.
  const more = rest.map((line) => (line.trim() === '' ? '' : `  ${line}`));
  return [`- ${mark}${first}`, ...more].join('\n');
}

function section(heading: string, notes: Note[]): string {
  return [heading, '', ...notes.map(item)].join('\n');
}

/**
 * @param resolutions what Figma reported for the targets, so that current names
 *   are used; without an entry the name saved in the note is used.
 */
export function notesToMarkdown(
  notes: readonly Note[],
  resolutions?: Resolutions,
): string {
  if (notes.length === 0) return '# Notes\n\n_No notes selected._\n';
  const grouped = groupNotes(notes, resolutions ? { resolutions } : {});
  const blocks: string[] = ['# Notes'];

  if (grouped.file) blocks.push(section('## Whole file', grouped.file.notes));
  for (const page of grouped.pages) {
    const name = inline(page.label);
    if (page.notes.length) {
      blocks.push(section(`## Page: ${name}`, page.notes));
    } else {
      blocks.push(`## Page: ${name}`);
    }
    for (const frame of page.frames) {
      blocks.push(section(`### Frame: ${inline(frame.label)}`, frame.notes));
    }
  }
  if (grouped.unresolved) {
    const lines = grouped.unresolved.notes.map((note) => {
      const was =
        note.target.type === 'file'
          ? ''
          : ` _(was ${note.target.type}: ${inline(note.target.nameSnapshot ?? '')})_`;
      return `${item(note)}${was}`;
    });
    blocks.push(['## No available target', '', ...lines].join('\n'));
  }
  return `${blocks.join('\n\n')}\n`;
}
