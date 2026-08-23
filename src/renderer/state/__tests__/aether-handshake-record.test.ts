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
