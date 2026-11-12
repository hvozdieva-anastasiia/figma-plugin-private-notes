import { describe, expect, it } from 'vitest';
import type { NoteTarget } from '../../src/shared/model';
import { PROTOCOL_VERSION } from '../../src/shared/messages';
import { createCommandHandler } from '../../src/plugin/handlers';
import { createNotesService } from '../../src/plugin/notes-service';
import { noteKey } from '../../src/plugin/storage/document-notes';
import { FILE, frame, page } from './fixtures';
import { MemoryStore } from './memory-store';

// Release audit (stage 8): what the plugin must never do, and what it must
// never reveal. Source scans are static; they fail when someone adds a log
// line, a network call or a layer-changing call.

const sources = import.meta.glob('../../src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** Source without comments, so that a word in a comment is not a call. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const scan = (pattern: RegExp) =>
  Object.entries(sources)
    .filter(([, text]) => pattern.test(code(text)))
    .map(([file]) => file);

describe('what the plugin never does', () => {
  it('has sources to scan', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it('never logs: note texts must not reach any log', () => {
    expect(scan(/\bconsole\s*\./)).toEqual([]);
  });

  it('never shows Figma notifications or closes the window by itself', () => {
    expect(scan(/\bfigma\.notify\b|\bfigma\.closePlugin\b/)).toEqual([]);
  });

  it('never uses the network or browser storage', () => {
    expect(
      scan(
        /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie/,
      ),
    ).toEqual([]);
  });

  it('never creates or changes a layer, a page, a comment or visible content', () => {
    expect(
      scan(
        /\.create(Frame|Text|Rectangle|Ellipse|Page|Comment|Component|Section|Sticky|Shape|Node|Line|Vector|Group|Image)\w*\(|\.appendChild\(|\.insertChild\(|\.remove\(\)|\.visible\s*=[^=]|\.locked\s*=[^=]|\.name\s*=[^=]|\.characters\s*=[^=]|setRelaunchData|setSharedPluginData/,
      ),
    ).toEqual([]);
  });

  it('stores notes only on the document root, through the pluginData API', () => {
    const users = scan(/\bsetPluginData\b/);
    expect(users).toEqual(['../../src/plugin/storage/document-notes.ts']);
  });

  it('writes no markup from note text into the window', () => {
    expect(
      scan(
        /innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|eval\s*\(|new Function/,
      ),
    ).toEqual([]);
  });

  it('uses no private or undocumented Figma API', () => {
    expect(
      scan(/\.__private|\bfigma\.[a-zA-Z]*Private|figma\.ui\.show\(\)/),
    ).toEqual([]);
  });
});

describe('what the plugin never reveals', () => {
  const SECRET = 'TOP-SECRET-TEXT-OF-ANOTHER-AUTHOR';
  const OTHER_ID = '777';
  const ids = { requestId: 'r', runId: 'run' };

  function otherAuthorNote(id: string, target: NoteTarget) {
    return JSON.stringify({
      schemaVersion: 1,
      id,
      authorId: OTHER_ID,
      kind: 'task',
      text: SECRET,
      status: 'open',
      target,
      createdAt: 1,
      updatedAt: 1,
      revision: 1,
    });
  }

  function build() {
    const store = new MemoryStore();
    // Records of another author: some well-formed, one forged under our key.
    store.seed(
      noteKey(OTHER_ID, 'theirs-1'),
      otherAuthorNote('theirs-1', FILE),
    );
    store.seed(
      noteKey(OTHER_ID, 'theirs-2'),
      otherAuthorNote(
        'theirs-2',
        frame('1:4', 'Their frame', '0:1', 'Their page'),
      ),
    );
    store.seed(noteKey('42', 'forged'), otherAuthorNote('forged', FILE));
    const service = createNotesService({
      store,
      getUserId: () => '42',
      now: () => 1000,
    });
    service.create({
      id: 'mine',
      kind: 'note',
      text: 'my own text',
      target: page('0:1', 'Mine'),
    });
    const handle = createCommandHandler({
      service,
      getContext: () => ({
        page: { id: '0:1', name: 'Mine' },
        selection: [],
        selectionCount: 0,
      }),
      resolveTarget: (target) => Promise.resolve({ ok: true, value: target }),
      listTargets: () =>
        Promise.resolve({ ok: true, value: { options: [], truncated: false } }),
      resolveTargets: (targets) =>
        Promise.resolve(
          targets.map((t) => ({
            type: t.type,
            id: t.id,
            state: 'missing' as const,
          })),
        ),
      focusTarget: () =>
        Promise.resolve({
          ok: true,
          value: { outcome: 'page', pageSwitched: false },
        }),
      resizeWindow: (size) => size,
    });
    return { store, handle };
  }

  const command = (type: string, payload: unknown) => ({
    protocolVersion: PROTOCOL_VERSION,
    type,
    ...ids,
    payload,
  });

  it('never puts another author text, id or key into any answer, and writes nothing for them', async () => {
    const { store, handle } = build();
    const target = (extra: object) => ({ ...extra });
    const ownId = { id: 'theirs-1', expectedRevision: 1 };
    const messages = [
      command('READY', {}),
      command('REFRESH_NOTES', {}),
      command('FOCUS_NOTE', { id: 'theirs-1' }),
      command('FOCUS_NOTE', { id: 'theirs-2' }),
      command('FOCUS_NOTE', { id: 'forged' }),
      command('UPDATE_NOTE', { ...ownId, text: 'hijack' }),
      command('REBIND_NOTE', { ...ownId, target: FILE }),
      command('SET_TASK_STATUS', { ...ownId, status: 'done' }),
      command('DELETE_NOTE', ownId),
      command('DELETE_NOTE', { id: 'forged', expectedRevision: 1 }),
      command('BULK_DELETE', {
        items: [
          ownId,
          { id: 'theirs-2', expectedRevision: 1 },
          { id: 'forged', expectedRevision: 1 },
        ],
      }),
      command('BULK_SET_STATUS', { items: [ownId], status: 'done' }),
      command('BULK_REBIND', { items: [ownId], target: target(FILE) }),
      command('CREATE_NOTE', {
        id: 'theirs-1',
        kind: 'note',
        text: 'clash',
        target: FILE,
      }),
    ];
    const before = JSON.stringify(
      Object.fromEntries(
        ['theirs-1', 'theirs-2'].map((id) => [
          id,
          store.get(noteKey(OTHER_ID, id)),
        ]),
      ),
    );
    const writesBefore = store.writes.length;
    const answers: string[] = [];
    for (const message of messages) {
      answers.push(JSON.stringify(await handle(message)));
    }
    const all = answers.join('\n');
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain(OTHER_ID);
    expect(all).not.toContain('Their frame');
    expect(all).not.toContain('private_notes_note_');
    // The records of the other author are exactly as they were.
    const after = JSON.stringify(
      Object.fromEntries(
        ['theirs-1', 'theirs-2'].map((id) => [
          id,
          store.get(noteKey(OTHER_ID, id)),
        ]),
      ),
    );
    expect(after).toBe(before);
    // The only write allowed is the new note of the current author ("clash" does not
    // exist for the current author, so it is created under the current author's key).
    const keys = store.writes.slice(writesBefore).map((w) => w.key);
    expect(keys.every((key) => key.startsWith(noteKey('42', '')))).toBe(true);
  });

  it('shows a record forged under the current key as an unreadable one, without its text', async () => {
    const { handle } = build();
    const response = await handle(command('READY', {}));
    const text = JSON.stringify(response);
    expect(text).not.toContain(SECRET);
    expect(text).toContain('author-mismatch');
    expect(text).toContain('my own text');
  });
});
