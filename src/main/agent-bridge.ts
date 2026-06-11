import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import {
  AGENT_REQUEST_CHANNEL, AGENT_RESPONSE_CHANNEL,
} from '../shared/agent-protocol';
import type { AgentRequest, AgentResponseEnvelope } from '../shared/agent-protocol';

const REQUEST_TIMEOUT_MS = 30_000;

let nextId = 1;
const pending = new Map<number, {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}>();

let listenerInstalled = false;

function installListener(): void {
  if (listenerInstalled) return;
  listenerInstalled = true;
  ipcMain.on(AGENT_RESPONSE_CHANNEL, (_event, envelope: AgentResponseEnvelope) => {
    const entry = pending.get(envelope.id);
    if (!entry) return;
    pending.delete(envelope.id);
    clearTimeout(entry.timer);
    if (envelope.ok) entry.resolve(envelope.result);
    else entry.reject(new Error(envelope.error ?? 'agent request failed'));
  });
}

/** Send a request to the renderer's agent handler and await its response. */
export function requestAgent(win: BrowserWindow, payload: AgentRequest): Promise<unknown> {
  installListener();
  if (win.isDestroyed() || win.webContents.isDestroyed()) {
    return Promise.reject(new Error('editor not ready (window closed)'));
  }
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`agent request timed out after ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    win.webContents.send(AGENT_REQUEST_CHANNEL, { id, payload });
  });
}
