/**
 * "The server does not serve this method" — as a condition of its own.
 *
 * WHY THIS EXISTS. The suite is cutting over from the legacy C++ Aether server
 * to the Rust core, and both resolve the SAME socket chain
 * (`$ORACLE_SOCKET` -> `$EXODUS_SOCKET` -> `$XDG_RUNTIME_DIR/oracle.sock` ->
 * `/tmp/oracle.sock`, see `socket-path.ts`). Aurora can therefore change which
 * implementation it is talking to with nothing in this codebase changing, and
 * the new server serves a SUBSET of the old surface — the rest gets built on
 * demand.
 *
 * Every call site in `src/main/aether` was written against exactly one failure
 * mode: a dead link, or a ROM with no symbols. Each one's comment documents
 * that reason, so a reader does not reconsider it. The cutover adds a THIRD
 * mode — *this method is not served here* — and treating it like the other two
 * turns a missing server feature into a defaulted value with a plausible story
 * attached ("release ROM, no symbols"). That is worse than a refusal: it is a
 * confident wrong answer, and the reader has a documented reason not to doubt
 * it.
 *
 * So: unserved is never a default. It is named, it carries the method, and it
 * says HOW it was detected — because the two routes are genuinely different
 * evidence:
 *
 *   'advertised-list' — `initialize` did not list the method. Cheap, happens
 *                       before anything touches the wire.
 *   'rpc-error'       — the server answered -32601. This is the case the list
 *                       cannot cover: a method can be ADVERTISED AND
 *                       UNIMPLEMENTED, and only the reply proves it.
 *
 * Both routes matter. A client that only checks the list trusts an advertisement
 * it has no way to audit; a client that only reads -32601 pays a round trip and
 * a pause window to learn something the handshake already said.
 */

import { ERR } from './protocol';

/**
 * The wording, in one place, so a test can match on a phrase that ONLY this
 * rule produces. Deliberately not "not found" (`adapter.ts` says that about
 * Aurora's own inbound surface) and not "no symbol" / "no method" (the gate
 * reasons in `warp.ts` and `push-palette.ts` are about the ROM, not the
 * server). A guard that matched a neighbouring rule's phrase would pass while
 * testing nothing.
 */
export const UNSERVED_PHRASE = 'does not serve the Aether method';

export type UnservedDetectedBy = 'advertised-list' | 'rpc-error';

export class MethodNotServedError extends Error {
  /**
   * The JSON-RPC code, kept on the object whichever route detected it, so a
   * caller inspecting `code` sees the same value for an advertisement gap and
   * for a -32601 reply. They are the same condition with different evidence.
   */
  readonly code: number = ERR.METHOD_NOT_FOUND;
  readonly method: string;
  readonly detectedBy: UnservedDetectedBy;
  readonly serverName?: string;
  readonly data?: unknown;

  constructor(
    method: string,
    detectedBy: UnservedDetectedBy,
    serverName?: string,
    data?: unknown,
  ) {
    super(
      `${serverName ?? 'the connected Aether server'} ${UNSERVED_PHRASE} ${method}` +
      ` (detected from the ${detectedBy})`,
    );
    this.name = 'MethodNotServedError';
    this.method = method;
    this.detectedBy = detectedBy;
    this.serverName = serverName;
    this.data = data;
  }
}

/**
 * `instanceof` alone is not enough: an error can cross a module-instance
 * boundary (vitest module graph, an electron-vite chunk split) and lose its
 * prototype identity while keeping its shape. The shape check is the fallback,
 * and it demands BOTH the code and a method name so a plain -32601 rejection
 * from somewhere else does not get mistaken for one of ours.
 */
export function isMethodNotServed(e: unknown): e is MethodNotServedError {
  if (e instanceof MethodNotServedError) return true;
  const c = e as { code?: unknown; method?: unknown } | null;
  return !!c && c.code === ERR.METHOD_NOT_FOUND && typeof c.method === 'string';
}

/** The method a failure names, or null when the failure is not an unserved one. */
export function unservedMethodOf(e: unknown): string | null {
  return isMethodNotServed(e) ? (e as MethodNotServedError).method : null;
}

/**
 * For the handful of places that cannot put the condition in their return value
 * — a resume inside a `finally`, whose result has already been computed. Those
 * still must not be silent: a `resume` the server cannot serve leaves the
 * machine stopped, and "the warp hung" is what the user sees.
 */
export function reportUnserved(context: string, e: unknown, log: (msg: string) => void = console.error): boolean {
  const method = unservedMethodOf(e);
  if (method === null) return false;
  log(`[aether] ${context}: ${(e as Error).message}`);
  return true;
}
