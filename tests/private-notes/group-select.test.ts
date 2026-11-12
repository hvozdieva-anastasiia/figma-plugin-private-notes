import { describe, expect, it } from 'vitest';
import {
  groupNotes,
  resolutionKey,
  totalCount,
} from '../../src/shared/group-notes';
import {
  matchesQuery,
  selectNotes,
  type SelectOptions,
} from '../../src/shared/select-notes';
import type { TargetResolution } from '../../src/shared/messages';
import { FILE, frame, makeNote, page } from './fixtures';

const P1 = page('0:1', 'Mobile');
const F1 = frame('1:1', 'Checkout', '0:1', 'Mobile');
const F2 = frame('1:2', 'Cart', '0:1', 'Mobile');
const F3 = frame('1:3', 'Home', '0:2', 'Desktop');

const missing = (type: 'page' | 'frame', id: string) =>
  [resolutionKey(type, id), { type, id, state: 'missing' }] as const;

const live = (
  type: 'page' | 'frame',
  id: string,
  name: string,
  pageId: string,
  pageName: string,
) =>
  [
    resolutionKey(type, id),
    { type, id, state: 'available', name, pageId, pageName },
  ] as const;

const all = {
  query: '',
  filter: 'all',
  scope: 'all',
  current: { frameId: null, pageId: null },
} as const satisfies SelectOptions;

describe('grouping', () => {
  it('builds file, page and nested frame groups from all three target types', () => {
    const notes = [
      makeNote({ target: FILE }),
      makeNote({ target: P1 }),
      makeNote({ target: F1 }),
      makeNote({ target: F2 }),
      makeNote({ target: F3 }),
    ];
    const grouped = groupNotes(notes);
    expect(grouped.file?.count).toBe(1);
    expect(grouped.pages.map((p) => p.label)).toEqual(['Desktop', 'Mobile']);
    const mobile = grouped.pages.find((p) => p.id === '0:1');
    expect(mobile?.frames.map((f) => f.label)).toEqual(['Cart', 'Checkout']);
    expect(grouped.unresolved).toBeNull();
  });

  it('counts a page as its own notes plus its frames, each note once', () => {
    const notes = [
      makeNote({ target: P1 }),
      makeNote({ target: P1 }),
      makeNote({ target: F1 }),
      makeNote({ target: F2 }),
      makeNote({ target: F2 }),
    ];
    const grouped = groupNotes(notes);
    const mobile = grouped.pages[0];
    expect(mobile?.notes).toHaveLength(2);
    expect(mobile?.frames.map((f) => f.count)).toEqual([2, 1]);
    expect(mobile?.count).toBe(5);
    expect(totalCount(grouped)).toBe(5);
  });

  it('creates a page group for a page that has only frame notes', () => {
    const grouped = groupNotes([makeNote({ target: F3 })]);
    expect(grouped.pages).toHaveLength(1);
    expect(grouped.pages[0]).toMatchObject({
      label: 'Desktop',
      notes: [],
      count: 1,
    });
  });

  it('shows no empty groups', () => {
    const grouped = groupNotes([]);
    expect(grouped).toEqual({ file: null, pages: [], unresolved: null });
    expect(totalCount(grouped)).toBe(0);
  });

  it('labels a group with the newest snapshot and keeps the id as the key', () => {
    const old = makeNote({ target: page('0:1', 'Old name'), updatedAt: 1 });
    const fresh = makeNote({ target: page('0:1', 'New name'), updatedAt: 9 });
    const grouped = groupNotes([old, fresh]);
    expect(grouped.pages).toHaveLength(1);
    expect(grouped.pages[0]).toMatchObject({
      key: 'page:0:1',
      label: 'New name',
    });
  });

  it('keeps equal names apart by id', () => {
    const a = frame('1:1', 'Frame', '0:1', 'Mobile');
    const b = frame('1:9', 'Frame', '0:1', 'Mobile');
    const grouped = groupNotes([
      makeNote({ target: a }),
      makeNote({ target: b }),
    ]);
    expect(grouped.pages[0]?.frames.map((f) => f.key).sort()).toEqual([
      'frame:1:1',
      'frame:1:9',
    ]);
  });

  it('puts notes with a missing target into their own group and keeps their text', () => {
    const lost = makeNote({ target: F1 });
    const fine = makeNote({ target: F2 });
    const grouped = groupNotes([lost, fine], {
      resolutions: new Map<string, TargetResolution>([missing('frame', '1:1')]),
    });
    expect(grouped.unresolved?.notes.map((n) => n.id)).toEqual([lost.id]);
    expect(grouped.unresolved?.notes[0]?.text).toBe(lost.text);
    expect(grouped.pages[0]?.frames).toHaveLength(1);
    expect(totalCount(grouped)).toBe(2);
  });

  it('never treats an unchecked target or a failed check as lost', () => {
    const a = makeNote({ target: F1 });
    const b = makeNote({ target: P1 });
    const grouped = groupNotes([a, b], {
      resolutions: new Map<string, TargetResolution>([
        [
          resolutionKey('frame', '1:1'),
          { type: 'frame', id: '1:1', state: 'error' },
        ],
      ]),
    });
    expect(grouped.unresolved).toBeNull();
    expect(totalCount(grouped)).toBe(2);
  });

  it('shows the current names, not the names saved in the notes', () => {
    const note = makeNote({ target: F1 });
    const grouped = groupNotes([note], {
      resolutions: new Map<string, TargetResolution>([
        live('frame', '1:1', 'Checkout v2', '0:1', 'Mobile app'),
      ]),
    });
    expect(grouped.pages[0]?.label).toBe('Mobile app');
    expect(grouped.pages[0]?.frames[0]).toMatchObject({
      key: 'frame:1:1',
      label: 'Checkout v2',
    });
  });

  it('puts a moved frame under the page it is on now', () => {
    const note = makeNote({ target: F1 }); // saved on 0:1 Mobile
    const grouped = groupNotes([note], {
      resolutions: new Map<string, TargetResolution>([
        live('frame', '1:1', 'Checkout', '0:2', 'Desktop'),
      ]),
    });
    expect(grouped.pages).toHaveLength(1);
    expect(grouped.pages[0]).toMatchObject({
      id: '0:2',
      label: 'Desktop',
      count: 1,
    });
  });

  it('keeps two frames with one name apart and counts them separately', () => {
    const a = makeNote({ target: frame('1:1', 'Frame', '0:1', 'Mobile') });
    const b = makeNote({ target: frame('1:9', 'Frame', '0:1', 'Mobile') });
    const grouped = groupNotes([a, b], {
      resolutions: new Map<string, TargetResolution>([
        live('frame', '1:1', 'Frame', '0:1', 'Mobile'),
        live('frame', '1:9', 'Frame', '0:1', 'Mobile'),
      ]),
    });
    expect(grouped.pages[0]?.frames.map((f) => f.key).sort()).toEqual([
      'frame:1:1',
      'frame:1:9',
    ]);
  });

  it('orders notes by recent change', () => {
    const a = makeNote({ target: FILE, updatedAt: 5 });
    const b = makeNote({ target: FILE, updatedAt: 9 });
    expect(groupNotes([a, b]).file?.notes.map((n) => n.id)).toEqual([
      b.id,
      a.id,
    ]);
  });
});

describe('select', () => {
  const task = makeNote({
    target: F1,
    kind: 'task',
    status: 'open',
    text: 'Fix button',
  });
  const done = makeNote({
    target: P1,
    kind: 'task',
    status: 'done',
    text: 'Ship',
  });
  const note = makeNote({ target: FILE, text: 'Remember the API' });
  const other = makeNote({ target: F3, text: 'Hero banner' });
  const notes = [task, done, note, other];

  it('filters by kind and status', () => {
    expect(selectNotes(notes, { ...all, filter: 'notes' })).toEqual([
      note,
      other,
    ]);
    expect(selectNotes(notes, { ...all, filter: 'open' })).toEqual([task]);
    expect(selectNotes(notes, { ...all, filter: 'done' })).toEqual([done]);
  });

  it('searches the text and the target names, ignoring case', () => {
    expect(selectNotes(notes, { ...all, query: 'api' })).toEqual([note]);
    expect(selectNotes(notes, { ...all, query: 'CHECKOUT' })).toEqual([task]);
    expect(selectNotes(notes, { ...all, query: 'desktop' })).toEqual([other]);
    expect(matchesQuery(note, '   ')).toBe(true);
  });

  it('follows one selected frame', () => {
    const current = { frameId: '1:1', pageId: '0:1' };
    expect(selectNotes(notes, { ...all, scope: 'current', current })).toEqual([
      task,
    ]);
  });

  it('follows the current page with its frames when no single frame is selected', () => {
    const current = { frameId: null, pageId: '0:1' };
    expect(selectNotes(notes, { ...all, scope: 'current', current })).toEqual([
      task,
      done,
    ]);
  });

  it('leaves whole-file notes to the general mode', () => {
    const current = { frameId: null, pageId: '0:1' };
    expect(
      selectNotes(notes, { ...all, scope: 'current', current }),
    ).not.toContain(note);
    expect(selectNotes(notes, all)).toContain(note);
  });

  it('follows the page a frame is on now, and drops lost notes from the current mode', () => {
    const moved = makeNote({ target: F1 }); // saved on 0:1
    const gone = makeNote({ target: F2 });
    const resolutions = new Map<string, TargetResolution>([
      live('frame', '1:1', 'Checkout', '0:2', 'Desktop'),
      missing('frame', '1:2'),
    ]);
    const onDesktop = { frameId: null, pageId: '0:2' };
    const onMobile = { frameId: null, pageId: '0:1' };
    const base = { ...all, scope: 'current', resolutions } as const;
    expect(selectNotes([moved, gone], { ...base, current: onDesktop })).toEqual(
      [moved],
    );
    expect(selectNotes([moved, gone], { ...base, current: onMobile })).toEqual(
      [],
    );
  });

  it('searches the current name of a renamed target', () => {
    const note = makeNote({ target: F1, text: 'plain' });
    const resolutions = new Map<string, TargetResolution>([
      live('frame', '1:1', 'Payment', '0:1', 'Mobile'),
    ]);
    expect(
      selectNotes([note], { ...all, query: 'payment', resolutions }),
    ).toEqual([note]);
    expect(
      selectNotes([note], { ...all, query: 'checkout', resolutions }),
    ).toEqual([]);
  });

  it('shows nothing in current mode without a page', () => {
    expect(selectNotes(notes, { ...all, scope: 'current' })).toEqual([]);
  });

  it('filters first, so group counts cover only visible notes', () => {
    const visible = selectNotes(notes, { ...all, filter: 'open' });
    const grouped = groupNotes(visible);
    expect(totalCount(grouped)).toBe(1);
    expect(grouped.pages[0]?.count).toBe(1);
    expect(grouped.file).toBeNull();
  });

  it('does not change the notes it filters', () => {
    const before = JSON.stringify(notes);
    selectNotes(notes, { ...all, query: 'x', filter: 'done' });
    groupNotes(notes);
    expect(JSON.stringify(notes)).toBe(before);
  });
});
