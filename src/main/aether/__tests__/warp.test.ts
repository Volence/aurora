import { describe, it, expect } from 'vitest';
import { warpTo, WarpGateReason, WARP_SYMBOLS } from '../warp';
import { MethodNotServedError } from '../unserved';

function fakeClient(opts: {
  symbols?: Record<string, number>;
  /** Frames of flag==1 before the engine "consumes" it. */
  ackAfter?: number;
  /** What the engine publishes back as the clamped destination. */
  clampTo?: { x: number; y: number };
  connected?: boolean;
  /** Whether the machine was running when the warp arrived. */
  wasRunning?: boolean;
  /** Methods this server does NOT serve — dropped from the advertised list. */
  unserved?: string[];
} = {}) {
  const symbols = opts.symbols ?? { Warp_Req_X: 0xffe502, Warp_Req_Y: 0xffe504, Warp_Req_Flag: 0xffe506 };
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  let flag = 0;
  let polls = 0;
  let written = { x: 0, y: 0 };
  const ackAfter = opts.ackAfter ?? 1;
  const wasRunning = opts.wasRunning ?? true;
  return {
    calls,
    status: opts.connected === false ? 'disconnected' : 'connected',
    server: { name: 'oracle-next' },
    hasMethod: (m: string) => !(opts.unserved ?? []).includes(m),
    resolve: async (name: string) => {
      if ((opts.unserved ?? []).includes('emulator/lookup_symbol')) {
        throw new MethodNotServedError('emulator/lookup_symbol', 'advertised-list', 'oracle-next');
      }
      const a = symbols[name];
      if (a === undefined) throw new Error(`no symbol named ${name}`);
      return a;
    },
    call: async (method: string, params: Record<string, unknown>) => {
      calls.push({ method, params });
      // A real client REJECTS an unadvertised method rather than answering it.
      // Without this the fake would serve a method it claims not to have, and
      // any row about the unserved path would be testing the fake.
      if ((opts.unserved ?? []).includes(method)) {
        throw new MethodNotServedError(method, 'advertised-list', 'oracle-next');
      }
      if (method === 'emulator/pause') return { wasRunning };
      if (method === 'emulator/write_memory') {
        const addr = Number.parseInt(String(params.addr), 16);
        const bytes = String(params.bytes).replace(/^0x/, '');
        if (addr === symbols.Warp_Req_X) written.x = Number.parseInt(bytes, 16);
        if (addr === symbols.Warp_Req_Y) written.y = Number.parseInt(bytes, 16);
        if (addr === symbols.Warp_Req_Flag) flag = Number.parseInt(bytes, 16);
        return {};
      }
      if (method === 'emulator/read_memory') {
        const addr = Number.parseInt(String(params.addr), 16);
        if (addr === symbols.Warp_Req_Flag) {
          polls++;
          if (polls >= ackAfter) flag = 0;                       // engine consumed it
          return { bytes: '0x' + flag.toString(16).padStart(2, '0') };
        }
        // The engine publishes the CLAMPED destination back into X/Y.
        const dest = opts.clampTo ?? written;
        const v = addr === symbols.Warp_Req_X ? dest.x : dest.y;
        return { bytes: '0x' + v.toString(16).padStart(4, '0') };
      }
      return {};
    },
  };
}

describe('warpTo', () => {
  it('writes X, then Y, then the flag LAST', async () => {
    const c = fakeClient();
    const r = await warpTo(c as never, 2144, 429);
    expect(r.warped).toBe(true);

    const writes = c.calls.filter((x) => x.method === 'emulator/write_memory');
    expect(writes.map((w) => w.params.addr)).toEqual(['0xFFE502', '0xFFE504', '0xFFE506']);
    // Payload-then-flag: a torn read must never be able to act on half a
    // destination. This ordering is part of the ruled protocol, not an
    // implementation preference.
    expect(writes[2].params.bytes).toBe('0x01');
  });

  it('writes the coordinates as big-endian words', async () => {
    const c = fakeClient();
    await warpTo(c as never, 0x0860, 0x01ad);
    const writes = c.calls.filter((x) => x.method === 'emulator/write_memory');
    expect(writes[0].params.bytes).toBe('0x0860');
    expect(writes[1].params.bytes).toBe('0x01ad');
  });

  it('waits for the engine to clear the flag, and reports the ack', async () => {
    const c = fakeClient({ ackAfter: 3 });
    const r = await warpTo(c as never, 100, 200);
    expect(r.warped).toBe(true);
    expect(r.polls).toBeGreaterThanOrEqual(3);
  });

  /**
   * The engine clamps the request to the act's bounds and publishes the
   * CLAMPED destination back. A UI that assumed the cursor position would
   * report a warp to somewhere the player is not.
   */
  it('reads back where it actually landed, not where it asked to go', async () => {
    // In-range for the protocol (u16) but outside the ACT — which is the case
    // the engine clamps. An out-of-u16 value never gets this far; that is the
    // range check's job, tested separately below.
    const c = fakeClient({ clampTo: { x: 4095, y: 511 } });
    const r = await warpTo(c as never, 60000, 40000);
    expect(r.landed).toEqual({ x: 4095, y: 511 });
    expect(r.clamped).toBe(true);
  });

  it('reports clamped=false when it landed where it asked', async () => {
    const c = fakeClient();
    const r = await warpTo(c as never, 300, 400);
    expect(r.landed).toEqual({ x: 300, y: 400 });
    expect(r.clamped).toBe(false);
  });

  it('gives up rather than polling forever when the flag never clears', async () => {
    const c = fakeClient({ ackAfter: Number.MAX_SAFE_INTEGER });
    const r = await warpTo(c as never, 10, 10, { maxPolls: 5 });
    expect(r.warped).toBe(false);
    expect(r.error).toMatch(/did not acknowledge/i);
  });

  /**
   * The mailbox is DEBUG-shape only: a release listing does not carry these
   * symbols. The feature must grey out rather than write into a guessed
   * address — and rather than write into whatever else happens to live at a
   * hardcoded $FFE502 in a release build.
   */
  it('gates when the symbols are absent (a release ROM)', async () => {
    const c = fakeClient({ symbols: { Warp_Req_X: 0xffe502 } });
    const r = await warpTo(c as never, 10, 10);
    expect(r.warped).toBe(false);
    expect(r.gate).toBe(WarpGateReason.NoSymbols);
    expect(c.calls.filter((x) => x.method === 'emulator/write_memory')).toHaveLength(0);
  });

  it('gates when disconnected', async () => {
    const c = fakeClient({ connected: false });
    const r = await warpTo(c as never, 10, 10);
    expect(r.warped).toBe(false);
    expect(r.gate).toBe(WarpGateReason.Disconnected);
  });

  it('refuses a coordinate that does not fit the u16 the protocol carries', async () => {
    const c = fakeClient();
    const r = await warpTo(c as never, 70000, 10);
    expect(r.warped).toBe(false);
    expect(r.error).toMatch(/65535|range/i);
    expect(c.calls).toHaveLength(0);
  });

  it('names the three symbols it needs', () => {
    expect(WARP_SYMBOLS).toEqual(['Warp_Req_X', 'Warp_Req_Y', 'Warp_Req_Flag']);
  });
});

describe('warpTo and the machine it borrows', () => {
  /**
   * BOTH OF THESE WERE FOUND IN REAL USE, in sequence, by pressing F7.
   *
   * First: `write_memory` is require_paused whatever it is writing. The mailbox
   * being frame-top-consumed makes the WARP tear-free; it does not exempt the
   * REQUEST from the pause gate. Every warp failed with "needs the machine
   * paused; call emulator/pause first".
   *
   * Then, after pausing: "the engine did not acknowledge within 120 polls" —
   * because the engine takes the request at frame top, and a paused machine has
   * no frame tops. The fix has to both pause for the write AND let the machine
   * run to consume it.
   */
  it('pauses to write, then resumes so the engine can consume the request', async () => {
    const c = fakeClient({ wasRunning: true });
    const r = await warpTo(c as never, 100, 200);
    expect(r.warped).toBe(true);
    const order = c.calls.map((x) => x.method);
    expect(order[0]).toBe('emulator/pause');
    const lastWrite = order.lastIndexOf('emulator/write_memory');
    const resume = order.indexOf('emulator/resume');
    expect(resume).toBeGreaterThan(lastWrite);
  });

  it('leaves a machine that was already paused paused, stepping it instead', async () => {
    // Someone stopped the machine on purpose — a debugger, or the person. A
    // warp must not start it running underneath them.
    const c = fakeClient({ wasRunning: false, ackAfter: 3 });
    const r = await warpTo(c as never, 100, 200);
    expect(r.warped).toBe(true);
    const methods = c.calls.map((x) => x.method);
    expect(methods).not.toContain('emulator/resume');
    expect(methods.filter((m) => m === 'emulator/run_frames').length).toBeGreaterThan(0);
  });

  it('resumes even when the warp fails partway', async () => {
    const c = fakeClient({ wasRunning: true, ackAfter: Number.MAX_SAFE_INTEGER });
    await warpTo(c as never, 10, 10, { maxPolls: 3 });
    expect(c.calls.map((x) => x.method)).toContain('emulator/resume');
  });
});

/**
 * THE CUTOVER ROWS. `warpTo` had exactly one story for a resolution failure —
 * "a release ROM does not carry the mailbox" — and the new server adds a second
 * one that is not about the ROM at all. Telling a user to rebuild a ROM that was
 * never the problem is a plausible, documented, WRONG answer, which is worse
 * than a refusal.
 */
describe('warpTo and a server that does not serve what it needs', () => {
  it('does NOT call an unserved lookup a release ROM: it names the method instead', async () => {
    const c = fakeClient({ unserved: ['emulator/lookup_symbol'] });
    const r = await warpTo(c as never, 0x100, 0x100);

    expect(r.warped).toBe(false);
    expect(r.gate).toBe(WarpGateReason.UnservedMethod);
    expect(r.gate).not.toBe(WarpGateReason.NoSymbols);
    expect(r.unservedMethod).toBe('emulator/lookup_symbol');
    // ANTI-VACUOUS: the machine was never touched, so this is not "the fake
    // refused everything" — it is a refusal made before the wire.
    expect(c.calls).toEqual([]);
  });

  /**
   * THE DISCRIMINATION, stated as its own row. A guard that only checked the
   * unserved case would pass against an implementation that returned
   * `UnservedMethod` for EVERY resolution failure — including the release ROM,
   * which is the case the gate was built for and must keep.
   */
  it('still says no-symbols when the server is fine and the ROM simply lacks them', async () => {
    const c = fakeClient({ symbols: {} });
    const r = await warpTo(c as never, 0x100, 0x100);
    expect(r.gate).toBe(WarpGateReason.NoSymbols);
    expect(r.unservedMethod).toBeUndefined();
  });

  it('refuses BEFORE pausing when a write method is unserved, so nothing is left stopped', async () => {
    const c = fakeClient({ unserved: ['emulator/write_memory'] });
    const r = await warpTo(c as never, 0x100, 0x100);

    expect(r.warped).toBe(false);
    expect(r.gate).toBe(WarpGateReason.UnservedMethod);
    expect(r.unservedMethod).toBe('emulator/write_memory');
    // THE OBSERVABLE THAT MATTERS. Discovering the gap after `emulator/pause`
    // would leave a live machine stopped with a half-written mailbox in it.
    expect(c.calls.map((x) => x.method)).not.toContain('emulator/pause');
    // ANTI-VACUOUS: the symbols DID resolve, so the refusal came from the
    // method check and not from an incidentally broken fixture.
    expect(r.gate).not.toBe(WarpGateReason.NoSymbols);
  });

  it('says the machine was left PAUSED when resume itself is unserved', async () => {
    const c = fakeClient({ unserved: ['emulator/resume'] });
    const r = await warpTo(c as never, 0x100, 0x100);

    expect(r.warped).toBe(false);
    expect(r.error).toContain('left PAUSED');
    expect(r.unservedMethod).toBe('emulator/resume');
    // ANTI-VACUOUS: the sequence really ran — it paused and wrote the mailbox
    // before it got as far as needing a resume it could not make.
    expect(c.calls.map((x) => x.method)).toContain('emulator/pause');
    expect(c.calls.filter((x) => x.method === 'emulator/write_memory')).toHaveLength(3);
  });
});
