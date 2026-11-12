// Checking targets in bounded batches and moving the user to them. Nothing
// here changes a layer: visibility and locks stay as they are, nothing is
// created, and the plugin window stays open.

import type { NoteTarget, Result } from '../../shared/model';
import type {
  FocusData,
  TargetRef,
  TargetResolution,
} from '../../shared/messages';
import { fail } from '../../shared/validation';
import { pageOf } from './targets';

/**
 * Looks each target up by ID. A missing node is `missing`; an API exception is
 * `error` and is never reported as a deleted target.
 */
export function resolveTargets(
  figmaApi: PluginAPI,
  refs: TargetRef[],
): Promise<TargetResolution[]> {
  return Promise.all(
    refs.map(async (ref): Promise<TargetResolution> => {
      try {
        const node = await figmaApi.getNodeByIdAsync(ref.id);
        if (!node) return { type: ref.type, id: ref.id, state: 'missing' };
        if (ref.type === 'page') {
          return node.type === 'PAGE'
            ? {
                type: 'page',
                id: ref.id,
                state: 'available',
                name: node.name,
                pageId: node.id,
                pageName: node.name,
              }
            : { type: 'page', id: ref.id, state: 'missing' };
        }
        if (node.type !== 'FRAME') {
          return { type: 'frame', id: ref.id, state: 'missing' };
        }
        const page = pageOf(node);
        if (!page) return { type: 'frame', id: ref.id, state: 'missing' };
        return {
          type: 'frame',
          id: ref.id,
          state: 'available',
          name: node.name,
          pageId: page.id,
          pageName: page.name,
        };
      } catch {
        return { type: ref.type, id: ref.id, state: 'error' };
      }
    }),
  );
}

/**
 * page: switch to it. frame: switch to its actual page, select it and bring it
 * into view. An API exception propagates and is reported as an error, not as
 * "not found".
 */
export async function focusTarget(
  figmaApi: PluginAPI,
  target: NoteTarget,
): Promise<Result<FocusData>> {
  if (target.type === 'file') {
    return fail('INVALID_TARGET', 'This note belongs to the whole file');
  }
  const node = await figmaApi.getNodeByIdAsync(target.id);

  if (target.type === 'page') {
    if (!node || node.type !== 'PAGE') {
      return fail('TARGET_NOT_FOUND', 'Page not found');
    }
    const pageSwitched = figmaApi.currentPage.id !== node.id;
    if (pageSwitched) await figmaApi.setCurrentPageAsync(node);
    return { ok: true, value: { outcome: 'page', pageSwitched } };
  }

  if (!node || node.type !== 'FRAME') {
    return fail('TARGET_NOT_FOUND', 'Frame not found');
  }
  const page = pageOf(node);
  if (!page)
    return fail('TARGET_NOT_FOUND', 'The page of the frame was not found');
  const pageSwitched = figmaApi.currentPage.id !== page.id;
  if (pageSwitched) await figmaApi.setCurrentPageAsync(page);
  try {
    figmaApi.currentPage.selection = [node];
    figmaApi.viewport.scrollAndZoomIntoView([node]);
  } catch {
    return fail('NAVIGATION_FAILED', 'Could not show the frame');
  }
  return { ok: true, value: { outcome: 'frame', pageSwitched } };
}
