// Plugin Main: opens the window, answers its commands and reports the context.

import { PROTOCOL_VERSION, type ContextMessage } from '../shared/messages';
import { readCurrentUserId } from './current-user';
import { readContext } from './figma/selection';
import { listTargets, resolveTarget } from './figma/targets';
import { createCommandHandler } from './handlers';
import { createNotesService } from './notes-service';
import { storeFromHost } from './storage/document-notes';

figma.showUI(__html__, { width: 400, height: 640, themeColors: true });

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
});

figma.ui.onmessage = (raw: unknown) => {
  void handle(raw).then((response) => {
    if (response) figma.ui.postMessage(response);
  });
};

// The context only informs the window. It never edits a draft or any note.
function postContext(): void {
  const message: ContextMessage = {
    protocolVersion: PROTOCOL_VERSION,
    type: 'CONTEXT_CHANGED',
    context: readContext(figma),
  };
  figma.ui.postMessage(message);
}

figma.on('selectionchange', postContext);
figma.on('currentpagechange', postContext);
