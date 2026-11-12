// The only place that talks to Plugin Main. Matches answers to requests by
// requestId and runId, times out, and forwards context events. It holds no
// Figma objects and never sends an author.

import type { Result } from '../shared/model';
import {
  PROTOCOL_VERSION,
  isCommandType,
  type CommandPayloads,
  type CommandResults,
  type CommandType,
  type DocumentContext,
} from '../shared/messages';
import { fail, isRecord } from '../shared/validation';

export interface Transport {
  post(message: unknown): void;
  /** Returns the unsubscribe function. */
  subscribe(listener: (message: unknown) => void): () => void;
}

export interface Bridge {
  request<C extends CommandType>(
    type: C,
    payload: CommandPayloads[C],
  ): Promise<Result<CommandResults[C]>>;
  onContext(listener: (context: DocumentContext) => void): () => void;
  dispose(): void;
}

export interface BridgeOptions {
  runId?: string;
  timeoutMs?: number;
  newId?: () => string;
}

/** A random id made of letters, digits and hyphens, as note ids must be. */
export function randomId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const part = () => Math.random().toString(36).slice(2, 10);
  return `${part()}-${part()}-${Date.now().toString(36)}`;
}

/** Transport of a Figma plugin iframe. */
export function figmaTransport(): Transport {
  return {
    post(message) {
      parent.postMessage({ pluginMessage: message }, '*');
    },
    subscribe(listener) {
      const handler = (event: MessageEvent) => {
        const data: unknown = event.data;
        if (isRecord(data) && 'pluginMessage' in data) {
          listener(data.pluginMessage);
        }
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    },
  };
}

interface Pending {
  command: CommandType;
  resolve: (result: Result<never>) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function createBridge(
  transport: Transport,
  options: BridgeOptions = {},
): Bridge {
  const runId = options.runId ?? randomId();
  const timeoutMs = options.timeoutMs ?? 15_000;
  const newId = options.newId ?? randomId;
  const pending = new Map<string, Pending>();
  const contextListeners = new Set<(context: DocumentContext) => void>();

  const unsubscribe = transport.subscribe((message) => {
    if (!isRecord(message) || message.protocolVersion !== PROTOCOL_VERSION) {
      return;
    }
    if (message.type === 'CONTEXT_CHANGED') {
      const context = message.context as DocumentContext;
      for (const listener of contextListeners) listener(context);
      return;
    }
    if (message.type !== 'RESPONSE') return;
    // Answers to an older window or an unknown request are ignored.
    if (message.runId !== runId) return;
    const { requestId, command } = message;
    if (typeof requestId !== 'string') return;
    const entry = pending.get(requestId);
    if (!entry || entry.command !== command || !isCommandType(command)) return;
    pending.delete(requestId);
    clearTimeout(entry.timer);
    entry.resolve(message.result as Result<never>);
  });

  return {
    request(type, payload) {
      const requestId = newId();
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          resolve(fail('TIMEOUT', 'The plugin did not answer in time'));
        }, timeoutMs);
        pending.set(requestId, {
          command: type,
          resolve: resolve as (result: Result<never>) => void,
          timer,
        });
        transport.post({
          protocolVersion: PROTOCOL_VERSION,
          type,
          requestId,
          runId,
          payload,
        });
      });
    },
    onContext(listener) {
      contextListeners.add(listener);
      return () => contextListeners.delete(listener);
    },
    dispose() {
      unsubscribe();
      for (const entry of pending.values()) clearTimeout(entry.timer);
      pending.clear();
      contextListeners.clear();
    },
  };
}
