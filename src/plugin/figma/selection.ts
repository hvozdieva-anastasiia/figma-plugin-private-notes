// Snapshot of the current page and selection for the window.

import type { DocumentContext } from '../../shared/messages';

const MAX_SELECTION = 20;

/**
 * The frame the user is working in: the selected frame itself, or the nearest
 * frame around a single selected layer. Nothing for no selection or several.
 */
function readFocusFrame(
  selection: readonly SceneNode[],
): { id: string; name: string } | null {
  if (selection.length !== 1) return null;
  let current: BaseNode | null = selection[0] ?? null;
  while (current && current.type !== 'PAGE') {
    if (current.type === 'FRAME') return { id: current.id, name: current.name };
    current = current.parent;
  }
  return null;
}

export function readContext(figmaApi: PluginAPI): DocumentContext {
  const page = figmaApi.currentPage;
  const { selection } = page;
  return {
    page: { id: page.id, name: page.name },
    selection: selection.slice(0, MAX_SELECTION).map((node) => ({
      id: node.id,
      type: node.type,
      name: node.name,
    })),
    selectionCount: selection.length,
    focusFrame: readFocusFrame(selection),
  };
}
