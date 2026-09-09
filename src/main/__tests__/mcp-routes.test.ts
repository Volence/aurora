import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, request, type Server } from 'http';
import { readFileSync } from 'fs';
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
 *
 * ═══ THE SENTENCE ABOVE USED TO BE HALF TRUE (MCP-ROUTE-CENSUS-HANDCOPIED) ═══
 *
 * "Planted against the REAL routing table" described the SERVER — a real
 * express app, real sockets — while the rows it drove came from a five-entry
 * array typed out by hand beneath it. Every route in that array was real; the
 * array was complete on the day it was written and still complete when the lens
 * read it. That is precisely the failure mode: a hand-copied census is correct
 * until someone adds a route, and the defect this file exists to catch IS
 * someone adding a route. A route missing from the array is a route the test
 * does not visit, so the array could only ever confirm what its author already
 * knew.
 *
 * The rows are now read off `app.router.stack` — express's own table, on the
 * very app object the server below is serving, not a second one built to look
 * like it. A new route is in the census the moment it is registered, and it
 * gets the rebound request whether or not anyone remembered this file.
 *
 * WHAT THAT DERIVATION CANNOT SEE, and why the guards under it are not padding:
 * a census can go wrong by coming back SMALLER than the truth, and a smaller
 * census is a shorter green run. `app.router.stack` yields a layer per
 * `exp.<verb>(...)` call and nothing for a sub-router mounted with
 * `exp.use('/path', router)`, whose own routes would be invisible here. So the
 * express table is cross-checked against a second, independent derivation —
 * the route registrations grepped out of `mcp-server.ts` itself — and the two
 * have to name the same set. Two derivations that disagree is the signal; one
 * derivation quietly returning fewer rows is not a signal at all.
 */

// The app is built ONCE and used for both jobs: the census is read off the same
// object the server serves, so the two cannot drift apart.
const app = buildMcpApp(() => null);

/** Every (path, METHOD) express will actually dispatch, read off its own table. */
function routeCensus(a: ReturnType<typeof buildMcpApp>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const stack = (a as unknown as { router?: { stack?: unknown[] } }).router?.stack ?? [];
  for (const layer of stack) {
    const route = (layer as { route?: { path: unknown; methods: Record<string, boolean> } }).route;
    if (!route) continue;
    for (const [method, on] of Object.entries(route.methods)) {
      if (on) out.push([String(route.path), method.toUpperCase()]);
    }
  }
  return out;
}

const CENSUS = routeCensus(app);
const key = ([p, m]: [string, string]) => `${m} ${p}`;

describe('the local HTTP surface refuses rebound requests', () => {
  let server: Server;
  let port = 0;

  beforeAll(async () => {
    server = createServer(app);
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

  // ── The census has to be able to be wrong before the rows below mean anything ──
  it('the route census came off express, is not empty, and is requestable', () => {
    expect(
      CENSUS.length,
      'the express route table yielded no routes at all. That is not a pass, it is a run that '
      + 'could not look: every row below would go green by never executing. Either buildMcpApp '
      + 'registered nothing, or express stopped exposing app.router.stack in the shape this '
      + 'census reads and the reader needs updating.',
    ).toBeGreaterThan(0);

    // A parameterised or pattern path cannot be turned into a request URL by
    // this file, and silently dropping it would shrink the census by exactly the
    // route somebody just added. Refuse instead.
    const unrequestable = CENSUS.filter(([p]) => !p.startsWith('/') || /[:*?+()[\]]/.test(p));
    expect(
      unrequestable.map(key),
      'these routes carry a pattern or parameter, so this file cannot synthesise a URL to visit '
      + 'them with. Give the census a concrete request path for each before the rows below can '
      + 'claim to cover them.',
    ).toEqual([]);
  });

  it('the express table and mcp-server.ts agree on the whole route set', () => {
    // The second, independent derivation. Its job is not to restate the first:
    // it is to catch the first coming back SHORT, which is the one failure a
    // derived census shares with the hand-copied array it replaced.
    const src = readFileSync(new URL('../mcp-server.ts', import.meta.url), 'utf8');

    const mounted = [...src.matchAll(/\bexp\.use\(\s*['"`]/g)];
    expect(
      mounted.length,
      'mcp-server.ts mounts something at a path with exp.use(). Routes inside a mounted router '
      + 'do not appear as route layers in app.router.stack, so the census above cannot see them '
      + 'and the rebound rows would silently skip the whole sub-tree. Teach routeCensus to '
      + 'descend before adding one.',
    ).toBe(0);

    const wildcard = [...src.matchAll(/\bexp\.all\(/g)];
    expect(
      wildcard.length,
      'mcp-server.ts registers a route with exp.all(), which names every verb at once and cannot '
      + 'be compared verb-by-verb against the source scan below. Extend this cross-check first.',
    ).toBe(0);

    const declared = [...src.matchAll(/\bexp\.(get|post|put|patch|delete|head|options)\(\s*'([^']+)'/g)]
      .map((m) => key([m[2], m[1].toUpperCase()]));

    expect(
      [...new Set(declared)].sort(),
      'the routes express reports and the routes written in mcp-server.ts are not the same set. '
      + 'Either a route is being registered somewhere this scan cannot see it, or the express '
      + 'census is coming back short. Do not relax this to make it pass: a census that under-'
      + 'reports is a shorter green run, which is the exact defect the hand-written array had.',
    ).toEqual([...new Set(CENSUS.map(key))].sort());
  });

  it.each(CENSUS)('403s a rebound %s %s', async (path, method) => {
    expect(await status(path, method, REBOUND)).toBe(403);
  });

  it('a genuine loopback request is not refused', async () => {
    // No window is attached, so the call itself cannot succeed — the point is
    // only that the guard let it reach the route.
    expect(await status('/aether', 'POST')).not.toBe(403);
  });
});
