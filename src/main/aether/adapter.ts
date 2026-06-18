import { z } from 'zod';
import type { ServerResponse } from 'http';
import { EDITOR_METHODS } from '../editor-methods';
import type { AgentRequest } from '../../shared/agent-protocol';
import {
  PROTOCOL_VERSION, ERR, ok, err,
  type JsonRpcRequest, type JsonRpcResponse,
} from './protocol';

/**
 * The Aether adapter: turns the editor's role-based `editor/*` capability
 * surface into a conformant Aether server (JSON-RPC 2.0 envelope, the
 * initialize/capability handshake, and a server-push event channel). The HTTP
 * binding (POST + SSE) lives in the editor server; this module is transport-
 * agnostic — it handles a parsed request object and returns a response object,
 * and owns the event-subscriber registry. See megaforge/contract/protocol.md.
 */

export type Forward = (payload: AgentRequest) => Promise<unknown>;

const SERVER_NAME = 'aurora';
const SERVER_VERSION = '0.1.0';

const byMethod = new Map(EDITOR_METHODS.map((m) => [`editor/${m.name}`, m]));
const schemaByMethod = new Map(EDITOR_METHODS.map((m) => [`editor/${m.name}`, z.object(m.params)]));

/** The events this server can push (advertised in `initialize`). */
export const EVENTS = ['editor/ready'] as const;

/** The self-describing surface returned by `initialize` (D4 — replaces list_ops). */
export function capabilities() {
  return {
    serverName: SERVER_NAME,
    serverVersion: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    capabilities: { events: EVENTS, editorMethods: true },
    methods: ['editor/ping', ...EDITOR_METHODS.map((m) => `editor/${m.name}`)],
  };
}

/**
 * Handle one JSON-RPC request. Returns a response object, or `null` for
 * notifications (no `id`) and for `initialized` (which expects no reply).
 */
export async function handleRequest(req: JsonRpcRequest, forward: Forward): Promise<JsonRpcResponse | null> {
  if (Array.isArray(req)) return err(null, ERR.INVALID_REQUEST, 'batches are not supported in this slice');
  if (!req || req.jsonrpc !== '2.0' || typeof req.method !== 'string') {
    return err((req && req.id) ?? null, ERR.INVALID_REQUEST, 'invalid request envelope');
  }
  const id = req.id ?? null;
  const isNotification = req.id === undefined;

  // Handshake.
  if (req.method === 'initialize') {
    const pv = (req.params as { protocolVersion?: number } | undefined)?.protocolVersion;
    if (pv != null && pv !== PROTOCOL_VERSION) {
      return err(id, ERR.UNSUPPORTED_VERSION, 'unsupported protocol version', { supported: [PROTOCOL_VERSION] });
    }
    return ok(id, capabilities());
  }
  if (req.method === 'initialized') return null;        // client→server notification
  if (req.method === 'editor/ping') return isNotification ? null : ok(id, { ok: true });

  // Method dispatch.
  const m = byMethod.get(req.method);
  if (!m) return isNotification ? null : err(id, ERR.METHOD_NOT_FOUND, `method not found: ${req.method}`);

  const parsed = schemaByMethod.get(req.method)!.safeParse(req.params ?? {});
  if (!parsed.success) {
    return isNotification ? null : err(id, ERR.INVALID_PARAMS, 'invalid params', { issues: parsed.error.issues });
  }

  try {
    const result = await forward({ kind: m.kind, ...parsed.data } as AgentRequest);
    return isNotification ? null : ok(id, result);
  } catch (e) {
    return isNotification ? null : err(id, ERR.INTERNAL, e instanceof Error ? e.message : String(e));
  }
}

// ---- event channel (SSE subscribers) ----

const subscribers = new Set<ServerResponse>();

/** Register an SSE connection; it begins receiving pushed notifications. */
export function addSubscriber(res: ServerResponse): void {
  subscribers.add(res);
}
export function removeSubscriber(res: ServerResponse): void {
  subscribers.delete(res);
}

/** Push a server-initiated notification to every subscribed connection. */
export function broadcast(method: string, params?: unknown): void {
  const line = `data: ${JSON.stringify({ jsonrpc: '2.0', method, params })}\n\n`;
  for (const res of subscribers) {
    try { res.write(line); } catch { subscribers.delete(res); }
  }
}
