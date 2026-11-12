import type { ErrorCode, NoteTarget } from '../shared/model';

export function targetLabel(target: NoteTarget): string {
  if (target.type === 'file') return 'Whole file';
  const name = target.nameSnapshot === '' ? '(untitled)' : target.nameSnapshot;
  return target.type === 'page' ? `Page · ${name}` : `Frame · ${name}`;
}

/** "3 notes", "1 task": the count with the right form of the word. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** User-facing text for a failure: names the problem and what to do. */
export function errorText(code: ErrorCode, message: string): string {
  switch (code) {
    case 'REVISION_CONFLICT':
      return 'The note was changed in the document. Refresh the list and try again.';
    case 'NOT_FOUND':
      return 'The note was not found. It may have been deleted: refresh the list.';
    case 'TARGET_NOT_FOUND':
      return `${message}. Choose another target.`;
    case 'LIMIT_REACHED':
      return 'You have reached the limit of 500 notes. Delete some and try again.';
    case 'INVALID_TEXT':
      return 'Enter the note text (up to 4,000 characters).';
    case 'INVALID_TARGET':
      return 'The target is not valid. Choose it again.';
    case 'INVALID_STATUS':
      return 'Only a task has a status.';
    case 'TOO_LARGE':
      return 'The note is too large to be written to the document.';
    case 'WRITE_FAILED':
      return 'Could not write to the document. Try again.';
    case 'NO_USER':
      return 'Could not identify the Figma user. Sign in and open the plugin again.';
    case 'TIMEOUT':
      return 'The plugin did not answer. Try again.';
    case 'CORRUPT':
    case 'UNSUPPORTED_SCHEMA':
    case 'AUTHOR_MISMATCH':
      return 'This record cannot be changed: it is damaged or was created by a newer version of the plugin.';
    case 'ALREADY_EXISTS':
      return 'A note with this id already exists. Refresh the list.';
    case 'NAVIGATION_FAILED':
      return `${message}. Try again.`;
    default:
      return `The action failed (${code}). Try again.`;
  }
}
