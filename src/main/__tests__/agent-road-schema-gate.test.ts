/**
 * THE ROADS INTO `handleAgentRequest`, AND WHICH OF THEM A SCHEMA ACTUALLY GATES.
 *
 * `AgentRequest` is a TYPE. It is erased at compile, so nothing about it
 * survives to runtime, and the only thing standing between an automated caller
 * and the renderer's editing session is whatever each transport chooses to
 * parse. `core/agent/validation.ts` already says so out loud, twice —
 * `validateCollisionWritePlane` and `validateLayoutWritePlane` are both
 * documented as backstops "for any road that reaches the handler without
 * passing this schema", on the argument that the MCP road and the Aether road
 * both validate against `EDITOR_METHODS.params`.
 *
 * That argument was true of the Aether road and true of MOST of the MCP road.
 * This file is the census that says which, because the count is the part nobody
 * had.
 *
 * ═══ THE ROAD CENSUS, TAKEN WITH THE COMPILER RATHER THAN A GREP ═══
 *
 * Retyping `requestAgent`'s `payload` and `handleAgentRequest`'s `req` to a
 * `unique symbol` and running `npx tsc --noEmit -p tsconfig.json` names every
 * call site that hands either one a request. In production there are exactly
 * three, and they are one chain, not three doors:
 *
 *   mcp-server.ts:26   `forward`       — the MCP tools road
 *   mcp-server.ts:135  `aetherForward` — the Aether JSON-RPC road
 *   agent-handler.ts:142                — the IPC receiver both roads pour into
 *
 * ⚠ WHAT THAT INSTRUMENT IS BLIND TO, stated because a census that cannot say
 * what it missed is not a census: ten test call sites write
 * `handleAgentRequest(req as never)`, and `never` is assignable to everything,
 * so those files do not error and do not appear. The blindness is confined to
 * tests — no production call site casts — which is why the production answer
 * above is complete and the test-caller list from the same run is not.
 *
 * ═══ THE PROPERTY THIS FILE ASSERTS ═══
 *
 * For EVERY method in the registry, on EVERY road: what arrives at the bridge
 * must carry nothing the method's own schema did not declare. Written as a
 * property over `EDITOR_METHODS` rather than as a list of tools, so a method
 * added tomorrow is covered without anyone remembering this file — the same
 * rule `mcp-routes.test.ts` learned when its hand-copied route array was
 * replaced by express's own table.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createServer, request, type Server } from 'http';
import { AddressInfo } from 'net';
import { EDITOR_METHODS } from '../editor-methods';

/** Every payload handed to `requestAgent`, in call order. */
const captured: unknown[] = [];
vi.mock('../agent-bridge', () => ({
  requestAgent: (_win: unknown, payload: unknown) => {
    captured.push(payload);
    return Promise.resolve({ ok: true });
  },
}));

const { buildMcpApp } = await import('../mcp-server');

// ---------------------------------------------------------------------------
// Raw http.request, NOT fetch, and NOT the SDK client — for two separate
// reasons, both of which cost a run to find:
//
//  • Host is a forbidden header in fetch, so undici sets it from the URL and
//    the request arrives bearing `127.0.0.1:<ephemeral port>`. The transport's
//    own DNS-rebinding allow-list is built from `boundPort`, which only
//    `startMcpServer` ever sets, so under test it reads zero and every
//    ephemeral-port Host is refused with `Invalid Host header`. Sending
//    `Host: 127.0.0.1` (no port) matches `allowedHosts()`'s portless entry and
//    exercises the real route instead of bouncing off a test-only artifact.
//    mcp-routes.test.ts reaches for raw http.request for the neighbouring
//    reason, and this is the same lesson one layer down.
//  • The POST response is `text/event-stream`, so the JSON-RPC body arrives on
//    a `data:` line rather than as the whole entity.
// ---------------------------------------------------------------------------

let port = 0;

function post(path: string, body: unknown): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = request(
      {
        host: '127.0.0.1', port, path, method: 'POST',
        headers: {
          Host: '127.0.0.1',
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let text = '';
        res.on('data', (c) => { text += c; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

/** The JSON-RPC object out of an SSE or plain-JSON response body. */
function rpc(text: string): Record<string, unknown> {
  const line = text.split('\n').find((l) => l.startsWith('data:'));
  return JSON.parse(line ? line.slice(5).trim() : text);
}

const callMcp = (name: string, args: unknown) =>
  post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
    .then((r) => rpc(r.text));

const callAether = (name: string, params: unknown) =>
  post('/aether', { jsonrpc: '2.0', id: 1, method: `editor/${name}`, params })
    .then((r) => rpc(r.text));

beforeEach(() => { captured.length = 0; });

const app = buildMcpApp(() => ({ notARealWindow: true }) as never);
const srv: Server = await new Promise((r) => {
  const s = createServer(app).listen(0, '127.0.0.1', () => r(s));
});
port = (srv.address() as AddressInfo).port;

/**
 * Keys a payload for `m` is allowed to carry: `kind`, plus whatever the
 * method's own schema declares. Derived from the registry entry, never listed
 * by hand.
 */
function allowedKeys(m: (typeof EDITOR_METHODS)[number]): Set<string> {
  return new Set(['kind', ...Object.keys(m.params)]);
}

describe('every road into the agent handler carries only what a schema declared', () => {
  // A CONTROL FIRST. If this row cannot go red the loops below prove nothing:
  // it shows the harness actually observes the payload, and that an off-schema
  // key on a schema-BEARING method is dropped rather than forwarded.
  it('CONTROL: the harness sees the payload, and a declared method drops an undeclared key', async () => {
    await callMcp('get_tiles', { start: 0, count: 1, bogus: 'off-schema' });
    expect(captured.length, 'nothing reached the bridge: the harness is not observing').toBe(1);
    expect(Object.keys(captured[0] as object).sort()).toEqual(['count', 'kind', 'start']);
  });

  for (const m of EDITOR_METHODS) {
    it(`MCP road: ${m.name} forwards no undeclared key`, async () => {
      const res = await callMcp(m.name, {});
      // Either the schema refused (a gate doing its job — nothing forwarded),
      // or something was forwarded and it must be clean. Both are acceptable;
      // forwarding something dirty is not.
      if (captured.length === 0) {
        expect(JSON.stringify(res), `${m.name} forwarded nothing and reported no refusal`)
          .toMatch(/error|isError/i);
        return;
      }
      const payload = captured[0] as Record<string, unknown>;
      const extra = Object.keys(payload).filter((k) => !allowedKeys(m).has(k));
      expect(extra, `${m.name} forwarded keys no schema declared`).toEqual([]);
    });

    it(`MCP road: ${m.name} forwards something Electron IPC can serialise`, async () => {
      await callMcp(m.name, {});
      if (captured.length === 0) return;      // refused upstream; nothing to serialise
      // `webContents.send` serialises with the structured clone algorithm and
      // THROWS on a function. `structuredClone` is that same algorithm, so this
      // is the IPC hop's own rule applied one step early.
      expect(() => structuredClone(captured[0]), `${m.name}'s payload cannot cross the IPC hop`)
        .not.toThrow();
    });

    it(`Aether road: ${m.name} forwards no undeclared key`, async () => {
      const res = await callAether(m.name, {});
      if (captured.length === 0) {
        expect(JSON.stringify(res), `${m.name} forwarded nothing and reported no refusal`)
          .toMatch(/error/i);
        return;
      }
      const payload = captured[0] as Record<string, unknown>;
      const extra = Object.keys(payload).filter((k) => !allowedKeys(m).has(k));
      expect(extra, `${m.name} forwarded keys no schema declared`).toEqual([]);
    });
  }
});

/**
 * The advertised surface, which is the OTHER half of "every method has a
 * schema": a tool whose `inputSchema` the server does not register is one an
 * automated caller is never told the shape of. Asserted here because the fix
 * that closed the gate above works by registering a schema for all 57, and a
 * regression would show up here first — `tools/list` is what a client reads
 * before it ever calls anything.
 */
describe('the advertised MCP surface declares an input schema for every method', () => {
  it('tools/list gives all 57 an object inputSchema', async () => {
    const res = await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools = (rpc(res.text).result as { tools: Array<{ name: string; inputSchema?: { type?: string } }> }).tools;
    expect(tools.length).toBe(EDITOR_METHODS.length);
    for (const t of tools) {
      expect(t.inputSchema?.type, `${t.name} advertises no object input schema`).toBe('object');
    }
  });
});

/**
 * THE SEAT'S OWN QUESTION, PLANTED: send a value the schema refuses, down each
 * road, and assert WHICH gate refused it rather than merely that something did.
 *
 * `plane: "c"` is the exact value `validateCollisionWritePlane`'s docblock
 * records as having painted plane A and reported `{"painted":4}` on the
 * unguarded handler — a destructive edit aimed at a plane nobody named.
 */
describe('an off-schema value is refused on both roads, by a named gate', () => {
  const bad = { section: 0, plane: 'c', x: 0, y: 0, w: 1, h: 1, word: 0 };

  it('MCP road refuses it at the SDK input schema, before the bridge', async () => {
    const res = await callMcp('paint_collision', bad);
    expect(captured, 'an off-schema plane reached the bridge on the MCP road').toEqual([]);
    expect(JSON.stringify(res)).toMatch(/Input validation error/);
  });

  it('Aether road refuses it at the adapter safeParse, before the bridge', async () => {
    const res = await callAether('paint_collision', bad);
    expect(captured, 'an off-schema plane reached the bridge on the Aether road').toEqual([]);
    // ERR.INVALID_PARAMS, raised by adapter.ts's per-method safeParse — named,
    // not just "an error": the point of the row is which gate refused.
    expect(res.error).toMatchObject({ code: -32602, message: 'invalid params' });
  });
});
