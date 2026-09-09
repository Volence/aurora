import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { IPC_CHANNELS, type AetherStatusPayload } from '../../../shared/ipc-types';
import type { AetherSocket } from '../client';

/**
 * WHICH MACHINE ANSWERED HAS TO REACH THE RENDERER ON EVERY PUSH, NOT ON TWO
 * PAYLOADS OUT OF EVERY DOZEN.
 *
 * `implementation` names a LINEAGE: two emulators of the same build both report
 * `oracle-rs`, so the only field that separates one running server from another
 * is the unix path the client dialled (`docs/OVERSEER.md`: the socket chain is
 * the only arbiter). It is not on the wire — `initialize` never mentions it —
 * but it does not have to be, because THIS process resolved it.
 *
 * ─── THE DEFECT THIS ROW HOLDS SHUT ────────────────────────────────────────
 *
 * `statusPayload` took the path as an argument, and the only two callers that
 * passed one were the return values of the connect and disconnect IPC handlers.
 * `publish()` — the push every status change travels on, including every
 * `stopped`/`resumed` the emulator emits — called it with nothing. So a badge
 * that displayed the path would have shown it once, at connect, and watched it
 * vanish at the first bus event, which reads exactly like "Aurora forgot which
 * emulator it is attached to". A row that only checked the CONNECT RETURN would
 * have gone green on that, so this row reads the PUSH.
 *
 * ─── HOW IT REACHES THE REAL BRIDGE ────────────────────────────────────────
 *
 * `electron` is stubbed to a recording `ipcMain` (the same technique as
 * `bridge-probe.test.ts`) and `node:net` to a mock stream, so the real handler
 * runs, the real `AetherClient` completes a real handshake over framed NDJSON,
 * and the real `publish()` fires at a fake window that records what it sent.
 * Nothing here is a reimplementation of the bridge.
 *
 * ─── WHAT A GREEN RESULT DOES NOT RULE OUT (bar 2e) ────────────────────────
 *
 * That a real oracle behaves like the fixture. The handshake shape is copied
 * from `client.test.ts`, which records it as measured off a live
 * `oracle-aether`; no live bus is exercised here and none can be from this
 * suite.
 *
 * Runner: `npx vitest run src/main/aether/__tests__/bridge-socket-path.test.ts`
 * (and inside `npm test`).
 */

/** Mock unix stream. Same shape as the one in `client.test.ts`. */
class MockSocket extends EventEmitter implements AetherSocket {
  written: string[] = [];
  write(s: string): void { this.written.push(s); }
  end(): void { this.emit('close'); }
  destroy(): void { this.emit('close'); }
  sent(): Array<Record<string, unknown>> {
    return this.written.join('').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, unknown>);
  }
  reply(msg: unknown): void { this.emit('data', Buffer.from(`${JSON.stringify(msg)}\n`)); }
}

let sock: MockSocket;
/** The path `net.connect` was actually handed, so a row can prove the resolver ran. */
let dialled: string | null = null;

vi.mock('node:net', () => ({
  default: {
    connect: (path: string) => {
      dialled = path;
      // A real `net.connect` emits `connect` on a later tick; the client waits
      // for it, so a mock that never emits would hang the handshake.
      setImmediate(() => { sock.emit('connect'); });
      return sock;
    },
  },
}));

const handlers = new Map<string, (...a: unknown[]) => unknown>();
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: (...a: unknown[]) => unknown) => { handlers.set(ch, fn); } },
}));

const { registerAetherBridge, resetAetherBridge } = await import('../bridge');

/**
 * `lookup_symbol` is deliberately NOT advertised: the palette probe then
 * refuses before it reaches the wire, so this fixture needs to answer exactly
 * one request. `implementation` and `serverBuild` are required by §2.1 and the
 * client refuses a handshake without them.
 */
const INIT_RESULT = {
  serverName: 'oracle-next',
  serverVersion: '0.4.1',
  protocolVersion: 1,
  implementation: 'oracle-rs',
  serverBuild: { id: 'fb72abe+profile=release', source: 'vcs', dirty: false },
  methods: ['emulator/status', 'emulator/registers'],
  capabilities: { events: ['emulator/stopped', 'emulator/resumed'] },
};

/** Everything the bridge pushed to the renderer, in order. */
let pushes: AetherStatusPayload[] = [];
const fakeWindow = {
  webContents: {
    send: (ch: string, payload: AetherStatusPayload) => {
      if (ch === IPC_CHANNELS.AETHER_STATUS) pushes.push(payload);
    },
  },
};

const savedOracleSocket = process.env.ORACLE_SOCKET;

/** Run the real connect handler to completion against the mock server. */
async function connectVia(socketPath: string): Promise<AetherStatusPayload> {
  process.env.ORACLE_SOCKET = socketPath;
  sock = new MockSocket();
  dialled = null;
  pushes = [];
  const handler = handlers.get(IPC_CHANNELS.AETHER_CONNECT);
  if (handler === undefined) {
    throw new Error(
      `the bridge registered no handler for ${IPC_CHANNELS.AETHER_CONNECT}; `
      + 'this row is unmeasurable rather than passing',
    );
  }
  const p = handler() as Promise<AetherStatusPayload>;
  await vi.waitFor(() => expect(sock.sent().some((m) => m.method === 'initialize')).toBe(true));
  const init = sock.sent().find((m) => m.method === 'initialize');
  sock.reply({ jsonrpc: '2.0', id: init?.id, result: INIT_RESULT });
  return p;
}

beforeEach(() => {
  registerAetherBridge(fakeWindow as never);
});

afterEach(() => {
  resetAetherBridge();
  if (savedOracleSocket === undefined) delete process.env.ORACLE_SOCKET;
  else process.env.ORACLE_SOCKET = savedOracleSocket;
});

describe('the status payload carries the socket it dialled', () => {
  it('puts the resolved path on the connect handler’s return AND on the push', async () => {
    const returned = await connectVia('/tmp/aurora-bridge-a.sock');

    // Anti-vacuous: the resolver really ran and the handshake really completed.
    expect(dialled).toBe('/tmp/aurora-bridge-a.sock');
    expect(returned.status).toBe('connected');
    expect(returned.implementation).toBe('oracle-rs');

    expect(returned.socketPath).toBe('/tmp/aurora-bridge-a.sock');

    // THE ROW THAT MATTERS. `publish()` passes no argument, so this is the
    // fallback to the live client's own path, and it is the payload every
    // renderer state after the first is built from.
    const connectedPush = pushes.filter((p) => p.status === 'connected');
    expect(connectedPush.length).toBeGreaterThan(0);
    for (const p of connectedPush) expect(p.socketPath).toBe('/tmp/aurora-bridge-a.sock');
  });

  /**
   * THE DISCRIMINATING FORM. Two emulators of the same implementation must
   * produce two different payloads, or nothing downstream can tell them apart
   * however carefully the badge is written.
   */
  it('reports two different machines differently, on a field that is not implementation', async () => {
    const a = await connectVia('/tmp/aurora-bridge-a.sock');
    resetAetherBridge();
    const b = await connectVia('/run/aurora-bridge-b.sock');

    expect(a.implementation).toBe(b.implementation);          // same software
    expect(a.serverName).toBe(b.serverName);                  // and the same stale label
    expect(a.socketPath).not.toBe(b.socketPath);              // different machine
    expect(b.socketPath).toBe('/run/aurora-bridge-b.sock');
  });

  it('reports no socket at all once the link is deliberately torn down', async () => {
    await connectVia('/tmp/aurora-bridge-a.sock');
    const handler = handlers.get(IPC_CHANNELS.AETHER_DISCONNECT);
    if (handler === undefined) throw new Error('the bridge registered no disconnect handler');
    const after = await handler() as AetherStatusPayload;

    expect(after.status).toBe('disconnected');
    // Absent, not a stale path that would claim a machine is still answering.
    expect(after.socketPath).toBeUndefined();
  });
});
