/**
 * Aether envelope — the suite bus contract (megaforge/contract/protocol.md).
 * JSON-RPC 2.0: requests carry an `id`; notifications omit it; success uses
 * `result`, failure uses `error`. This is the message model; the editor binds
 * it over HTTP (POST request/response, SSE events) per §7.2. protocolVersion
 * bumps only on a breaking envelope change (D5).
 */
export const PROTOCOL_VERSION = 1;

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;     // absent → notification
  method: string;
  params?: unknown;
}
export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: number | string | null;
  result: unknown;
}
export interface JsonRpcError {
  jsonrpc: '2.0';
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}
export type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

/** Error codes (protocol §5). JSON-RPC reserved range + application range. */
export const ERR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  NOT_WIRED: -32000,
  UNSUPPORTED_VERSION: -32015,
} as const;

export const ok = (id: JsonRpcSuccess['id'], result: unknown): JsonRpcSuccess => ({ jsonrpc: '2.0', id, result });
export const err = (id: JsonRpcError['id'], code: number, message: string, data?: unknown): JsonRpcError =>
  ({ jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } });
