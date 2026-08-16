import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, request, type Server } from 'http';
import { AddressInfo } from 'net';
import { buildMcpApp } from '../mcp-server';

/**
 * R13, planted against the REAL routing table.
 *
 * The finding was not that the guard was wrong — it was that `/mcp` did not
 * have it while `/aether` did, even though both dispatch the same
 * EDITOR_METHODS registry (open_project → edit_chunk → save_project, no
 * confirmation on save). A test of the middleware in isolation would have
 * passed throughout. This one drives the routes.
 *
 * Raw `http.request`, not `fetch`: Host is a forbidden header in fetch, so
 * undici silently drops it and every request arrives looking loopback —
 * a version of this test written with fetch passes with the guard removed.
 *
 * Planting the original defect (middleware off `/mcp`) fails the GET and DELETE
 * rows while POST still refuses — the transport's own rebinding protection
 * catches that one. Which is the argument for wearing both: neither layer
 * covers every route on its own.
 */
describe('the local HTTP surface refuses rebound requests', () => {
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    server = createServer(buildMcpApp(() => null));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => { server.close(() => resolve()); }));

  /** Status code only; the socket is dropped as soon as headers arrive (the SSE
   *  route would otherwise hold the response open forever). */
  function status(path: string, method: string, host?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const body = method === 'POST'
        ? JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
        : null;
      const req = request(
        {
          host: '127.0.0.1', port, path, method,
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            ...(host ? { host } : {}),
            ...(body ? { 'content-length': Buffer.byteLength(body) } : {}),
          },
        },
        (res) => { const code = res.statusCode ?? 0; res.destroy(); resolve(code); },
      );
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  const REBOUND = 'rebound.example.com';

  it.each([
    ['/mcp', 'POST'],
    ['/mcp', 'GET'],
    ['/mcp', 'DELETE'],
    ['/aether', 'POST'],
    ['/aether/events', 'GET'],
  ])('403s a rebound %s %s', async (path, method) => {
    expect(await status(path, method, REBOUND)).toBe(403);
  });

  it('a genuine loopback request is not refused', async () => {
    // No window is attached, so the call itself cannot succeed — the point is
    // only that the guard let it reach the route.
    expect(await status('/aether', 'POST')).not.toBe(403);
  });
});
