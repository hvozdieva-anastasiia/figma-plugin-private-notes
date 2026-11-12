import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ready, setup } from './harness';

// Figma clips a plugin window that is taller than its viewport, which hides the
// bottom of the list and the resize handle. The window keeps within the screen.

describe('window height against the screen', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      configurable: true,
    });
  });

  it('brings an oversized remembered window back inside the screen', async () => {
    vi.stubGlobal('screen', { availHeight: 700 });
    Object.defineProperty(window, 'innerHeight', {
      value: 900,
      configurable: true,
    });
    const env = setup();
    await ready();
    await waitFor(() => expect(env.resized).toHaveLength(1));
    // 700 minus the room Figma needs around the window.
    expect(env.resized[0]?.height).toBe(540);
  });

  it('does not touch a window that already fits', async () => {
    vi.stubGlobal('screen', { availHeight: 1000 });
    Object.defineProperty(window, 'innerHeight', {
      value: 640,
      configurable: true,
    });
    const env = setup();
    await ready();
    expect(env.resized).toHaveLength(0);
  });

  it('does not let the keyboard grow the window past the screen', async () => {
    vi.stubGlobal('screen', { availHeight: 700 });
    Object.defineProperty(window, 'innerHeight', {
      value: 500,
      configurable: true,
    });
    const env = setup();
    await ready();
    const grip = screen.getByRole('button', { name: /Resize the window/ });
    grip.focus();
    await env.user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    await waitFor(() => expect(env.resized).toHaveLength(1));
    expect(env.resized[0]?.height).toBe(540);
  });
});
