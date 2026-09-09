import { describe, it, expect, beforeEach } from 'vitest';
import { useAetherStore } from '../aetherStore';
import type { AetherStatusPayload } from '../../../shared/ipc-types';

/**
 * THE RECORD HAS TO REACH SOMETHING THAT CAN SAY IT.
 *
 * The main process learns which server answered `initialize`, but the only
 * surfaces a person or an agent actually reads are the store and the agent
 * handler. A field that stops at the IPC boundary is a field nobody sees, and
 * the entire point of recording it is that a server swap becomes noticeable
 * instead of presenting as Aurora being broken.
 */

const PAYLOAD: AetherStatusPayload = {
  status: 'connected',
  serverName: 'oracle-next',
  serverVersion: '0.4.1',
  palette: false,
  methodCount: 40,
  servedMethods: ['emulator/status', 'emulator/pause'],
};

beforeEach(() => {
  useAetherStore.setState({
    status: 'disconnected', palette: false, pushing: false,
    serverName: undefined, serverVersion: undefined, methodCount: undefined,
    servedMethods: undefined, paletteUnservedMethod: undefined, paletteKind: undefined,
    implementation: undefined, serverBuild: undefined, socketPath: undefined,
    identityWarning: undefined,
  });
});

describe('the aether store carries what answered the handshake', () => {
  it('keeps the served-method count and list rather than dropping them at the boundary', () => {
    useAetherStore.getState().apply(PAYLOAD);
    const s = useAetherStore.getState();
    // ANTI-VACUOUS: the payload was actually applied, not silently ignored.
    expect(s.status).toBe('connected');
    expect(s.serverName).toBe(PAYLOAD.serverName);
    expect(s.methodCount).toBe(PAYLOAD.methodCount);
    expect(s.servedMethods).toEqual(PAYLOAD.servedMethods);
  });

  /**
   * A DIFFERENT SERVER MUST READ DIFFERENTLY. Both implementations answer the
   * same socket, so the store has to reflect whichever one is on the other end
   * — including after a reconnect to the other.
   */
  it('replaces the record when a different server answers', () => {
    useAetherStore.getState().apply(PAYLOAD);
    useAetherStore.getState().apply({
      ...PAYLOAD, serverName: 'oracle', serverVersion: '2.1-linux', methodCount: 58,
      servedMethods: ['emulator/status'],
    });
    const s = useAetherStore.getState();
    expect(s.serverName).toBe('oracle');
    expect(s.methodCount).toBe(58);
    expect(s.methodCount).not.toBe(PAYLOAD.methodCount);
    expect(s.servedMethods).toEqual(['emulator/status']);
  });

  /**
   * WHICH MACHINE, not just which software. `implementation` names a lineage,
   * so two Aurora windows on two separate `oracle-rs` emulators agree on every
   * other field in this payload; the socket the main process dialled is the
   * only one that differs. It used to stop at the IPC boundary — the store had
   * no slot for it and nothing under `src/renderer/` mentioned it — which made
   * the two windows indistinguishable by construction, however the badge was
   * written.
   */
  it('keeps the socket path, which is the only field two identical servers differ on', () => {
    useAetherStore.getState().apply({ ...PAYLOAD, socketPath: '/run/user/1000/oracle.sock' });
    expect(useAetherStore.getState().socketPath).toBe('/run/user/1000/oracle.sock');

    // A SECOND MACHINE READS DIFFERENTLY. Same implementation, same deployment
    // label, same method count: if this row passed on presence alone it would
    // pass on a store that pinned the first path forever.
    useAetherStore.getState().apply({ ...PAYLOAD, socketPath: '/tmp/oracle.sock' });
    expect(useAetherStore.getState().socketPath).toBe('/tmp/oracle.sock');

    // And an absent path is absent, never the last one seen.
    useAetherStore.getState().apply(PAYLOAD);
    expect(useAetherStore.getState().socketPath).toBeUndefined();
  });

  it('carries the palette probe’s server gap, which `palette: false` alone cannot express', () => {
    // Two very different situations both arrive as `palette: false`: a stripped
    // ROM, and a server that cannot look symbols up at all. Only one of them is
    // the artist’s ROM to fix, so the store must keep them apart.
    useAetherStore.getState().apply({ ...PAYLOAD, paletteUnservedMethod: 'emulator/lookup_symbol' });
    expect(useAetherStore.getState().palette).toBe(false);
    expect(useAetherStore.getState().paletteUnservedMethod).toBe('emulator/lookup_symbol');

    useAetherStore.getState().apply(PAYLOAD);
    expect(useAetherStore.getState().palette).toBe(false);
    expect(useAetherStore.getState().paletteUnservedMethod).toBeUndefined();
  });
});
