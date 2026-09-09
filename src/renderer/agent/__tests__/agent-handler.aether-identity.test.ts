// THE AGENT SURFACE HAD THE BADGE'S DEFECT TOO, one layer over.
//
// `aether_status` already read `implementation` rather than `serverName` — that
// ruling landed here before it reached the badge. What it still could not say
// is WHICH MACHINE answered. `implementation` names a LINEAGE (`oracle-rs`), so
// two emulators of the same build report the same string, and an agent driving
// the wrong one gets a perfectly healthy reply from a machine nobody is
// watching. `docs/OVERSEER.md` records that exact hazard: a session can
// silently change which implementation it is talking to with no config change
// and no signal, because the socket chain is the only arbiter.
//
// The socket path is not on the wire and does not need to be: Aurora's own main
// process resolved it. It now rides on the status payload, so it rides here.
//
// ⚠ THE ROWS ARE DIFFERENCES, NOT PRESENCES. A row asserting `socketPath` is
// non-null would pass on a handler that returned a constant, which is the shape
// of the defect being removed. The property with teeth is that two machines
// that agree on every other field produce two different replies.
//
// ⚠ WHAT A GREEN RESULT DOES NOT RULE OUT (bar 2e): that a real emulator sends
// what the fixture sends. No live bus is exercised here and none can be from
// this suite; `src/main/aether/__tests__/bridge-socket-path.test.ts` is the row
// that proves the main process fills the field in from the resolver.
//
// ⚠ AND ONE UNCOVERED SITE, STATED RATHER THAN LEFT TO BE FOUND. The same two
// fields were added to the `aether-connect` reply, and NOTHING HERE TESTS IT:
// that handler's only path runs the store's real `connect`/`disconnect`, which
// calls `window.api.aetherConnect` — main-process IPC that does not exist in a
// node suite. A row that drove it and asserted the rejection would prove
// nothing about the reply shape, so there is no row rather than a decorative
// one. Its fields are read off the same `useAetherStore` snapshot these rows
// exercise, and the compiler holds their names.
//
// Runner: `npx vitest run src/renderer/agent/__tests__/agent-handler.aether-identity.test.ts`
// (and inside `npm test`).

import { describe, it, expect, beforeEach } from 'vitest';
import { handleAgentRequest } from '../agent-handler';
import { useAetherStore } from '../../state/aetherStore';
import type { AetherStatusPayload } from '../../../shared/ipc-types';

interface AetherStatusReply {
  status: string;
  server: string | null;
  implementation: string | null;
  socketPath: string | null;
  identityWarning: string | null;
}

function machine(over: Partial<AetherStatusPayload> = {}): AetherStatusPayload {
  return {
    status: 'connected',
    serverName: 'oracle-next',
    implementation: 'oracle-rs',
    serverBuild: 'fb72abe (vcs)',
    socketPath: '/tmp/oracle.sock',
    palette: false,
    methodCount: 58,
    ...over,
  };
}

async function statusFor(payload: AetherStatusPayload): Promise<AetherStatusReply> {
  useAetherStore.getState().apply(payload);
  return await handleAgentRequest({ kind: 'aether-status' }) as unknown as AetherStatusReply;
}

beforeEach(() => {
  useAetherStore.setState({
    status: 'disconnected', palette: false, pushing: false,
    serverName: undefined, implementation: undefined, serverBuild: undefined,
    socketPath: undefined, identityWarning: undefined, methodCount: undefined,
    error: undefined,
  });
});

describe('aether_status says which machine answered', () => {
  it('reports two emulators of the same implementation differently', async () => {
    const a = await statusFor(machine({ socketPath: '/run/user/1000/oracle.sock' }));
    const b = await statusFor(machine({ socketPath: '/tmp/oracle.sock' }));

    // Anti-vacuous: both replies really describe a connected, identified server.
    expect(a.status).toBe('connected');
    expect(a.implementation).toBe('oracle-rs');
    // Everything an agent could previously read agrees between the two.
    expect(a.implementation).toBe(b.implementation);
    expect(a.server).toBe(b.server);
    // The discriminating field.
    expect(a.socketPath).not.toBe(b.socketPath);
    expect(a.socketPath).toBe('/run/user/1000/oracle.sock');
  });

  it('reports an absent socket as null rather than a plausible default', async () => {
    const s = await statusFor(machine({ socketPath: undefined }));
    expect(s.socketPath).toBeNull();
    expect(s.status).toBe('connected');            // anti-vacuous
  });

  it('passes the identity warning through instead of swallowing it', async () => {
    const warned = await statusFor(machine({
      implementation: 'oracle-zz',
      identityWarning: 'implementation "oracle-zz" is not in this build’s registry',
    }));
    expect(warned.identityWarning).toContain('oracle-zz');

    const clean = await statusFor(machine());
    expect(clean.identityWarning).toBeNull();
  });
});
