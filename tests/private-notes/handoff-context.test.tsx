import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notesToMarkdown } from '../../src/shared/export-markdown';
import { resolutionKey } from '../../src/shared/group-notes';
import type {
  DocumentContext,
  TargetResolution,
} from '../../src/shared/messages';
import { hereIds, matchesScope } from '../../src/shared/select-notes';
import { workingTarget } from '../../src/ui/state';
import { FILE, frame, makeNote, page } from './fixtures';
import { ready, seed, setup } from './harness';

const P1 = page('0:1', 'Mobile');
const OUTER = frame('1:4', 'Checkout', '0:1', 'Mobile');
const INNER = frame('1:9', 'Payment', '0:1', 'Mobile');
const OTHER = frame('1:5', 'Cart', '0:1', 'Mobile');

const available = (id: string, name: string, ancestorFrameIds: string[] = []) =>
  [
    resolutionKey('frame', id),
    {
      type: 'frame',
      id,
      state: 'available',
      name,
      pageId: '0:1',
      pageName: 'Mobile',
      ancestorFrameIds,
    },
  ] as const;

describe('Markdown handoff', () => {
  it('lists the file, pages with their frames and notes without a target', () => {
    const notes = [
      makeNote({ target: FILE, text: 'Ask about the logo' }),
      makeNote({ target: P1, kind: 'task', status: 'open', text: 'Fix grid' }),
      makeNote({
        target: OUTER,
        kind: 'task',
        status: 'done',
        text: 'Spacing\nsecond line',
      }),
      makeNote({ target: OTHER, text: 'Lost note' }),
    ];
    const text = notesToMarkdown(
      notes,
      new Map<string, TargetResolution>([
        available('1:4', 'Checkout v2'),
        [
          resolutionKey('frame', '1:5'),
          { type: 'frame', id: '1:5', state: 'missing' },
        ],
      ]),
    );
    expect(text).toBe(
      [
        '# Notes',
        '',
        '## Whole file',
        '',
        '- Ask about the logo',
        '',
        '## Page: Mobile',
        '',
        '- [ ] Fix grid',
        '',
        '### Frame: Checkout v2',
        '',
        '- [x] Spacing',
        '  second line',
        '',
        '## No available target',
        '',
        '- Lost note _(was frame: Cart)_',
        '',
      ].join('\n'),
    );
  });

  it('says so when nothing is selected and escapes names', () => {
    expect(notesToMarkdown([])).toContain('No notes selected');
    const tricky = makeNote({
      target: frame('1:1', 'A *b* [c]\nd', '0:1', 'Mobile'),
    });
    expect(notesToMarkdown([tricky])).toContain(
      '### Frame: A \\*b\\* \\[c\\] d',
    );
  });
});

describe('Smart Context rules', () => {
  const outer = makeNote({ target: OUTER });
  const inner = makeNote({ target: INNER });
  const other = makeNote({ target: OTHER });
  const onPage = makeNote({ target: P1 });
  const resolutions = new Map([
    available('1:4', 'Checkout'),
    available('1:9', 'Payment', ['1:4']),
    available('1:5', 'Cart'),
  ]);

  it('includes frames nested inside the working frame at any depth', () => {
    const current = { frameId: '1:4', pageId: '0:1' };
    expect(matchesScope(outer, 'current', current, resolutions)).toBe(true);
    expect(matchesScope(inner, 'current', current, resolutions)).toBe(true);
    expect(matchesScope(other, 'current', current, resolutions)).toBe(false);
    expect(matchesScope(onPage, 'current', current, resolutions)).toBe(false);
  });

  it('does not count a nested frame before Figma has reported where it is', () => {
    const current = { frameId: '1:4', pageId: '0:1' };
    expect(matchesScope(inner, 'current', current)).toBe(false);
  });

  it('indicates what belongs to the selection without hiding anything', () => {
    const ids = hereIds(
      [outer, inner, other, onPage],
      { frameId: '1:4', pageId: '0:1' },
      resolutions,
    );
    expect([...ids].sort()).toEqual([outer.id, inner.id].sort());
  });

  it('names the frame around a selected layer, else the page', () => {
    const base: DocumentContext = {
      page: { id: '0:1', name: 'Mobile' },
      selection: [{ id: '2:2', type: 'TEXT', name: 'Title' }],
      selectionCount: 1,
    };
    expect(
      workingTarget({ ...base, focusFrame: { id: '1:4', name: 'Checkout' } }),
    ).toMatchObject({ type: 'frame', id: '1:4', nameSnapshot: 'Checkout' });
    expect(workingTarget({ ...base, focusFrame: null })).toMatchObject({
      type: 'page',
      id: '0:1',
    });
  });
});

describe('Smart Context in the window', () => {
  const layerInFrame: DocumentContext = {
    page: { id: '0:1', name: 'Mobile' },
    selection: [{ id: '2:2', type: 'TEXT', name: 'Title' }],
    selectionCount: 1,
    focusFrame: { id: '1:4', name: 'Checkout' },
  };

  async function withNotes(initialScope: 'all' | 'current' = 'all') {
    const env = setup(layerInFrame, { scope: initialScope });
    seed(env.service, 'a', 'Outer note', OUTER);
    seed(env.service, 'b', 'Inner note', INNER);
    seed(env.service, 'c', 'Cart note', OTHER);
    seed(env.service, 'd', 'Page note', P1);
    env.world['1:9'] = {
      name: 'Payment',
      pageId: '0:1',
      pageName: 'Mobile',
      ancestorFrameIds: ['1:4'],
    };
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Refresh the list' }),
    );
    await screen.findByText('Outer note');
    return env;
  }

  it('shows how many notes are here, marks them and hides nothing', async () => {
    await withNotes();
    expect(
      await screen.findByText(/Now: Frame · Checkout.*2 notes here/),
    ).toBeInTheDocument();
    for (const text of ['Outer note', 'Inner note', 'Cart note', 'Page note']) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    expect(screen.getAllByText('In the current selection')).toHaveLength(2);
    expect(screen.queryByText('Here')).not.toBeInTheDocument();
  });

  it('filters to the working frame and its nested frames on request', async () => {
    const env = await withNotes();
    await env.user.click(
      screen.getByRole('button', { name: 'Current selection' }),
    );
    expect(screen.getByText('Outer note')).toBeInTheDocument();
    expect(screen.getByText('Inner note')).toBeInTheDocument();
    expect(screen.queryByText('Cart note')).not.toBeInTheDocument();
    expect(screen.queryByText('Page note')).not.toBeInTheDocument();
  });

  it('remembers the chosen view for the next launch', async () => {
    const env = await withNotes();
    expect(env.savedPrefs()).toEqual({ scope: 'all' });
    await env.user.click(
      screen.getByRole('button', { name: 'Current selection' }),
    );
    expect(env.savedPrefs()).toEqual({ scope: 'current' });
    await env.user.click(screen.getByRole('button', { name: 'All notes' }));
    expect(env.savedPrefs()).toEqual({ scope: 'all' });
  });

  it('opens in the remembered view', async () => {
    await withNotes('current');
    expect(
      screen.getByRole('button', { name: 'Current selection' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Cart note')).not.toBeInTheDocument();
  });

  it('counts the whole page when no frame is being worked on', async () => {
    const env = setup({
      page: { id: '0:1', name: 'Mobile' },
      selection: [],
      selectionCount: 0,
      focusFrame: null,
    });
    seed(env.service, 'a', 'Outer note', OUTER);
    seed(env.service, 'd', 'Page note', P1);
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Refresh the list' }),
    );
    await screen.findByText('Outer note');
    expect(
      screen.getByText(/Now: Page · Mobile \(and its frames\).*2 notes here/),
    ).toBeInTheDocument();
    // On a page the notes are not marked one by one.
    expect(
      screen.queryByText('In the current selection'),
    ).not.toBeInTheDocument();
  });
});

describe('Copy as Markdown', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function selectTwo() {
    const env = setup();
    seed(env.service, 'a', 'Alpha', P1);
    seed(env.service, 'b', 'Beta', FILE, 'task');
    seed(env.service, 'c', 'Gamma', P1);
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Refresh the list' }),
    );
    await screen.findByText('Alpha');
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    await env.user.click(
      screen.getByRole('checkbox', { name: 'Select note: Alpha' }),
    );
    await env.user.click(
      screen.getByRole('checkbox', { name: 'Select note: Beta' }),
    );
    return env;
  }

  it('copies the selected notes and says how many', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const env = await selectTwo();
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await env.user.click(
      screen.getByRole('button', { name: 'Copy as Markdown' }),
    );
    expect(
      await screen.findByText('Copied 2 notes as Markdown.'),
    ).toBeVisible();
    const text = String(writeText.mock.calls[0]?.[0]);
    expect(text).toContain('- [ ] Beta');
    expect(text).toContain('- Alpha');
    expect(text).not.toContain('Gamma');
  });

  it('shows the text to copy by hand when the clipboard refuses', async () => {
    const env = await selectTwo();
    vi.stubGlobal('navigator', {
      clipboard: { writeText: () => Promise.reject(new Error('denied')) },
    });
    await env.user.click(
      screen.getByRole('button', { name: 'Copy as Markdown' }),
    );
    const area = await screen.findByRole('textbox', {
      name: 'Markdown of the selected notes',
    });
    expect((area as HTMLTextAreaElement).value).toContain('- Alpha');
    const group = screen.getByRole('group', { name: 'Markdown to copy' });
    await env.user.click(within(group).getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByRole('group', { name: 'Markdown to copy' }),
    ).not.toBeInTheDocument();
  });

  it('is disabled with an empty selection', async () => {
    const env = setup();
    seed(env.service, 'a', 'Alpha', P1);
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Refresh the list' }),
    );
    await screen.findByText('Alpha');
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    expect(
      screen.getByRole('button', { name: 'Copy as Markdown' }),
    ).toBeDisabled();
  });
});
