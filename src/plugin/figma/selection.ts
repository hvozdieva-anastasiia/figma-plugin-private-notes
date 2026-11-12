// Snapshot of the current page and selection for the window.

import type { DocumentContext } from '../../shared/messages';

const MAX_SELECTION = 20;

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
  };
}
