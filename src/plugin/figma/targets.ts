// Page and frame targets: checking that they exist and listing candidates.
// Pages and frames are loaded on demand; the whole document is never scanned.

import type { NoteTarget, Result } from '../../shared/model';
import type { TargetOption, TargetsData } from '../../shared/messages';
import { fail } from '../../shared/validation';

const MAX_OPTIONS = 100;

/** The page a node really lives on now, from its parents (not from a stored id). */
export function pageOf(node: BaseNode): PageNode | null {
  let current: BaseNode | null = node;
  while (current && current.type !== 'PAGE') current = current.parent;
  return current;
}

/**
 * Looks the target up by ID. Returns it with the names Figma has now and, for
 * a frame, the page it actually lives on (not the page remembered in the note).
 */
export async function resolveTarget(
  figmaApi: PluginAPI,
  target: NoteTarget,
): Promise<Result<NoteTarget>> {
  if (target.type === 'file') return { ok: true, value: target };
  const node = await figmaApi.getNodeByIdAsync(target.id);
  if (target.type === 'page') {
    if (!node || node.type !== 'PAGE') {
      return fail('TARGET_NOT_FOUND', 'Страница не найдена');
    }
    return {
      ok: true,
      value: {
        type: 'page',
        id: node.id,
        pageId: node.id,
        nameSnapshot: node.name,
        pageNameSnapshot: node.name,
      },
    };
  }
  if (!node || node.type !== 'FRAME') {
    return fail('TARGET_NOT_FOUND', 'Фрейм не найден');
  }
  const page = pageOf(node);
  if (!page) return fail('TARGET_NOT_FOUND', 'Страница фрейма не найдена');
  return {
    ok: true,
    value: {
      type: 'frame',
      id: node.id,
      pageId: page.id,
      nameSnapshot: node.name,
      pageNameSnapshot: page.name,
    },
  };
}

export async function listTargets(
  figmaApi: PluginAPI,
  request: { kind: 'page' | 'frame'; pageId: string | null; query: string },
): Promise<Result<TargetsData>> {
  const needle = request.query.trim().toLowerCase();
  const matches = (name: string) =>
    needle === '' || name.toLowerCase().includes(needle);

  if (request.kind === 'page') {
    const all = figmaApi.root.children
      .filter((page) => matches(page.name))
      .map((page): TargetOption => ({
        type: 'page',
        id: page.id,
        pageId: page.id,
        name: page.name,
        pageName: page.name,
      }));
    return {
      ok: true,
      value: {
        options: all.slice(0, MAX_OPTIONS),
        truncated: all.length > MAX_OPTIONS,
      },
    };
  }

  if (request.pageId === null) {
    return fail('INVALID_COMMAND', 'pageId is required to list frames');
  }
  const page = await figmaApi.getNodeByIdAsync(request.pageId);
  if (!page || page.type !== 'PAGE') {
    return fail('TARGET_NOT_FOUND', 'Страница не найдена');
  }
  await page.loadAsync();
  const all = page.children
    .filter((node): node is FrameNode => node.type === 'FRAME')
    .filter((frame) => matches(frame.name))
    .map((frame): TargetOption => ({
      type: 'frame',
      id: frame.id,
      pageId: page.id,
      name: frame.name,
      pageName: page.name,
    }));
  return {
    ok: true,
    value: {
      options: all.slice(0, MAX_OPTIONS),
      truncated: all.length > MAX_OPTIONS,
    },
  };
}
