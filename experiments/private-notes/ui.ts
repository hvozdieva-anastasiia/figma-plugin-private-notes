// Minimal probe UI. Plain DOM, no React. All text is inserted via textContent.

import type {
  Command,
  ContextSnapshot,
  ListData,
  NoteView,
  Reply,
} from './protocol';
import type { ProbeTargetType } from './probe-core';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

const ctxBox = el<HTMLPreElement>('ctx');
const countsBox = el<HTMLPreElement>('counts');
const notesBox = el<HTMLDivElement>('notes');
const logBox = el<HTMLTextAreaElement>('log');
const saveText = el<HTMLInputElement>('save-text');
const saveType = el<HTMLSelectElement>('save-type');
const editText = el<HTMLInputElement>('edit-text');
const atkId = el<HTMLInputElement>('atk-id');
const atkAuthor = el<HTMLInputElement>('atk-author');

let nextRequestId = 1;

function send(command: Command): void {
  parent.postMessage(
    { pluginMessage: { requestId: nextRequestId++, command } },
    '*',
  );
}

function stamp(): string {
  return new Date().toISOString().slice(11, 23);
}

function log(line: string): void {
  logBox.value += `[${stamp()}] ${line}\n`;
  logBox.scrollTop = logBox.scrollHeight;
}

function arm(button: HTMLButtonElement, label: string, action: () => void) {
  // Two-click confirmation: window.confirm is not available in plugin iframes.
  const original = button.textContent ?? '';
  let armed = false;
  let timer = 0;
  button.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      button.classList.add('armed');
      button.textContent = label;
      timer = window.setTimeout(reset, 4000);
      return;
    }
    reset();
    action();
  });
  function reset() {
    window.clearTimeout(timer);
    armed = false;
    button.classList.remove('armed');
    button.textContent = original;
  }
}

// ------------------------------------------------------------- rendering

function renderContext(context: ContextSnapshot): void {
  const lines = [
    `user: ${context.user ? `${context.user.id ?? 'null'} (${context.user.name})` : 'figma.currentUser = null'}`,
    `document: ${context.documentName} (root ${context.rootId})`,
    `page: ${context.page.name} [${context.page.id}], children ${context.page.childCount}`,
    `selection: ${context.selection.length === 0 ? 'пусто' : ''}`,
  ];
  for (const node of context.selection) {
    lines.push(
      `  ${node.type} ${node.id} «${node.name}» visible=${String(node.visible)} locked=${String(node.locked)} inInstance=${String(node.insideInstance)}`,
    );
  }
  if (context.selectionTruncated) lines.push('  … (показаны первые 10)');
  ctxBox.textContent = lines.join('\n');
}

function resolutionLabel(view: NoteView): string {
  const { state, nodeType, pageName, detail } = view.resolution;
  switch (state) {
    case 'file':
      return 'file: навигация не нужна';
    case 'available':
      return `доступна: ${nodeType ?? '?'} на странице «${pageName ?? '?'}»`;
    case 'missing':
      return 'цель не найдена';
    case 'type-mismatch':
      return `найден другой тип: ${nodeType ?? '?'}`;
    case 'error':
      return `ошибка API: ${detail ?? ''}`;
  }
}

function renderNotes(data: ListData): void {
  notesBox.replaceChildren();
  if (data.notes.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'Своих корректных probe-записей нет.';
    notesBox.append(empty);
  }
  for (const view of data.notes) {
    const { note } = view;
    const card = document.createElement('div');
    card.className = 'card';
    const head = document.createElement('div');
    head.textContent = `${note.target.type}${note.target.nameSnapshot ? ` · ${note.target.nameSnapshot}` : ''} — r${note.revision}`;
    const text = document.createElement('div');
    text.textContent = note.text;
    const meta = document.createElement('div');
    meta.className = 'small';
    meta.append('id: ');
    const code = document.createElement('code');
    code.textContent = note.id;
    meta.append(code, ` · ${resolutionLabel(view)}`);
    const row = document.createElement('div');
    row.className = 'row';
    const go = document.createElement('button');
    go.type = 'button';
    go.textContent = 'Перейти';
    go.addEventListener('click', () =>
      send({ op: 'NAVIGATE', noteId: note.id }),
    );
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Изменить текст';
    edit.addEventListener('click', () =>
      send({
        op: 'UPDATE',
        noteId: note.id,
        text: editText.value,
        expectedRevision: note.revision,
        claimedAuthorId: null,
      }),
    );
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger';
    del.textContent = 'Удалить';
    arm(del, 'Нажмите ещё раз', () =>
      send({
        op: 'DELETE',
        noteId: note.id,
        expectedRevision: note.revision,
        claimedAuthorId: null,
      }),
    );
    row.append(go, edit, del);
    card.append(head, text, meta, row);
    notesBox.append(card);
  }
  const lines = [
    `корень: всего ключей ${data.counts.rootKeys}, не probe ${data.counts.nonProbeKeys}`,
    `probe: свои ${data.counts.ownKeys}, других авторов ${data.counts.otherAuthorKeys} (значения не читаются), нераспознанных ${data.counts.malformedProbeKeys}`,
  ];
  for (const problem of data.problems) {
    lines.push(
      `проблема: ${problem.reason} ${problem.noteId} — ${problem.detail}`,
    );
  }
  countsBox.textContent = lines.join('\n');
}

function summarize(reply: Extract<Reply, { kind: 'result' }>): string {
  const status = reply.ok ? 'OK' : `ОТКАЗ ${reply.code ?? ''}`;
  return `#${reply.requestId} ${reply.op} → ${status}${reply.message ? `: ${reply.message}` : ''}`;
}

window.addEventListener('message', (event: MessageEvent) => {
  const reply = (event.data as { pluginMessage?: Reply } | null)?.pluginMessage;
  if (!reply || (reply.kind !== 'result' && reply.kind !== 'context')) return;
  if (reply.kind === 'context') {
    renderContext(reply.context);
    return;
  }
  log(summarize(reply));
  if (reply.data !== null && reply.data !== undefined) {
    log(JSON.stringify(reply.data));
  }
  if ((reply.op === 'INIT' || reply.op === 'SNAPSHOT') && reply.ok) {
    renderContext(reply.data as ContextSnapshot);
    if (reply.op === 'INIT') send({ op: 'LIST' });
    return;
  }
  if (reply.op === 'LIST' && reply.ok) {
    renderNotes(reply.data as ListData);
    return;
  }
  if (
    ['SAVE', 'SAVE_ALL', 'UPDATE', 'DELETE', 'SEED_FOREIGN', 'CLEAN'].includes(
      reply.op,
    ) &&
    reply.ok
  ) {
    send({ op: 'LIST' });
  }
});

// -------------------------------------------------------------- controls

el('btn-snapshot').addEventListener('click', () => send({ op: 'SNAPSHOT' }));
el('btn-list').addEventListener('click', () => send({ op: 'LIST' }));
el('btn-save').addEventListener('click', () =>
  send({
    op: 'SAVE',
    targetType: saveType.value as ProbeTargetType,
    text: saveText.value,
  }),
);
el('btn-save-all').addEventListener('click', () =>
  send({ op: 'SAVE_ALL', text: saveText.value }),
);
el('btn-seed').addEventListener('click', () => send({ op: 'SEED_FOREIGN' }));
el('btn-atk-update').addEventListener('click', () =>
  send({
    op: 'UPDATE',
    noteId: atkId.value.trim(),
    text: 'tampered by probe',
    expectedRevision: null,
    claimedAuthorId: atkAuthor.value.trim() || null,
  }),
);
el('btn-atk-delete').addEventListener('click', () =>
  send({
    op: 'DELETE',
    noteId: atkId.value.trim(),
    expectedRevision: null,
    claimedAuthorId: atkAuthor.value.trim() || null,
  }),
);
arm(el<HTMLButtonElement>('btn-clean'), 'Нажмите ещё раз', () =>
  send({ op: 'CLEAN' }),
);
el('btn-clear-log').addEventListener('click', () => {
  logBox.value = '';
});
el('btn-copy').addEventListener('click', () => {
  logBox.select();
  const copied = document.execCommand('copy');
  log(
    copied
      ? 'журнал скопирован'
      : 'копирование недоступно: выделите текст журнала вручную',
  );
});

log('UI загружен');
send({ op: 'INIT' });
