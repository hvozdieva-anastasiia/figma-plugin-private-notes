import type { ErrorCode, NoteTarget } from '../shared/model';

export function targetLabel(target: NoteTarget): string {
  if (target.type === 'file') return 'Весь файл';
  const name =
    target.nameSnapshot === '' ? '(без названия)' : target.nameSnapshot;
  return target.type === 'page' ? `Страница · ${name}` : `Фрейм · ${name}`;
}

/** User-facing text for a failure: names the problem and what to do. */
export function errorText(code: ErrorCode, message: string): string {
  switch (code) {
    case 'REVISION_CONFLICT':
      return 'Заметка изменилась в документе. Обновите список и повторите изменение.';
    case 'NOT_FOUND':
      return 'Заметка не найдена. Возможно, она уже удалена: обновите список.';
    case 'TARGET_NOT_FOUND':
      return `${message}. Выберите другую привязку.`;
    case 'LIMIT_REACHED':
      return 'Достигнут предел в 500 заметок. Удалите ненужные и повторите.';
    case 'INVALID_TEXT':
      return 'Введите текст заметки (не больше 4 000 символов).';
    case 'INVALID_TARGET':
      return 'Привязка указана неверно. Выберите её заново.';
    case 'TOO_LARGE':
      return 'Заметка слишком большая для записи в документ.';
    case 'WRITE_FAILED':
      return 'Не удалось записать в документ. Повторите попытку.';
    case 'NO_USER':
      return 'Не удалось определить пользователя Figma. Войдите в аккаунт и откройте плагин снова.';
    case 'TIMEOUT':
      return 'Плагин не ответил. Повторите попытку.';
    case 'CORRUPT':
    case 'UNSUPPORTED_SCHEMA':
    case 'AUTHOR_MISMATCH':
      return 'Эту запись нельзя изменить: она повреждена или создана более новой версией плагина.';
    case 'ALREADY_EXISTS':
      return 'Заметка с таким идентификатором уже есть. Обновите список.';
    default:
      return `Не удалось выполнить действие (${code}). Повторите попытку.`;
  }
}
