import { describe, expect, it } from 'vitest';
import { resolutionKey } from '../../src/shared/group-notes';
import type { TargetResolution } from '../../src/shared/messages';
import { initialState, neededTargets, reducer } from '../../src/ui/state';
import { FILE, frame, makeNote, page } from './fixtures';

const available = (type: 'page' | 'frame', id: string): TargetResolution => ({
  type,
  id,
  state: 'available',
  name: 'n',
  pageId: '0:1',
  pageName: 'p',
});

describe('target checks', () => {
  const notes = [
    makeNote({ target: FILE }),
    makeNote({ target: page('0:1', 'Mobile') }),
    makeNote({ target: frame('1:4', 'A', '0:1', 'Mobile') }),
    makeNote({ target: frame('1:4', 'A', '0:1', 'Mobile') }),
  ];

  it('asks once for each distinct page and frame, and never for the file', () => {
    expect(neededTargets(notes, {}, {})).toEqual([
      { type: 'page', id: '0:1' },
      { type: 'frame', id: '1:4' },
    ]);
  });

  it('does not ask again for targets that are known or being checked', () => {
    const known = { [resolutionKey('page', '0:1')]: available('page', '0:1') };
    const checking = { [resolutionKey('frame', '1:4')]: true as const };
    expect(neededTargets(notes, known, checking)).toEqual([]);
  });

  it('marks targets as being checked and stores the answers', () => {
    let state = reducer(initialState, {
      type: 'RESOLVE_STARTED',
      keys: ['page:0:1'],
    });
    expect(state.checking).toEqual({ 'page:0:1': true });
    state = reducer(state, {
      type: 'RESOLVED',
      generation: 0,
      keys: ['page:0:1'],
      resolutions: [available('page', '0:1')],
    });
    expect(state.checking).toEqual({});
    expect(state.resolutions['page:0:1']?.state).toBe('available');
  });

  it('drops the answer to a request made before the cache was cleared', () => {
    let state = reducer(initialState, {
      type: 'RESOLVE_STARTED',
      keys: ['page:0:1'],
    });
    state = reducer(state, { type: 'CLEAR_RESOLUTIONS' });
    expect(state.generation).toBe(1);
    expect(state.checking).toEqual({});
    const after = reducer(state, {
      type: 'RESOLVED',
      generation: 0,
      keys: ['page:0:1'],
      resolutions: [{ type: 'page', id: '0:1', state: 'missing' }],
    });
    expect(after).toBe(state);
  });

  it('forgets only failed checks when asked to retry', () => {
    const state = {
      ...initialState,
      resolutions: {
        'page:0:1': { type: 'page', id: '0:1', state: 'error' },
        'page:0:2': { type: 'page', id: '0:2', state: 'missing' },
      } as Record<string, TargetResolution>,
    };
    const next = reducer(state, {
      type: 'RETRY_RESOLUTIONS',
      keys: ['page:0:1', 'page:0:2'],
    });
    expect(Object.keys(next.resolutions)).toEqual(['page:0:2']);
  });

  it('records a target found missing by a failed move', () => {
    const next = reducer(initialState, {
      type: 'TARGET_MISSING',
      target: { type: 'frame', id: '1:4' },
    });
    expect(next.resolutions['frame:1:4']).toEqual({
      type: 'frame',
      id: '1:4',
      state: 'missing',
    });
  });

  it('keeps the notes and the editor when the cache is cleared', () => {
    const state = {
      ...initialState,
      notes,
      resolutions: { x: available('page', '0:1') },
    };
    const next = reducer(state, { type: 'CLEAR_RESOLUTIONS' });
    expect(next.notes).toBe(notes);
    expect(next.resolutions).toEqual({});
  });
});
