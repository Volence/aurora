import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  identifyServer, describeBuild, SUPPORTED_IMPLEMENTATION, SUPERSEDED_IMPLEMENTATIONS,
} from '../server-identity';
import { AetherClient, type AetherSocket } from '../client';

/**
 * WHICH EMULATOR ANSWERED.
 *
 * The socket chain (`socket-path.ts`) resolves a path and never a server;
 * whoever holds it first answers. Before `server-identity.ts` Aurora recorded
 * `serverName` — which protocol.md §2.1 makes a *deployment* label and forbids
 * discriminating on, and which the Rust core still reports as `oracle-next` —
 * and then proceeded against literally anything that spoke the protocol.
 *
 * Every row below states which single rule it is the only witness for. That is
 * not ceremony: a refusal row that asserts only *that* something refused passes
 * just as green when a neighbouring gate (protocol-version mismatch, an
 * unadvertised method, a socket error) does the refusing. So each refusal row
 * matches a phrase ONLY this module emits, and the two refusal causes are
 * separated by fixtures that differ in exactly one field.
 */

const LIVE_BUILD = {
  // Measured off a running `oracle-aether` on 2026-08-31 — the real shape,
  // including the `+profile=…+target=…+features=` extension §2.1 requires when
  // build-time selection changes the served surface.
  id: 'fb72abeaab79c945b3bab5393991840b473036be+profile=release+target=x86_64-unknown-linux-gnu+features=',
  source: 'vcs',
  dirty: false,
};

const RS = { implementation: 'oracle-rs', serverBuild: LIVE_BUILD };

describe('identifyServer: the three verdicts, each on its own', () => {
  it('SUPPORTED: the Rust core is driven, and nothing about it is a refusal', () => {
    const id = identifyServer(RS);
    expect(id.verdict).toBe('supported');
    expect(id.refusal).toBeNull();
    expect(id.warning).toBeNull();
    expect(id.implementation).toBe(SUPPORTED_IMPLEMENTATION);
  });

  /**
   * ONLY WITNESS FOR: the superseded-lineage denylist. The fixture differs from
   * the supported one in `implementation` alone — same build, same everything —
   * so nothing else in the module can be what refused, and the message is
   * matched on the denylist's own reason rather than on "it threw".
   */
  it('SUPERSEDED: the legacy C++ core is refused, by name and with the reason', () => {
    const id = identifyServer({ ...RS, implementation: 'oracle-cpp' });
    expect(id.verdict).toBe('superseded');
    expect(id.refusal).toContain('oracle-cpp');
    expect(id.refusal).toContain(SUPERSEDED_IMPLEMENTATIONS['oracle-cpp']);
    // and it is NOT the unidentified message — the two refusals are distinct
    // conditions and a row that could not tell them apart would be satisfied
    // by either.
    expect(id.refusal).not.toContain('did not say WHICH');
  });

  /**
   * ONLY WITNESS FOR: absence itself being a refusal. This is the old
   * behaviour's exact input — a handshake with no `implementation` — and the
   * whole defect class in one fixture: proceeding here means Aurora cannot
   * distinguish the two cores and says nothing about it.
   */
  it('UNIDENTIFIED: no `implementation` at all is refused, not defaulted', () => {
    const id = identifyServer({ serverBuild: LIVE_BUILD });
    expect(id.verdict).toBe('unidentified');
    expect(id.implementation).toBeNull();
    expect(id.refusal).toContain('did not say WHICH');
    // The refusal names BOTH candidates, because "which emulator answered" is
    // only actionable if the reader is told what the alternatives were.
    expect(id.refusal).toContain('oracle-rs');
    expect(id.refusal).toContain('legacy C++');
  });

  it('UNIDENTIFIED covers a present-but-useless value, not just a missing key', () => {
    for (const bad of [null, '', 42, {}, []] as unknown[]) {
      expect(identifyServer({ implementation: bad }).verdict).toBe('unidentified');
    }
  });

  /**
   * ONLY WITNESS FOR: the denylist being a denylist. An allowlist would refuse
   * here, and refusing here is the failure mode the row was warned about — a
   * §2.1 registry amendment newer than this client is legitimate and must not
   * cost a session. Loud, and not fatal, is the whole point.
   */
  it('UNREGISTERED: a lineage this build has never heard of is LOUD, not fatal', () => {
    const id = identifyServer({ ...RS, implementation: 'oracle-zig' });
    expect(id.verdict).toBe('unregistered');
    expect(id.refusal).toBeNull();          // a future amendment is not an outage
    expect(id.warning).toContain('oracle-zig');
    expect(id.warning).toContain('amendment');
  });

  it('a supported server with no serverBuild warns rather than printing "(none)" silently', () => {
    const id = identifyServer({ implementation: 'oracle-rs' });
    expect(id.verdict).toBe('supported');
    expect(id.refusal).toBeNull();
    expect(id.warning).toContain('serverBuild');
  });
});

describe('what the identity is NOT allowed to depend on', () => {
  /**
   * THE RENAME CLAUSE, and the reason this module reads `implementation`
   * instead of the field the old comment called "a real discriminator today".
   * §2.1: `serverName` is a deployment label, two processes of one
   * implementation want distinguishable ones, and it MUST NOT discriminate.
   * Rename it to anything — including to the legacy server's own name — and
   * every verdict is byte-identical.
   */
  it('a deployment rename cannot change the verdict, because serverName is never read', () => {
    const base = identifyServer(RS);
    for (const name of ['oracle-next', 'oracle', 'oracle-rs', 'volences-box-2', '', undefined]) {
      const id = identifyServer({ ...RS, serverName: name } as Record<string, unknown>);
      expect(id).toEqual(base);
    }
  });

  /**
   * THE O26 DEFECT, ONE LEVEL UP, PROVEN ABSENT. `serverBuild.id` moves on a
   * documentation commit — it carries the revision plus profile, target and
   * feature selection. An equality check against a recorded id would reject
   * every correct binary but the one it was written against, which is exactly
   * the harness pin this parcel removed. Nothing here compares it.
   */
  it('a different serverBuild is still supported: the build id gates nothing', () => {
    const a = identifyServer(RS);
    const b = identifyServer({
      ...RS,
      serverBuild: { id: 'deadbeef+profile=debug+target=aarch64-apple-darwin+features=vgm', source: 'vcs', dirty: true },
    });
    expect(a.verdict).toBe('supported');
    expect(b.verdict).toBe('supported');
    expect(b.serverBuild!.id).not.toBe(a.serverBuild!.id);
    expect(b.refusal).toBeNull();
    expect(b.warning).toBeNull();
  });

  it('a dirty tree is recorded and rendered, never refused', () => {
    const id = identifyServer({ ...RS, serverBuild: { ...LIVE_BUILD, dirty: true } });
    expect(id.verdict).toBe('supported');
    expect(describeBuild(id.serverBuild)).toContain('DIRTY');
  });

  it('a malformed serverBuild degrades to "no build", not to a refusal', () => {
    for (const bad of [null, 'a-string', {}, { id: 42 }, { id: '' }] as unknown[]) {
      const id = identifyServer({ implementation: 'oracle-rs', serverBuild: bad });
      expect(id.verdict).toBe('supported');
      expect(id.serverBuild).toBeNull();
      expect(describeBuild(id.serverBuild)).toBe('(no serverBuild)');
    }
  });
});

// ---------------------------------------------------------------------------
// The client actually acts on it
// ---------------------------------------------------------------------------

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

async function handshake(init: Record<string, unknown>) {
  const sock = new MockSocket();
  const logged: string[] = [];
  const client = new AetherClient({
    connect: () => sock, socketPath: '/tmp/test.sock', log: (m) => logged.push(m),
  });
  const p = client.connect().then(() => null, (e: Error) => e);
  sock.open();
  await vi.waitFor(() => expect(sock.sent().some((m) => m.method === 'initialize')).toBe(true));
  sock.reply({ jsonrpc: '2.0', id: sock.sent()[0].id, result: init });
  return { sock, client, logged, err: await p };
}

const SERVED = {
  ...RS,
  serverName: 'oracle-next',
  serverVersion: '0.0.0',
  protocolVersion: 1,
  methods: ['emulator/status'],
};

describe('AetherClient acts on the identity', () => {
  it('records implementation and build on the handshake, and logs both once', async () => {
    const { client, logged, err } = await handshake(SERVED);
    expect(err).toBeNull();
    expect(client.status).toBe('connected');
    expect(client.handshake!.identity.implementation).toBe('oracle-rs');
    expect(client.handshake!.identity.serverBuild!.id).toBe(LIVE_BUILD.id);
    const line = logged.filter((l) => l.includes('handshake'));
    expect(line).toHaveLength(1);
    expect(line[0]).toContain('oracle-rs');
    expect(line[0]).toContain(LIVE_BUILD.id);
  });

  /**
   * ONLY WITNESS FOR: the refusal reaching the connection. The fixture is
   * otherwise a perfectly good server — correct protocol version, a served
   * method list — so no other gate in `connect()` has anything to object to,
   * and the error is matched on this module's own sentence rather than on the
   * fact that a promise rejected.
   */
  it('REFUSES to connect to a superseded implementation, in the identity check\'s own words', async () => {
    const { client, err } = await handshake({ ...SERVED, implementation: 'oracle-cpp' });
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain('oracle-cpp');
    expect(err!.message).toContain('Aurora drives "oracle-rs"');
    // and the link really is down — a refusal that left a usable client would
    // be a warning wearing a throw's costume.
    expect(client.status).toBe('disconnected');
    expect(client.handshake).toBeNull();
    expect(client.hasMethod('emulator/status')).toBe(false);
  });

  it('REFUSES a server that never said which implementation it is', async () => {
    const { implementation: _drop, ...anonymous } = SERVED;
    const { client, err } = await handshake(anonymous);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain('did not say WHICH implementation');
    expect(client.status).toBe('disconnected');
  });

  it('CONNECTS to an unregistered lineage but says so out loud', async () => {
    const { client, logged, err } = await handshake({ ...SERVED, implementation: 'oracle-zig' });
    expect(err).toBeNull();
    expect(client.status).toBe('connected');
    expect(client.handshake!.identity.verdict).toBe('unregistered');
    expect(logged.some((l) => l.includes('WARNING') && l.includes('oracle-zig'))).toBe(true);
  });
});
