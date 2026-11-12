// Plugin Main: opens the window, answers its commands and reports the context.

import {
  DEFAULT_WINDOW,
  PROTOCOL_VERSION,
  clampWindow,
  type ContextMessage,
  type WindowSize,
} from '../shared/messages';
import { readCurrentUserId } from './current-user';
import { readContext } from './figma/selection';
import { focusTarget, resolveTargets } from './figma/navigation';
import { listTargets, resolveTarget } from './figma/targets';
import { createCommandHandler } from './handlers';
import { createNotesService } from './notes-service';
import { storeFromHost } from './storage/document-notes';

const SIZE_KEY = 'private-notes:window-size';
const SAVE_DELAY_MS = 400;

/** The size the user left the window at last time; the document does not hold it. */
async function loadSize(): Promise<WindowSize> {
  try {
    const stored: unknown = await figma.clientStorage.getAsync(SIZE_KEY);
    if (
      typeof stored === 'object' &&
      stored !== null &&
      typeof (stored as WindowSize).width === 'number' &&
      typeof (stored as WindowSize).height === 'number'
    ) {
      const { width, height } = stored as WindowSize;
      return clampWindow(width, height);
    }
  } catch {
    // Storage is only a convenience: fall back to the default size.
  }
  return DEFAULT_WINDOW;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;

function resizeWindow(size: WindowSize): WindowSize {
  const applied = clampWindow(size.width, size.height);
  figma.ui.resize(applied.width, applied.height);
  // Dragging sends many sizes; only the last one is stored.
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    figma.clientStorage.setAsync(SIZE_KEY, applied).catch(() => undefined);
  }, SAVE_DELAY_MS);
  return applied;
}

const service = createNotesService({
  store: storeFromHost(figma.root),
  getUserId: () => readCurrentUserId(figma),
  now: () => Date.now(),
});

const handle = createCommandHandler({
  service,
  getContext: () => readContext(figma),
  resolveTarget: (target) => resolveTarget(figma, target),
  listTargets: (request) => listTargets(figma, request),
  resolveTargets: (targets) => resolveTargets(figma, targets),
  focusTarget: (target) => focusTarget(figma, target),
  resizeWindow,
});

// The context only informs the window. It never edits a draft or any note.
function postContext(): void {
  const message: ContextMessage = {
    protocolVersion: PROTOCOL_VERSION,
    type: 'CONTEXT_CHANGED',
    context: readContext(figma),
  };
  figma.ui.postMessage(message);
}

void loadSize().then((size) => {
  figma.showUI(__html__, {
    width: size.width,
    height: size.height,
    themeColors: true,
  });
  figma.ui.onmessage = (raw: unknown) => {
    void handle(raw).then((response) => {
      if (response) figma.ui.postMessage(response);
    });
  };
  figma.on('selectionchange', postContext);
  figma.on('currentpagechange', postContext);
});
