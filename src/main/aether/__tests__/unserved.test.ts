import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { AetherClient, type AetherSocket } from '../client';
import { ERR } from '../protocol';
import { MethodNotServedError, UNSERVED_PHRASE, isMethodNotServed, unservedMethodOf } from '../unserved';

/**
 * "THE SERVER DOES NOT SERVE THIS" IS NOT "THE CALL FAILED".
 *
 * The suite is cutting over from the legacy C++ Aether server to the Rust core.
 * Both resolve the SAME socket chain, so Aurora can be swapped between them with
 * nothing in this codebase changing and no obvious signal — and the new server
 * serves a subset. These rows pin the two things that make that survivable: the
 * unserved condition is named rather than defaulted, and the handshake records
 * what answered it.
 *
 * Every expectation below derives from a fixture or an exported constant. There
 * is no copied number: the served-method COUNT is `FIXTURE.methods.length`, the
 * code is `ERR.METHOD_NOT_FOUND`, and the wording is `UNSERVED_PHRASE`.
 */

class MockSocket extends EventEmitter implements AetherSocket {
  written: string[] = [];
  write(s: string): void { this.written.push(s); }
  end(): void { this.emit('close'); }
  destroy(): void { this.emit('close'); }
  sent(): Array<Record<string, unknown>> {
    return this.written.join('').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  }
  reply(msg: unknown): void { this.emit('data', Buffer.from(JSON.stringify(msg) + '\n')); }
  open(): void { this.emit('connect'); }
}

/**
 * A DELIBERATELY PARTIAL server, which is the whole point: `emulator/status`
 * and `emulator/pause` are served, `emulator/write_cram` is not, and
 * `emulator/run_to` is ADVERTISED BUT UNIMPLEMENTED — the shape no advertised
 * list can catch.
 */
const FIXTURE = {
  serverName: 'oracle-next',
  serverVersion: '0.4.1',
  protocolVersion: 1,
  // REQUIRED by protocol.md §2.1, and the client now refuses a handshake
  // without it — a reply that omitted these described a server nobody ships.
  // Shapes measured off a live `oracle-aether` on 2026-08-31, not invented.
  implementation: 'oracle-rs',
  serverBuild: { id: 'fb72abe+profile=release', source: 'vcs', dirty: false },
  methods: ['emulator/status', 'emulator/pause', 'emulator/lookup_symbol', 'emulator/run_to'],
  capabilities: { events: ['emulator/stopped'] },
};
const UNADVERTISED = 'emulator/write_cram';
const ADVERTISED_BUT_UNIMPLEMENTED = 'emulator/run_to';

async function connected(init: Record<string, unknown> = FIXTURE) {
  const sock = new MockSocket();
  const logged: string[] = [];
  const client = new AetherClient({
    connect: () => sock, socketPath: '/tmp/test.sock', log: (m) => logged.push(m),
  });
  const p = client.connect();
  sock.open();
  await vi.waitFor(() => expect(sock.sent().some((m) => m.method === 'initialize')).toBe(true));
  sock.reply({ jsonrpc: '2.0', id: sock.sent()[0].id, result: init });
  await p;
  return { sock, client, logged };
}

describe('an unserved method is a named condition, not a failed call', () => {
  it('refuses an UNADVERTISED method before anything reaches the wire, and names it', async () => {
    const { sock, client } = await connected();
    // ANTI-VACUOUS: a client that never connected would reject everything with
    // "not connected", and this row would look identical. Prove the handshake
    // happened and the advertised list actually arrived.
    expect(client.status).toBe('connected');
    expect(client.servedMethodCount).toBe(FIXTURE.methods.length);

    const before = sock.written.length;
    // Raced, not awaited bare. A client that neither refuses NOR sends anything
    // leaves this promise pending forever, and an unraced `await` would report
    // that as a test timeout — true, but it would not say WHICH property broke.
    const e = await Promise.race([
      client.call(UNADVERTISED).then(() => 'RESOLVED' as const, (err: unknown) => err),
      new Promise<'NEVER-ANSWERED'>((r) => setTimeout(() => r('NEVER-ANSWERED'), 20)),
    ]);
    expect(e).not.toBe('NEVER-ANSWERED');
    expect(e).not.toBe('RESOLVED');

    expect(isMethodNotServed(e)).toBe(true);
    expect((e as MethodNotServedError).method).toBe(UNADVERTISED);
    expect((e as MethodNotServedError).detectedBy).toBe('advertised-list');
    expect((e as MethodNotServedError).code).toBe(ERR.METHOD_NOT_FOUND);
    expect((e as Error).message).toContain(UNSERVED_PHRASE);
    expect((e as Error).message).toContain(UNADVERTISED);
    // The load-bearing half of "before the wire": nothing was sent, so no
    // sequence got half-executed on a machine on the way to finding out.
    expect(sock.written.length).toBe(before);
  });

  it('names it from a -32601 reply too: a method can be ADVERTISED AND UNIMPLEMENTED', async () => {
    const { sock, client } = await connected();
    // The advertised list says this one is fine, so the pre-check passes and
    // ONLY the reply can prove otherwise. This is the route the list cannot
    // cover, and a client that checked the list alone would never see it.
    expect(client.hasMethod(ADVERTISED_BUT_UNIMPLEMENTED)).toBe(true);

    // Two calls IN FLIGHT at once, so the row proves the error is attributed to
    // the RIGHT method rather than to whichever call happened to be pending.
    const bad = client.call(ADVERTISED_BUT_UNIMPLEMENTED, { symbol: 'X' });
    const good = client.call('emulator/status');
    const badId = sock.sent().find((m) => m.method === ADVERTISED_BUT_UNIMPLEMENTED)!.id;
    const goodId = sock.sent().find((m) => m.method === 'emulator/status')!.id;

    sock.reply({ jsonrpc: '2.0', id: goodId, result: { frame: 3 } });
    sock.reply({
      jsonrpc: '2.0', id: badId,
      error: { code: ERR.METHOD_NOT_FOUND, message: `no such method: ${ADVERTISED_BUT_UNIMPLEMENTED}` },
    });

    expect(await good).toEqual({ frame: 3 });
    const e = await bad.then(() => { throw new Error('resolved'); }, (err: unknown) => err);
    expect(isMethodNotServed(e)).toBe(true);
    expect((e as MethodNotServedError).method).toBe(ADVERTISED_BUT_UNIMPLEMENTED);
    expect((e as MethodNotServedError).detectedBy).toBe('rpc-error');
    expect((e as Error).message).toContain(UNSERVED_PHRASE);
  });

  /**
   * THE NEIGHBOURING RULE. `warpTo`, `pushPlanned` and `runBuild` all branch on
   * `unservedMethodOf(e) !== null`, so an ordinary refusal leaking into that
   * branch would make every one of those guards fire for the wrong reason —
   * and each would still look green. An ordinary error must stay ordinary.
   */
  it('does NOT name an ordinary refusal as unserved, however it is worded', async () => {
    const { sock, client } = await connected();
    const p = client.call('emulator/pause');
    const id = sock.sent().find((m) => m.method === 'emulator/pause')!.id;
    sock.reply({
      jsonrpc: '2.0', id,
      // Wording chosen to be maximally confusable: it contains the word
      // "method" and names a method, and it must STILL not be unserved.
      error: { code: ERR.NOT_WIRED, message: 'the method emulator/pause is not wired to a machine' },
    });
    const e = await p.then(() => { throw new Error('resolved'); }, (err: unknown) => err);
    expect(isMethodNotServed(e)).toBe(false);
    expect(unservedMethodOf(e)).toBeNull();
    expect((e as { code: number }).code).toBe(ERR.NOT_WIRED);
  });

  it('treats a plain -32601 with no method name as NOT one of ours', () => {
    // `isMethodNotServed` demands both the code and a method, so a bare
    // -32601 from somewhere else cannot impersonate the condition and send a
    // call site down the wrong branch.
    expect(isMethodNotServed(Object.assign(new Error('x'), { code: ERR.METHOD_NOT_FOUND }))).toBe(false);
    expect(isMethodNotServed(new Error('x'))).toBe(false);
    expect(isMethodNotServed(null)).toBe(false);
  });
});

describe('the handshake records WHAT ANSWERED, not just that something did', () => {
  it('keeps the served-method set and its count, both derived from the reply', async () => {
    const { client } = await connected();
    expect(client.handshake).not.toBeNull();
    expect(client.handshake!.serverName).toBe(FIXTURE.serverName);
    expect(client.handshake!.serverVersion).toBe(FIXTURE.serverVersion);
    expect(client.handshake!.methods).toEqual(FIXTURE.methods);
    expect(client.handshake!.methodCount).toBe(FIXTURE.methods.length);
    expect(client.servedMethods()).toEqual(FIXTURE.methods);
  });

  /**
   * THE MOTIVATING CASE. The installed `oracle-aether` binary banners a
   * different method count from the source tree it was built from, so a client
   * that measured against either number would be wrong half the time. The count
   * has to come from the reply — which means a server advertising a DIFFERENT
   * number must produce a different record, with nothing in the client pinned.
   */
  it('reports the count the SERVER sent, not a number written down anywhere', async () => {
    const other = { ...FIXTURE, serverName: 'oracle', serverVersion: '2.1-linux', methods: ['emulator/status'] };
    const { client } = await connected(other);
    expect(client.handshake!.methodCount).toBe(other.methods.length);
    expect(client.handshake!.methodCount).not.toBe(FIXTURE.methods.length);
    // ⚠ THIS ROW USED TO ASSERT `serverName === 'oracle'` AND CALL IT "the
    // other discriminator the two implementations differ on". It is not one.
    // protocol.md §2.1 makes `serverName` a DEPLOYMENT label a config may set
    // and forbids discriminating on it — this very fixture proves the point,
    // renaming the deployment while the lineage is unchanged. The identity has
    // to survive that rename, and it does.
    expect(client.handshake!.serverName).toBe('oracle');
    expect(client.handshake!.identity.implementation).toBe('oracle-rs');
    expect(client.handshake!.identity.verdict).toBe('supported');
  });

  it('logs the handshake once, naming the server and the count', async () => {
    const { logged } = await connected();
    const lines = logged.filter((l) => l.includes('handshake'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(FIXTURE.serverName);
    expect(lines[0]).toContain(FIXTURE.serverVersion);
    expect(lines[0]).toContain(String(FIXTURE.methods.length));
  });

  /**
   * The two fields answer different questions and must not be collapsed.
   * `hasMethod` is "can I call this NOW" and has to go honest the instant the
   * link dies; `handshake` is "what was on the other end", and the moment you
   * most want it is after the emulator has gone.
   */
  it('drops live capabilities on teardown but KEEPS the record of what answered', async () => {
    const { sock, client } = await connected();
    expect(client.hasMethod('emulator/status')).toBe(true);
    sock.destroy();
    expect(client.status).toBe('disconnected');
    expect(client.hasMethod('emulator/status')).toBe(false);
    expect(client.servedMethodCount).toBe(0);
    expect(client.handshake!.methodCount).toBe(FIXTURE.methods.length);
    expect(client.handshake!.serverName).toBe(FIXTURE.serverName);
  });

  it('can still pre-check when the server advertised no list at all: by not pre-checking', async () => {
    // A server that sends no `methods` cannot be feature-detected. Refusing
    // everything would be a client bug dressed as a server gap, so `call` lets
    // it through and the -32601 route is what catches a real hole. Stated as a
    // row because it is a deliberate degradation, not an oversight.
    const { sock, client } = await connected({ ...FIXTURE, methods: undefined });
    expect(client.servedMethodCount).toBe(0);
    const p = client.call('emulator/anything');
    expect(sock.sent().some((m) => m.method === 'emulator/anything')).toBe(true);
    sock.reply({ jsonrpc: '2.0', id: sock.sent().at(-1)!.id, result: { ok: true } });
    expect(await p).toEqual({ ok: true });
  });
});

describe('requireMethod', () => {
  it('throws the named condition without touching the wire', async () => {
    const { sock, client } = await connected();
    const before = sock.written.length;
    expect(() => client.requireMethod(UNADVERTISED)).toThrow(UNSERVED_PHRASE);
    expect(() => client.requireMethod('emulator/status')).not.toThrow();
    expect(sock.written.length).toBe(before);
  });
});
