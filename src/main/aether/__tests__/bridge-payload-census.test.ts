import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { IPC_CHANNELS, type AetherStatusPayload } from '../../../shared/ipc-types';
import type { AetherSocket } from '../client';

/**
 * A CENSUS OF THE STATUS PAYLOAD, TAKEN ON THE PUSH.
 *
 * ─── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * `bridge-socket-path.test.ts` holds `socketPath` (and, incidentally,
 * `implementation`) shut on the push, and its header explains the defect it was
 * written against: `publish()` calls `statusPayload()` with no argument, so
 * every push after the connect handler's own return carried `undefined` for a
 * field only the return supplied.
 *
 * That reasoning was never extended to the payload's OTHER fields, and a
 * plant-and-count audit measured the gap: replacing each of
 * `serverVersion`, `servedMethods`, `identityWarning` and `paletteUnservedMethod`
 * with a literal `undefined` in `statusPayload` left the whole suite green
 * (8198 passed), as did deleting the connect handler's
 * `paletteUnservedMethod = probe.unservedMethod` and the `paletteKind = null`
 * that a dead link depends on. Seven separate plants, seven green runs. See
 * `docs/reviews/2026-09-09-aether-client-plant-audit.md`.
 *
 * Each of those fields has a real consumer. `paletteUnservedMethod` is the one
 * that matters most: `src/renderer/agent/agent-handler.ts` turns it into the
 * sentence *"the connected Aether server does not serve X, so the live-palette
 * symbols were never looked up; this is a server gap, not a ROM problem"* —
 * and the whole reason that sentence exists is that WITHOUT it the artist is
 * told their ROM has no palette symbols and goes off to rebuild a ROM that was
 * never the problem. A value that is computed correctly and does not arrive
 * produces exactly the wrong sentence it was invented to prevent.
 *
 * ─── ONE ROW PER FIELD, ON PURPOSE ─────────────────────────────────────────
 *
 * A single row asserting "the payload is fully populated" would go red for any
 * of them and name none. These are separate so a failure says which field
 * stopped arriving.
 *
 * ─── HOW IT REACHES THE REAL BRIDGE ────────────────────────────────────────
 *
 * Same technique as `bridge-socket-path.test.ts`: `electron` and `node:net` are
 * stubbed, so the real handler, the real `AetherClient` and the real
 * `publish()` all run. The mock server here ROUTES requests and answers them on
 * a later tick, which is what lets the palette probe (several dependent
 * `lookup_symbol` round trips) run to completion inside one `await`.
 *
 * ─── WHAT A GREEN RESULT DOES NOT RULE OUT (bar 2e) ────────────────────────
 *
 * That a real oracle answers like this fixture. The handshake shape is copied
 * from `bridge-socket-path.test.ts`, which records it as measured off a live
 * `oracle-aether`; no live bus is reachable from a node-only suite.
 *
 * Runner: `npx vitest run src/main/aether/__tests__/bridge-payload-census.test.ts`
 * (and inside `npm test`).
 */

type Reply = { result: unknown } | { error: { code: number; message: string } };
type Router = (method: string, params: Record<string, unknown> | undefined) => Reply | null;

/**
 * A mock server rather than a mock socket. It answers each request as it is
 * written, on a later tick, so a sequence of DEPENDENT calls (the palette
 * probe) completes without the test pumping it by hand.
 */
class MockServer extends EventEmitter implements AetherSocket {
  written: string[] = [];
  constructor(private readonly route: Router) { super(); }
  write(s: string): void {
    this.written.push(s);
    for (const line of s.split('\n')) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line) as { id?: number; method: string; params?: Record<string, unknown> };
      if (msg.id === undefined) continue;                 // a notification wants no reply
      const r = this.route(msg.method, msg.params);
      if (r === null) continue;
      setImmediate(() => {
        this.emit('data', Buffer.from(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, ...r })}\n`));
      });
    }
  }
  end(): void { this.emit('close'); }
  destroy(): void { this.emit('close'); }
}

let sock: MockServer;

vi.mock('node:net', () => ({
  default: {
    connect: () => {
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

const SERVED = [
  'emulator/status', 'emulator/registers', 'emulator/lookup_symbol',
];

function initResult(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    serverName: 'oracle-next',
    serverVersion: '0.4.1',
    protocolVersion: 1,
    implementation: 'oracle-rs',
    serverBuild: { id: 'fb72abe+profile=release', source: 'vcs', dirty: false },
    methods: SERVED,
    capabilities: { events: ['emulator/stopped', 'emulator/resumed'] },
    ...over,
  };
}

let pushes: AetherStatusPayload[] = [];
const fakeWindow = {
  webContents: {
    send: (ch: string, payload: AetherStatusPayload) => {
      if (ch === IPC_CHANNELS.AETHER_STATUS) pushes.push(payload);
    },
  },
};

const savedOracleSocket = process.env.ORACLE_SOCKET;

/** Run the real connect handler to completion against a routed mock server. */
async function connect(route: Router): Promise<AetherStatusPayload> {
  process.env.ORACLE_SOCKET = '/tmp/aurora-census.sock';
  sock = new MockServer(route);
  pushes = [];
  const handler = handlers.get(IPC_CHANNELS.AETHER_CONNECT);
  if (handler === undefined) {
    throw new Error(
      `the bridge registered no handler for ${IPC_CHANNELS.AETHER_CONNECT}; `
      + 'this row is unmeasurable rather than passing',
    );
  }
  return await handler() as AetherStatusPayload;
}

/**
 * THE PAYLOAD THE DEFECT CLASS LIVES ON: the push a BUS EVENT triggers, after
 * the connect handler has returned.
 *
 * `bridge.ts` wires `c.onEvent(() => publish())`, so every `stopped`/`resumed`/
 * `romReloaded` the emulator emits rebuilds the renderer's whole status from
 * `statusPayload()` with NO argument. That is the payload the badge parcel
 * found carrying `undefined` where the connect handler's return had a value,
 * and it is where a field that "reaches the consumer once" stops reaching it.
 *
 * A row asserting over the pushes taken DURING connect would be asserting
 * something the design does not promise: the palette probe has not run yet at
 * the moment the link turns `connected`, so that push legitimately carries no
 * palette verdict. This asks the question the right way round — once the value
 * is known, does the NEXT push carry it?
 */
function pushAfterBusEvent(): AetherStatusPayload {
  pushes = [];
  sock.emit('data', Buffer.from(
    `${JSON.stringify({ jsonrpc: '2.0', method: 'emulator/stopped', params: {} })}\n`,
  ));
  // Anti-vacuous: the event really reached the bridge and really republished.
  expect(pushes.length).toBeGreaterThan(0);
  const p = pushes[pushes.length - 1];
  expect(p.status).toBe('connected');
  return p;
}

beforeEach(() => { registerAetherBridge(fakeWindow as never); });
afterEach(() => {
  resetAetherBridge();
  if (savedOracleSocket === undefined) delete process.env.ORACLE_SOCKET;
  else process.env.ORACLE_SOCKET = savedOracleSocket;
});

/**
 * The palette probe cannot RUN: `lookup_symbol` is advertised and answers
 * -32601 anyway (the advertised-and-unimplemented shape, which only a reply can
 * prove). Both probe arms therefore fail as UNSERVED — and the CLASSIC arm is
 * the one whose `unservedMethod` had no guard.
 */
const lookupUnimplemented: Router = (method) => {
  if (method === 'initialize') return { result: initResult() };
  if (method === 'emulator/lookup_symbol') {
    return { error: { code: -32601, message: 'method not found: emulator/lookup_symbol' } };
  }
  return { result: {} };
};

describe('every field the status payload promises arrives ON THE PUSH', () => {
  it('carries paletteUnservedMethod, so "never asked" cannot read as "no symbols in this ROM"', async () => {
    const returned = await connect(lookupUnimplemented);

    // Anti-vacuous: the handshake really completed and the probe really ran and
    // really failed for the SERVER's reason, not the ROM's.
    expect(returned.status).toBe('connected');
    expect(returned.palette).toBe(false);

    expect(returned.paletteUnservedMethod).toBe('emulator/lookup_symbol');
    expect(pushAfterBusEvent().paletteUnservedMethod).toBe('emulator/lookup_symbol');
  });

  /**
   * THE OTHER ARM, AND IT WAS THE UNGUARDED ONE.
   *
   * `probePalette` has two paths to `unservedMethod` and the audit found only
   * the aeon one held: dropping the field from the aeon arm was caught, and
   * dropping it from the CLASSIC arm left the suite green (P23 vs P24). The
   * arms are reached by different fixtures, so a row that lands on one says
   * nothing about the other — the row above cannot reach here at all, because
   * an unserved aeon arm returns before the classic arm is attempted.
   *
   * To get here the aeon arm must fail for a reason that is NOT unserved (this
   * listing simply has no `Pal_Base`), and the classic arm must then meet the
   * -32601. That is a real server: one that lost `lookup_symbol` between the
   * two probes is not, so the fixture answers `Pal_Base` honestly and refuses
   * the classic names.
   */
  it('carries paletteUnservedMethod from the CLASSIC probe arm too', async () => {
    const returned = await connect((method, params) => {
      if (method === 'initialize') return { result: initResult() };
      if (method === 'emulator/lookup_symbol') {
        // The lookup RAN and found nothing: not an aeon listing, try classic.
        if (params?.name === 'Pal_Base') return { result: {} };
        return { error: { code: -32601, message: 'method not found' } };
      }
      return { result: {} };
    });

    expect(returned.palette).toBe(false);
    expect(returned.paletteUnservedMethod).toBe('emulator/lookup_symbol');
    expect(pushAfterBusEvent().paletteUnservedMethod).toBe('emulator/lookup_symbol');
  });

  it('carries the server version', async () => {
    const returned = await connect(lookupUnimplemented);
    expect(returned.serverVersion).toBe('0.4.1');
    expect(pushAfterBusEvent().serverVersion).toBe('0.4.1');
  });

  it('carries the advertised method list and the count measured at the wire', async () => {
    const returned = await connect(lookupUnimplemented);
    expect(returned.servedMethods).toEqual(SERVED);
    expect(returned.methodCount).toBe(SERVED.length);
    const p = pushAfterBusEvent();
    expect(p.servedMethods).toEqual(SERVED);
    expect(p.methodCount).toBe(SERVED.length);
  });

  /**
   * An unregistered lineage is LOUD, NOT FATAL (`server-identity.ts`), and the
   * loudness is the whole point: a warning nobody can see is the silence that
   * module was written to replace.
   */
  it('carries the identity warning for a lineage this build does not know', async () => {
    const returned = await connect((method) => {
      if (method === 'initialize') return { result: initResult({ implementation: 'oracle-zig' }) };
      if (method === 'emulator/lookup_symbol') {
        return { error: { code: -32601, message: 'method not found' } };
      }
      return { result: {} };
    });

    expect(returned.implementation).toBe('oracle-zig');   // anti-vacuous: it did proceed
    expect(returned.identityWarning).toMatch(/oracle-zig/);
    expect(pushAfterBusEvent().identityWarning).toMatch(/oracle-zig/);
  });
});

/**
 * THE LINK CAN DIE WITH NOBODY ASKING — the emulator window is closed, the
 * process is killed. `client.ts` clears its method set on teardown for exactly
 * this reason ("a stale capability is a lie"), and the bridge owes the palette
 * capability the same courtesy: `paletteKind` outliving the link means the
 * payload keeps advertising a live-palette control for a machine that is gone.
 *
 * This goes through the SOCKET dying rather than the disconnect IPC handler,
 * because the handler clears `paletteKind` itself — a row that used it would
 * pass with the teardown path completely unguarded.
 */
describe('a link that dies on its own takes the palette capability with it', () => {
  it('stops claiming a palette family once the socket is gone', async () => {
    const returned = await connect((method, params) => {
      if (method === 'initialize') return { result: initResult() };
      if (method === 'emulator/lookup_symbol') {
        const name = params?.name;
        // aeon's pair resolves, so the probe genuinely finds a family.
        if (name === 'Pal_Base') return { result: { addr: 'FF8AD2', exact: true } };
        if (name === 'Pal_Base_Dirty') return { result: { addr: 'FF8CA7', exact: true } };
        return { error: { code: -32601, message: 'method not found' } };
      }
      return { result: {} };
    });

    // Anti-vacuous: there IS a capability to go stale.
    expect(returned.palette).toBe(true);
    expect(returned.paletteKind).toBe('aeon');

    pushes = [];
    sock.destroy();                       // the emulator window closes
    await vi.waitFor(() => expect(pushes.length).toBeGreaterThan(0));

    const last = pushes[pushes.length - 1];
    expect(last.status).toBe('disconnected');
    expect(last.palette).toBe(false);
    expect(last.paletteKind).toBeUndefined();
  });
});
