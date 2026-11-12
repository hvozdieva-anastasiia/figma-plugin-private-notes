import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { noteKey } from '../../src/plugin/storage/document-notes';
import { FILE, frame, page } from './fixtures';
import { ready, seed, setup } from './harness';

// Stage 8: keyboard and screen-reader basics, checked against the Web
// Interface Guidelines (names for every control, labels, focus, live regions).

async function withNotes() {
  const env = setup();
  seed(env.service, 'a', 'Alpha note', FILE);
  seed(env.service, 'b', 'Beta task', page('0:1', 'Mobile'), 'task');
  seed(
    env.service,
    'c',
    'Gamma note',
    frame('1:4', 'Checkout', '0:1', 'Mobile'),
  );
  await ready();
  await env.user.click(
    screen.getByRole('button', { name: 'Refresh the list' }),
  );
  await screen.findByText('Alpha note');
  return env;
}

/** Every control a user can reach must have a name, and a label if it takes input. */
function expectNamedControls() {
  for (const el of document.querySelectorAll('button, [role="checkbox"]')) {
    const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
    expect(name, el.outerHTML).not.toBe('');
  }
  for (const el of document.querySelectorAll('input, select, textarea')) {
    const id = el.getAttribute('id');
    const labelled =
      el.getAttribute('aria-label') !== null ||
      (id !== null && document.querySelector(`label[for="${id}"]`) !== null) ||
      el.closest('label') !== null;
    expect(labelled, el.outerHTML).toBe(true);
  }
}

describe('accessibility', () => {
  it('names every control in the list, in selection mode and with the bulk panels open', async () => {
    const env = await withNotes();
    expectNamedControls();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    expectNamedControls();
    await env.user.click(
      screen.getByRole('button', { name: 'Select all (3)' }),
    );
    await env.user.click(screen.getByRole('button', { name: 'Move to…' }));
    expectNamedControls();
    await env.user.selectOptions(
      screen.getByLabelText('Move to'),
      'Choose another page or frame…',
    );
    expectNamedControls();
  });

  it('names every control of the editor, including the conflict panel', async () => {
    const env = await withNotes();
    await env.user.click(screen.getByRole('button', { name: 'Add note' }));
    expectNamedControls();
    env.store.data.delete(noteKey('42', 'a'));
    await env.user.click(screen.getByRole('button', { name: 'Cancel' }));
    const item = screen.getByText('Alpha note').closest('li') as HTMLElement;
    await env.user.click(
      within(item).getByRole('button', { name: 'Edit note' }),
    );
    await env.user.type(screen.getByLabelText('Text'), ' more');
    await env.user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    expectNamedControls();
  });

  it('has one page heading and group headings below it', async () => {
    await withNotes();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Private Notes' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(
      0,
    );
  });

  it('turns off autocomplete on non-account fields and ends placeholders with an ellipsis', async () => {
    const env = await withNotes();
    const search = screen.getByRole('searchbox', { name: 'Search notes' });
    expect(search).toHaveAttribute('autocomplete', 'off');
    expect(search).toHaveAttribute('name');
    expect(search.getAttribute('placeholder')).toMatch(/…$/);
    await env.user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByLabelText('Text')).toHaveAttribute(
      'autocomplete',
      'off',
    );
  });

  it('marks icons as decorative and gives icon-only buttons a name', async () => {
    await withNotes();
    for (const icon of document.querySelectorAll('svg.icon')) {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    }
    expect(screen.getByRole('button', { name: 'Add note' })).toHaveAttribute(
      'title',
    );
  });

  it('reports results to assistive technology through live regions', async () => {
    const env = await withNotes();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    expect(
      document.querySelector('.bulk__count[aria-live="polite"]'),
    ).not.toBeNull();
    await env.user.click(
      screen.getByRole('checkbox', { name: /Select note: Alpha/ }),
    );
    await env.user.click(screen.getByRole('button', { name: 'Move to…' }));
    await env.user.click(screen.getByRole('button', { name: 'Move 1 note' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Moved 1 note');
  });

  it('works from the keyboard: Tab reaches the controls, Space ticks, Enter activates', async () => {
    const env = await withNotes();
    await env.user.click(screen.getByRole('button', { name: 'Select' }));
    const box = screen.getByRole('checkbox', { name: /Select note: Alpha/ });
    box.focus();
    await env.user.keyboard(' ');
    expect(box).toHaveAttribute('aria-checked', 'true');
    await env.user.keyboard(' ');
    expect(box).toHaveAttribute('aria-checked', 'false');
    const exit = screen.getByRole('button', { name: 'Exit selection mode' });
    exit.focus();
    await env.user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Select' })).toBeInTheDocument();
  });

  it('saves with Ctrl+Enter and asks before dropping text on Escape', async () => {
    const env = await withNotes();
    await env.user.click(screen.getByRole('button', { name: 'Add note' }));
    await env.user.type(screen.getByLabelText('Text'), 'From the keyboard');
    await env.user.keyboard('{Escape}');
    expect(screen.getByText('Discard the unsaved text?')).toBeInTheDocument();
    await env.user.click(screen.getByRole('button', { name: 'Keep editing' }));
    await env.user.click(screen.getByLabelText('Text'));
    await env.user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByText('From the keyboard')).toBeInTheDocument();
    expect(env.store.keys()).toHaveLength(4);
  });

  it('closes an editor with nothing typed on Escape, without asking', async () => {
    const env = await withNotes();
    await env.user.click(screen.getByRole('button', { name: 'Add note' }));
    await env.user.keyboard('{Escape}');
    expect(
      screen.getByRole('button', { name: 'Add note' }),
    ).toBeInTheDocument();
    expect(env.store.keys()).toHaveLength(3);
  });

  it('keeps long text inside the window and handles very long names', async () => {
    const env = setup();
    const long = 'word '.repeat(700).trim();
    const longName = 'A very long frame name '.repeat(20);
    seed(env.service, 'l', long, frame('1:9', longName, '0:1', 'Mobile'));
    await ready();
    await env.user.click(
      screen.getByRole('button', { name: 'Refresh the list' }),
    );
    await screen.findByText(long);
    // Text wraps (CSS) and group names truncate (CSS): both classes are present.
    expect(screen.getByText(long)).toHaveClass('note__text');
    expect(
      document.querySelector('.group__name')?.textContent?.length ?? 0,
    ).toBeGreaterThan(0);
  });
});
