import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAetherStore, CONNECT_FAILED_PREFIX } from '../aetherStore';
import { useBusStore } from '../busStore';
import { useToastStore } from '../toastStore';
import type { AetherStatusPayload } from '../../../shared/ipc-types';

/**
 * UX SEAT B, FINDING F4 — "pressing the emulator status badge produces no
 * visible response at all" (docs/reviews/2026-09-07-lens-ux/uxb-audit.md).
 *
 * The seat pressed `Aether ◇ offline` and waited 5.5s; the before and after
 * captures were the same screen, down to the badge's computed colour. It
 * pressed a SECOND time because the first press had produced nothing a person
 * could see, and learned the connection had been refused only by reading the
 * button's `title` out of the DOM.
 *
 * ⚠ NO SOCKET IS TOUCHED BY THESE ROWS, and that is deliberate rather than
 * incidental: the badge is a door onto the Aether socket, and this machine has
 * a live server on that chain. `window.api.aetherConnect` is stubbed, so what
 * runs here is the store's own decision and nothing else. That also makes the
 * refusal REPRODUCIBLE — seat B needed two whole app sessions and a
 * 111-byte-path accident to provoke two different refusal texts.
 *
 * WHAT THESE ROWS HOLD, at the level the brief named: acting on a control must
 * produce a visible response. They do NOT hold anything about the wording of
 * the underlying refusal, which belongs to the main process — one of seat B's
 * two texts is excellent and the other is a raw Node errno, and choosing what
 * that should say is a separate call, parked.
 */

const OFFLINE: AetherStatusPayload = {
  status: 'disconnected', palette: false,
  error: 'Aether socket error: connect ENOENT /tmp/uxb-dead.sock',
};
const CONNECTED: AetherStatusPayload = {
  status: 'connected', palette: false, implementation: 'oracle-rs',
  serverBuild: 'test', socketPath: '/tmp/oracle.sock', methodCount: 40,
};

function stubConnect(payload: AetherStatusPayload): void {
  (globalThis as unknown as { window: { api: unknown } }).window = {
    api: { aetherConnect: vi.fn(async () => payload) },
  };
}

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
  useBusStore.setState({ status: 'offline' });
  useAetherStore.setState({ status: 'disconnected', palette: false, error: undefined });
});
afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
  useToastStore.setState({ toasts: [] });
});

describe('F4 · a refused connect produces a response a person can see', () => {
  /**
   * THE STATE BEHIND SEAT B'S TWO IDENTICAL SCREENSHOTS, asserted rather than
   * described. This row must stay GREEN: it is not a defect, it is the reason
   * the toast has to exist. The badge renders `status` verbatim when it is not
   * connected, so a refused connect walks offline → connecting → offline and
   * ends on character-for-character the label it started from.
   */
  it('the badge state is UNCHANGED across the refusal, which is why a toast is needed', async () => {
    stubConnect(OFFLINE);
    const before = useBusStore.getState().status;
    await useAetherStore.getState().connect();
    expect(useBusStore.getState().status).toBe(before);
    expect(before).toBe('offline');
  });

  it('so the refusal reaches the toast channel, carrying the producer reason verbatim', async () => {
    stubConnect(OFFLINE);
    await useAetherStore.getState().connect();
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toBe(`${CONNECT_FAILED_PREFIX}${OFFLINE.error}`);
    // RELAYED, NOT REWRITTEN: the producer's whole sentence survives. A store
    // that summarised it would drop the half a user can act on.
    expect(toasts[0].message).toContain('/tmp/uxb-dead.sock');
  });

  it("the OTHER refusal text seat B provoked reaches it identically", async () => {
    // Its 111-byte-path message is the good one, and it must not be truncated
    // or reworded on the way through either.
    // The offending path is stood in for rather than reproduced: seat B's real
    // one was under an agent session's scratchpad, and check-peer-path-literals
    // refuses those as executable lines — correctly, since a literal like that
    // stops existing when the session does. Nothing here depends on its shape.
    const long = 'Aether socket path is 111 bytes; a unix socket path must be under 104. '
      + 'Set ORACLE_SOCKET to something shorter. Path: <the offending path, verbatim>';
    stubConnect({ status: 'disconnected', palette: false, error: long });
    await useAetherStore.getState().connect();
    expect(useToastStore.getState().toasts[0].message).toBe(`${CONNECT_FAILED_PREFIX}${long}`);
  });

  /**
   * BLINDNESS IS SAID TO BE BLINDNESS. A refusal that arrives with no reason
   * still has to produce a response — the alternative is the silence this
   * finding is about — and it must not invent a plausible-looking cause.
   */
  it('a refusal with no reason still speaks, and says the reason is missing', async () => {
    stubConnect({ status: 'disconnected', palette: false });
    await useAetherStore.getState().connect();
    const msg = useToastStore.getState().toasts[0].message;
    expect(msg.startsWith(CONNECT_FAILED_PREFIX)).toBe(true);
    expect(msg).toContain('no reason');
  });

  /**
   * THE OTHER DIRECTION, without which this is not a rule. A SUCCESSFUL connect
   * already changes the badge visibly — its label becomes `connected · …` — so
   * it must not raise an error toast on top. A rule that fired every time would
   * be indistinguishable from a store that toasts unconditionally.
   */
  it('a SUCCESSFUL connect raises no toast, and does change the badge', async () => {
    stubConnect(CONNECTED);
    await useAetherStore.getState().connect();
    expect(useToastStore.getState().toasts).toEqual([]);
    expect(useBusStore.getState().status).toBe('connected');
    // ANTI-VACUOUS: the success payload really was applied, so "no toast" is
    // not the answer of a call that did nothing at all.
    expect(useAetherStore.getState().implementation).toBe('oracle-rs');
  });

  it('a SECOND refused press speaks again rather than going quiet', async () => {
    // Seat B pressed twice. The second press must not be the silent one.
    stubConnect(OFFLINE);
    await useAetherStore.getState().connect();
    await useAetherStore.getState().connect();
    expect(useToastStore.getState().toasts).toHaveLength(2);
  });
});
