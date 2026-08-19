import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { AetherClient } from '../client';
import type { AetherSocket } from '../client';

/**
 * A mock socket standing in for the unix stream. It records what the client
 * wrote (as parsed NDJSON lines) and lets a test push bytes back — including
 * split and coalesced chunks, which is the framing case a real socket produces
 * and a naive `JSON.parse(chunk)` fails on.
 */
class MockSocket extends EventEmitter implements AetherSocket {
  written: string[] = [];
  ended = false;
  write(s: string): void { this.written.push(s); }
  end(): void { this.ended = true; this.emit('close'); }
  destroy(): void { this.ended = true; this.emit('close'); }
  /** Parsed view of what the client sent. */
  sent(): Array<Record<string, unknown>> {
    return this.written.join('').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  }
  /** Push raw text as if it arrived from the server. */
  feed(s: string): void { this.emit('data', Buffer.from(s)); }
  /** Push one JSON-RPC message, newline-framed. */
  reply(msg: unknown): void { this.feed(JSON.stringify(msg) + '\n'); }
  open(): void { this.emit('connect'); }
}

const INIT_RESULT = {
  serverName: 'oracle-next',
  serverVersion: '0.1.0',
  protocolVersion: 1,
  running: false,
  methods: ['emulator/status', 'emulator/lookup_symbol', 'emulator/write_memory', 'emulator/reload_rom'],
  capabilities: { events: ['emulator/stopped', 'emulator/resumed', 'emulator/romReloaded'] },
};

/** Build a connected, handshaken client over a mock socket. */
async function connected(opts: { initResult?: Record<string, unknown> } = {}) {
  const sock = new MockSocket();
  const client = new AetherClient({ connect: () => sock, socketPath: '/tmp/test.sock' });
  const p = client.connect();
  sock.open();
  await vi.waitFor(() => expect(sock.sent().some((m) => m.method === 'initialize')).toBe(true));
  const initId = sock.sent().find((m) => m.method === 'initialize')!.id;
  sock.reply({ jsonrpc: '2.0', id: initId, result: opts.initResult ?? INIT_RESULT });
  await p;
  return { sock, client };
}

describe('AetherClient handshake', () => {
  it('sends initialize advertising events, THEN an initialized notification', async () => {
    const { sock } = await connected();
    const msgs = sock.sent();
    const init = msgs.find((m) => m.method === 'initialize')!;
    const done = msgs.find((m) => m.method === 'initialized')!;

    expect(init).toBeDefined();
    expect((init.params as Record<string, unknown>).protocolVersion).toBe(1);
    expect((init.params as { clientCapabilities: { events: boolean } }).clientCapabilities.events).toBe(true);

    // THE LOAD-BEARING PART. Subscription happens on `initialized`, not on
    // `initialize` (oracle-next session.rs:91 -> server.rs:550). A client that
    // sends only the first message gets a perfectly healthy connection that
    // silently never receives an event — it looks exactly like an unimplemented
    // server feature, and cost three probe rounds to diagnose that way.
    expect(done).toBeDefined();
    expect(done.id).toBeUndefined();                       // a notification, not a request
    expect(msgs.indexOf(init)).toBeLessThan(msgs.indexOf(done));
  });

  it('refuses a server on a different protocol version rather than half-speaking it', async () => {
    const sock = new MockSocket();
    const client = new AetherClient({ connect: () => sock, socketPath: '/tmp/test.sock' });
    const p = client.connect();
    sock.open();
    await vi.waitFor(() => expect(sock.sent().length).toBeGreaterThan(0));
    sock.reply({ jsonrpc: '2.0', id: sock.sent()[0].id, result: { ...INIT_RESULT, protocolVersion: 2 } });
    await expect(p).rejects.toThrow(/protocol/i);
    expect(client.status).toBe('disconnected');
  });
});

describe('AetherClient framing', () => {
  it('reads two messages arriving in one chunk', async () => {
    const { sock, client } = await connected();
    const a = client.call('emulator/status');
    const b = client.call('emulator/registers');
    const ids = sock.sent().filter((m) => String(m.method).startsWith('emulator/')).map((m) => m.id);
    sock.feed(
      JSON.stringify({ jsonrpc: '2.0', id: ids[0], result: { frame: 1 } }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', id: ids[1], result: { pc: '0x200' } }) + '\n',
    );
    expect(await a).toEqual({ frame: 1 });
    expect(await b).toEqual({ pc: '0x200' });
  });

  it('reads one message split across chunks', async () => {
    const { sock, client } = await connected();
    const a = client.call('emulator/status');
    const id = sock.sent().find((m) => m.method === 'emulator/status')!.id;
    const line = JSON.stringify({ jsonrpc: '2.0', id, result: { frame: 7 } }) + '\n';
    sock.feed(line.slice(0, 12));
    sock.feed(line.slice(12));
    expect(await a).toEqual({ frame: 7 });
  });
});

describe('AetherClient calls', () => {
  it('surfaces a JSON-RPC error as a rejection carrying the code', async () => {
    const { sock, client } = await connected();
    const p = client.call('emulator/write_cram', { line: 0 });
    const id = sock.sent().find((m) => m.method === 'emulator/write_cram')!.id;
    sock.reply({ jsonrpc: '2.0', id, error: { code: -32601, message: 'no such method: emulator/write_cram' } });
    await expect(p).rejects.toMatchObject({ code: -32601 });
  });

  it('rejects in-flight calls when the socket closes, instead of hanging forever', async () => {
    const { sock, client } = await connected();
    const p = client.call('emulator/status');
    sock.destroy();
    await expect(p).rejects.toThrow(/disconnect/i);
  });

  it('refuses a call while disconnected rather than throwing on undefined', async () => {
    const client = new AetherClient({ connect: () => new MockSocket(), socketPath: '/tmp/test.sock' });
    await expect(client.call('emulator/status')).rejects.toThrow(/not connected/i);
  });
});

describe('AetherClient feature detection', () => {
  it('answers hasMethod from the advertised list, never from a version guess', async () => {
    const { client } = await connected();
    expect(client.hasMethod('emulator/lookup_symbol')).toBe(true);
    // write_cram is schematized in the contract but not served today; the whole
    // point of feature-detecting is that it lights up by appearing here.
    expect(client.hasMethod('emulator/write_cram')).toBe(false);
  });

  it('reports no methods when disconnected instead of stale ones', async () => {
    const { sock, client } = await connected();
    expect(client.hasMethod('emulator/status')).toBe(true);
    sock.destroy();
    expect(client.hasMethod('emulator/status')).toBe(false);
  });
});

describe('AetherClient events', () => {
  it('delivers server notifications to subscribers', async () => {
    const { sock, client } = await connected();
    const seen: string[] = [];
    client.onEvent((method) => seen.push(method));
    sock.reply({ jsonrpc: '2.0', method: 'emulator/stopped', params: { frame: 12 } });
    sock.reply({ jsonrpc: '2.0', method: 'emulator/resumed', params: { frame: 12 } });
    expect(seen).toEqual(['emulator/stopped', 'emulator/resumed']);
  });
});

describe('AetherClient symbol resolution', () => {
  it('resolves through lookup_symbol and caches the answer', async () => {
    const { sock, client } = await connected();
    const p1 = client.resolve('Camera_X');
    const id = sock.sent().find((m) => m.method === 'emulator/lookup_symbol')!.id;
    // `name`, not `symbol` — lookup_symbol and write_memory disagree on the
    // spelling and the wrong one is an invalid_params, not a silent miss.
    expect((sock.sent().find((m) => m.method === 'emulator/lookup_symbol')!.params as { name: string }).name)
      .toBe('Camera_X');
    sock.reply({ jsonrpc: '2.0', id, result: { name: 'Camera_X', addr: '0x00FFA450', exact: true } });
    expect(await p1).toBe(0xFFA450);

    const before = sock.sent().filter((m) => m.method === 'emulator/lookup_symbol').length;
    expect(await client.resolve('Camera_X')).toBe(0xFFA450);
    expect(sock.sent().filter((m) => m.method === 'emulator/lookup_symbol').length).toBe(before);
  });

  it('refuses an inexact hit rather than warping to a nearby label', async () => {
    const { sock, client } = await connected();
    const p = client.resolve('Camera_X');
    const id = sock.sent().find((m) => m.method === 'emulator/lookup_symbol')!.id;
    // addr->symbol lookups return the nearest PRECEDING label plus a
    // displacement. Accepting one for a name lookup would silently target
    // whatever happens to sit before the symbol we asked for.
    sock.reply({ jsonrpc: '2.0', id, result: { name: 'Camera_Something', addr: '0x00FFA440', exact: false } });
    await expect(p).rejects.toThrow(/exact/i);
  });

  /**
   * Symbols provably move between builds (the documented +$24 incident, and
   * oracle-next's own note that s4.lst and s4.debug.lst disagree on 92.6% of
   * shared symbols). A cache that outlives the ROM is confidently wrong.
   */
  it('drops the cache on romReloaded', async () => {
    const { sock, client } = await connected();
    const p = client.resolve('Camera_X');
    const id1 = sock.sent().find((m) => m.method === 'emulator/lookup_symbol')!.id;
    sock.reply({ jsonrpc: '2.0', id: id1, result: { name: 'Camera_X', addr: '0x00FFA450', exact: true } });
    await p;

    sock.reply({ jsonrpc: '2.0', method: 'emulator/romReloaded', params: {} });

    const p2 = client.resolve('Camera_X');
    const lookups = sock.sent().filter((m) => m.method === 'emulator/lookup_symbol');
    expect(lookups.length).toBe(2);                        // asked again, did not trust the cache
    sock.reply({ jsonrpc: '2.0', id: lookups[1].id, result: { name: 'Camera_X', addr: '0x00FFA474', exact: true } });
    expect(await p2).toBe(0xFFA474);
  });

  /**
   * A symbol target cannot carry a displacement: `write_memory` SILENTLY
   * IGNORES `offset`/`disp` and writes to the base (verified against a live
   * server), and `Player_1+2` is not a symbol name. So the client resolves the
   * base and computes — still symbol-derived, never a literal address.
   */
  it('offers resolve+displacement as arithmetic, not as a server param', async () => {
    const { sock, client } = await connected();
    const p = client.resolveOffset('Player_1', 0x02);
    const id = sock.sent().find((m) => m.method === 'emulator/lookup_symbol')!.id;
    sock.reply({ jsonrpc: '2.0', id, result: { name: 'Player_1', addr: '0x00FF8D22', exact: true } });
    expect(await p).toBe(0xFF8D24);
  });
});

describe('AetherClient status notification', () => {
  /**
   * FOUND IN REAL USE, not by reasoning: the owner closed the emulator window
   * and Aurora's status bar kept saying "connected · oracle-next". The client
   * tore down correctly — it just had no way to tell anyone, and the UI only
   * ever heard about state it had asked for.
   */
  it('announces a disconnect nobody asked for', async () => {
    const { sock, client } = await connected();
    const seen: string[] = [];
    client.onStatusChange((s) => seen.push(s));
    sock.destroy();                       // the emulator went away
    expect(seen).toEqual(['disconnected']);
  });

  it('announces reaching connected', async () => {
    const sock = new MockSocket();
    const client = new AetherClient({ connect: () => sock, socketPath: '/tmp/test.sock' });
    const seen: string[] = [];
    client.onStatusChange((s) => seen.push(s));
    const p = client.connect();
    sock.open();
    await vi.waitFor(() => expect(sock.sent().some((m) => m.method === 'initialize')).toBe(true));
    sock.reply({ jsonrpc: '2.0', id: sock.sent()[0].id, result: INIT_RESULT });
    await p;
    expect(seen).toEqual(['connected']);
  });

  it('does not announce a second disconnect for an already-dead client', async () => {
    const { sock, client } = await connected();
    const seen: string[] = [];
    client.onStatusChange((s) => seen.push(s));
    sock.destroy();
    sock.destroy();
    client.disconnect();
    expect(seen).toEqual(['disconnected']);
  });

  it('unsubscribes cleanly', async () => {
    const { sock, client } = await connected();
    const seen: string[] = [];
    const off = client.onStatusChange((s) => seen.push(s));
    off();
    sock.destroy();
    expect(seen).toEqual([]);
  });
});
