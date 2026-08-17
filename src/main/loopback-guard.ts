// The Host/Origin gate every local HTTP route in Aurora sits behind.
//
// WHY BINDING TO 127.0.0.1 IS NOT ENOUGH. The bind stops remote sockets. It
// does not stop a page the user is browsing from resolving its own hostname to
// 127.0.0.1 and POSTing here: to the browser that request is same-origin, so
// there is no CORS preflight to fail and no cross-origin rule to violate. The
// Host header (and the Origin, when a browser sends one) is what distinguishes
// "a tool on this machine typed the loopback address" from "a page was told
// this address resolves there".
//
// It lives in its own module, free of electron imports, for two reasons: every
// route must wear the SAME rule rather than a hand-copied variant, and the rule
// has to be executable by the node test suite — a guard nothing can plant a
// violation against is a guard nobody knows is working.

import type { Request, Response, NextFunction } from 'express';

/** 127.0.0.1, localhost, or ::1 — with or without a port. */
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\]|::1)(:\d+)?$/i;

/**
 * Is this request addressed to the loopback interface BY NAME?
 *
 * A missing Origin passes: non-browser clients (the MCP CLI, curl, the Aether
 * bus) do not send one, and they are the intended callers. A missing Host does
 * NOT pass — HTTP/1.1 requires it, so its absence is not a client Aurora
 * serves.
 */
export function isLoopbackRequest(host: string | undefined, origin: string | undefined): boolean {
  if (!LOOPBACK.test(host ?? '')) return false;
  if (origin === undefined) return true;
  return LOOPBACK.test(origin.replace(/^https?:\/\//, ''));
}

/** The same rule as express middleware. 403s with the protocol's own wording. */
export function loopbackOnly(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (!isLoopbackRequest(req.headers.host, typeof origin === 'string' ? origin : undefined)) {
    res.status(403).json({ error: 'loopback only (protocol D8)' });
    return;
  }
  next();
}
