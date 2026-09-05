// Play-from-cursor on the CLASSIC path: poke, settle, read back.
//
// THE DEFECT CLASS THIS FILE EXISTS FOR (bar 2e). The measured hazard is not
// "the write goes to the wrong address" — it is "the write lands, reads back
// correctly, and is then UNDONE". S1's level init clears object RAM and
// re-seeds Sonic from the start-position table, and the spike
// (docs/reviews/2026-08-27-s1-vplayer-spike.md) measured the machine ending
// BYTE-IDENTICAL to the control after a poke that had read back fine.
//
// So a test that stubs the client and asserts "we wrote the right bytes" would
// be green against exactly the bug. The load-bearing rows here drive a fake
// machine that ACCEPTS the write and then reverts it during the settle, and
// require the result to say so. Those rows go red if the read-back is deleted;
// the "we wrote the right bytes" rows do not.

import { describe, it, expect } from 'vitest';
import { s1WarpTo, S1_SETTLE_FRAMES } from '../s1-warp';
import { WarpGateReason } from '../warp';
import { MethodNotServedError } from '../unserved';

const V_PLAYER = 0xffffd000;
const OB_X = 8;
const OB_Y = 0xc;

/** Enough of `_Constants.asm` to derive the pair, in the file's real shape. */
const CONSTANTS = [
  'obX:\t\t\tequ 8\t\t\t; x-axis position (2-4 bytes)',
  'obSubpixelX:\t\tequ $A\t\t\t; x-axis subpixel position',
  'obY:\t\t\tequ $C\t\t\t; y-axis position (2-4 bytes)',
].join('\n');

interface FakeOpts {
  connected?: boolean;
  wasRunning?: boolean;
  /** Methods this server does NOT serve. */
  unserved?: string[];
  /** Symbols the listing carries. Omit `v_player` for a stripped ROM. */
  symbols?: Record<string, number>;
  /** Where the player starts, before anything is poked. */
  start?: { x: number; y: number };
  /**
   * What the GAME does to the player during the settle. The whole point: the
   * write landing is not the feature working.
   */
  onSettle?: (p: { x: number; y: number }, start: { x: number; y: number }) => { x: number; y: number };
  constants?: string | null;
  /**
   * Where in the slot THIS machine keeps X and Y. Defaults to s1disasm's own
   * pair; the derivation row moves them, and the fake throws on a write or a
   * read anywhere else — so an implementation with `8`/`$C` typed into it goes
   * loudly red instead of quietly poking the wrong words.
   */
  offsets?: { x: number; y: number };
}

function fakeMachine(opts: FakeOpts = {}) {
  const symbols = opts.symbols ?? {
    v_player: V_PLAYER,
    // Present and resolvable ON PURPOSE: the camera guard row has to prove
    // this code does not touch them, which is only meaningful if it could.
    v_screenposx: 0xffffd008,
    v_screenposy: 0xffffd00c,
  };
  const off = opts.offsets ?? { x: OB_X, y: OB_Y };
  const start = opts.start ?? { x: 80, y: 1084 };
  const player = { ...start };
  const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
  const resolved: string[] = [];
  const wasRunning = opts.wasRunning ?? true;
  const unserved = opts.unserved ?? [];
  const w = (v: number) => '0x' + (v & 0xffff).toString(16).padStart(4, '0');

  return {
    calls,
    resolved,
    player,
    status: opts.connected === false ? 'disconnected' : 'connected',
    server: { name: 'oracle' },
    hasMethod: (m: string) => !unserved.includes(m),
    resolve: async (name: string) => {
      resolved.push(name);
      if (unserved.includes('emulator/lookup_symbol')) {
        throw new MethodNotServedError('emulator/lookup_symbol', 'advertised-list', 'oracle');
      }
      const a = symbols[name];
      if (a === undefined) throw new Error(`no symbol named ${name}`);
      return a;
    },
    call: async (method: string, params: Record<string, unknown> = {}) => {
      calls.push({ method, params });
      // A real client REFUSES an unadvertised method rather than answering it.
      // Without this the fake would serve what it claims not to have, and every
      // unserved row would be testing the fake.
      if (unserved.includes(method)) {
        throw new MethodNotServedError(method, 'advertised-list', 'oracle');
      }
      if (method === 'emulator/pause') return { wasRunning };
      if (method === 'emulator/write_memory') {
        const addr = Number.parseInt(String(params.addr), 16);
        const v = Number.parseInt(String(params.bytes).replace(/^0x/i, ''), 16);
        if (addr === V_PLAYER + off.x) player.x = v;
        else if (addr === V_PLAYER + off.y) player.y = v;
        else throw new Error(`fake machine: unexpected write to 0x${addr.toString(16)}`);
        return {};
      }
      if (method === 'emulator/run_frames') {
        // THE GAME GETS A TURN. This is where a real S1 re-seeds Sonic from the
        // start-position table, or resolves him out of a wall.
        const after = opts.onSettle ? opts.onSettle({ ...player }, start) : { ...player };
        player.x = after.x; player.y = after.y;
        return {};
      }
      if (method === 'emulator/read_memory') {
        const addr = Number.parseInt(String(params.addr), 16);
        if (addr === V_PLAYER + off.x) return { bytes: w(player.x) };
        if (addr === V_PLAYER + off.y) return { bytes: w(player.y) };
        throw new Error(`fake machine: unexpected read at 0x${addr.toString(16)}`);
      }
      return {};
    },
  };
}

const withConstants = (opts: FakeOpts = {}) => ({
  projectDir: '/does/not/exist',
  readConstants: () => (opts.constants === undefined ? CONSTANTS : opts.constants),
});

const writesTo = (c: ReturnType<typeof fakeMachine>, addr: number) =>
  c.calls.filter((k) => k.method === 'emulator/write_memory'
    && Number.parseInt(String(k.params.addr), 16) === addr);

// ---------------------------------------------------------------------------
// THE READ-BACK — the rows the feature exists for.
// ---------------------------------------------------------------------------

describe('s1WarpTo reports where the player ACTUALLY ended up', () => {
  it('a poke that holds reports the destination and no clamp', async () => {
    const c = fakeMachine();                              // settle leaves him alone
    const r = await s1WarpTo(c as never, 592, 1084, withConstants());
    expect(r.warped).toBe(true);
    expect(r.landed).toEqual({ x: 592, y: 1084 });
    expect(r.clamped).toBe(false);
    expect(r.from).toEqual({ x: 80, y: 1084 });
  });

  it('a poke the level init DISCARDS is reported as not warped, not as success', async () => {
    // The measured hazard, exactly: the write lands, reads back correctly, and
    // then S1's init re-seeds Sonic from the start-position table. A stub that
    // only checked the bytes we wrote would be green here.
    const c = fakeMachine({ onSettle: (_p, start) => ({ ...start }) });
    const r = await s1WarpTo(c as never, 592, 1084, withConstants());
    expect(r.warped).toBe(false);
    expect(r.landed).toEqual({ x: 80, y: 1084 });
    expect(r.from).toEqual({ x: 80, y: 1084 });
    // And it must SAY the mechanism, because "warp failed" sends the user
    // looking at the emulator instead of waiting for the act to finish loading.
    expect(r.error).toMatch(/did not take/i);
    expect(r.error).toMatch(/still loading|level init|start position/i);
  });

  it('a poke the GAME MOVES is warped, clamped, and reports the real landing', async () => {
    // Poked into a wall / onto a slope: S1 resolves collision against whatever
    // position it is handed, and where he ends up is the only honest answer.
    const c = fakeMachine({ onSettle: (p) => ({ x: p.x - 24, y: p.y + 8 }) });
    const r = await s1WarpTo(c as never, 592, 1084, withConstants());
    expect(r.warped).toBe(true);
    expect(r.clamped).toBe(true);
    expect(r.landed).toEqual({ x: 568, y: 1092 });
  });

  it('warping to where the player already stands is a success, not a discard', async () => {
    // `landed === from` is the discard signature, so the ASKED comparison has
    // to come first or a no-op warp reports itself as a silent failure.
    const c = fakeMachine({ start: { x: 300, y: 500 } });
    const r = await s1WarpTo(c as never, 300, 500, withConstants());
    expect(r.warped).toBe(true);
    expect(r.clamped).toBe(false);
  });

  it('reads the position BEFORE poking, so `from` is the pre-poke position', async () => {
    const c = fakeMachine({ start: { x: 41, y: 42 } });
    const r = await s1WarpTo(c as never, 900, 900, withConstants());
    expect(r.from).toEqual({ x: 41, y: 42 });
    const order = c.calls.map((k) => k.method);
    expect(order.indexOf('emulator/read_memory')).toBeLessThan(order.indexOf('emulator/write_memory'));
  });
});

// ---------------------------------------------------------------------------
// The settle.
// ---------------------------------------------------------------------------

describe('s1WarpTo lets the game settle before believing anything', () => {
  it('runs frames between the poke and the read-back', async () => {
    const c = fakeMachine();
    const r = await s1WarpTo(c as never, 592, 1084, withConstants());
    const order = c.calls.map((k) => k.method);
    const lastWrite = order.lastIndexOf('emulator/write_memory');
    const settle = order.indexOf('emulator/run_frames');
    const lastRead = order.lastIndexOf('emulator/read_memory');
    expect(settle).toBeGreaterThan(lastWrite);
    expect(lastRead).toBeGreaterThan(settle);
    expect(r.settledFrames).toBe(S1_SETTLE_FRAMES);
  });

  it('spells the frame count `frames`, which is what the server accepts', async () => {
    const c = fakeMachine();
    await s1WarpTo(c as never, 592, 1084, withConstants());
    const rf = c.calls.filter((k) => k.method === 'emulator/run_frames');
    expect(rf).toHaveLength(1);
    expect(rf[0].params).toEqual({ frames: S1_SETTLE_FRAMES });
  });

  it('settles past the window in which the measured discard showed up', () => {
    // The spike measured the init discard visible "ten frames later", and the
    // camera finishing its follow in "roughly 30 frames". The budget has to
    // clear the first and is chosen to clear the second, so the read-back is
    // taken after the visible transition rather than in the middle of it.
    expect(S1_SETTLE_FRAMES).toBeGreaterThan(10);
    expect(S1_SETTLE_FRAMES).toBeGreaterThanOrEqual(30);
  });

  it('honours an explicit settle budget', async () => {
    const c = fakeMachine();
    const r = await s1WarpTo(c as never, 592, 1084, { ...withConstants(), settleFrames: 7 });
    expect(c.calls.find((k) => k.method === 'emulator/run_frames')!.params).toEqual({ frames: 7 });
    expect(r.settledFrames).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Addresses — derived, never typed.
// ---------------------------------------------------------------------------

describe('s1WarpTo derives every address it writes', () => {
  it('writes the X and Y words at v_player + obX / + obY', async () => {
    const c = fakeMachine();
    await s1WarpTo(c as never, 0x0250, 0x043c, withConstants());
    expect(writesTo(c, V_PLAYER + OB_X).map((k) => k.params.bytes)).toEqual(['0x0250']);
    expect(writesTo(c, V_PLAYER + OB_Y).map((k) => k.params.bytes)).toEqual(['0x043c']);
  });

  it('takes the displacements from the SOURCE it is handed, not from a literal', async () => {
    // A disassembly that renumbered its slots must move the poke with it.
    // This machine keeps X and Y at $20/$24, and its constants say so. The
    // fake throws on any other address, so an implementation with 8/$C typed
    // into it fails loudly rather than poking the wrong two words.
    const c = fakeMachine({ offsets: { x: 0x20, y: 0x24 } });
    const moved = 'obX:\tequ $20\nobY:\tequ $24\n';
    const r = await s1WarpTo(c as never, 1, 2, { projectDir: '/x', readConstants: () => moved });
    expect(r.warped).toBe(true);
    const addrs = c.calls.filter((k) => k.method === 'emulator/write_memory')
      .map((k) => Number.parseInt(String(k.params.addr), 16));
    expect(addrs).toEqual([V_PLAYER + 0x20, V_PLAYER + 0x24]);
  });

  it('spells `addr` as a hex string, which is what the server accepts', async () => {
    const c = fakeMachine();
    await s1WarpTo(c as never, 10, 20, withConstants());
    for (const k of c.calls) {
      if (k.method !== 'emulator/write_memory' && k.method !== 'emulator/read_memory') continue;
      expect(typeof k.params.addr).toBe('string');
      expect(String(k.params.addr)).toMatch(/^0x[0-9A-Fa-f]+$/);
    }
  });

  it('NEVER POKES THE CAMERA', async () => {
    // aeon measured a direct camera write tearing 699 of 2048 nametable words.
    // On S1 the camera follows on its own, so there is no reason to touch it
    // and a measured reason not to. The fake resolves v_screenposx/y happily —
    // this row is about what the code chooses to do, not what it can do.
    const c = fakeMachine();
    await s1WarpTo(c as never, 592, 1084, withConstants());
    expect(c.resolved).not.toContain('v_screenposx');
    expect(c.resolved).not.toContain('v_screenposy');
    const written = c.calls.filter((k) => k.method === 'emulator/write_memory')
      .map((k) => Number.parseInt(String(k.params.addr), 16));
    expect(written).toEqual([V_PLAYER + OB_X, V_PLAYER + OB_Y]);
  });
});

// ---------------------------------------------------------------------------
// Gates. The NoSymbols / UnservedMethod distinction is load-bearing.
// ---------------------------------------------------------------------------

describe('s1WarpTo gates', () => {
  it('gates on a dead link without touching anything', async () => {
    const c = fakeMachine({ connected: false });
    const r = await s1WarpTo(c as never, 100, 200, withConstants());
    expect(r).toEqual({ warped: false, gate: WarpGateReason.Disconnected });
    expect(c.calls).toEqual([]);
  });

  it('a ROM whose listing has no v_player is NoSymbols', async () => {
    const c = fakeMachine({ symbols: {} });
    const r = await s1WarpTo(c as never, 100, 200, withConstants());
    expect(r.warped).toBe(false);
    expect(r.gate).toBe(WarpGateReason.NoSymbols);
    expect(r.unservedMethod).toBeUndefined();
  });

  it('a server that cannot look symbols up is UnservedMethod, NOT NoSymbols', async () => {
    // Telling the user "release ROM, rebuild" when the truth is "this server
    // does not serve lookup_symbol" hands them a documented, wrong explanation
    // and sends them to rebuild the thing that did not change.
    const c = fakeMachine({ unserved: ['emulator/lookup_symbol'] });
    const r = await s1WarpTo(c as never, 100, 200, withConstants());
    expect(r.gate).toBe(WarpGateReason.UnservedMethod);
    expect(r.unservedMethod).toBe('emulator/lookup_symbol');
  });

  it('an unreadable _Constants.asm is its OWN reason: not NoSymbols', async () => {
    // The listing is fine and the server is fine; the PROJECT is what is
    // missing. Reporting this as "no symbols" would send the user to rebuild a
    // ROM that would come back exactly as unable to answer.
    const c = fakeMachine();
    const r = await s1WarpTo(c as never, 100, 200, { projectDir: '/x', readConstants: () => null });
    expect(r.warped).toBe(false);
    expect(r.gate).toBe(WarpGateReason.NoOffsets);
    expect(r.error).toMatch(/_Constants\.asm/);
    expect(c.calls).toEqual([]);
  });

  it('a _Constants.asm missing obY gates rather than half-poking', async () => {
    const c = fakeMachine();
    const r = await s1WarpTo(c as never, 100, 200, {
      projectDir: '/x', readConstants: () => 'obX:\tequ 8\n',
    });
    expect(r.gate).toBe(WarpGateReason.NoOffsets);
    expect(c.calls).toEqual([]);
  });

  it.each([
    ['emulator/pause'],
    ['emulator/write_memory'],
    ['emulator/read_memory'],
    ['emulator/run_frames'],
  ])('refuses BEFORE the pause when %s is unserved', async (method) => {
    // Asked before the pause, not discovered after it: finding out halfway
    // leaves a machine paused with half a poke in it.
    const c = fakeMachine({ unserved: [method] });
    const r = await s1WarpTo(c as never, 100, 200, withConstants());
    expect(r.warped).toBe(false);
    expect(r.gate).toBe(WarpGateReason.UnservedMethod);
    expect(r.unservedMethod).toBe(method);
    expect(c.calls).toEqual([]);
  });

  it.each([
    ['x', -1, 100],
    ['x', 0x10000, 100],
    ['y', 100, 1.5],
  ])('refuses an out-of-range %s before the wire', async (_axis, x, y) => {
    const c = fakeMachine();
    const r = await s1WarpTo(c as never, x, y, withConstants());
    expect(r.warped).toBe(false);
    expect(r.error).toMatch(/out of range|not an integer/i);
    expect(c.calls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The machine it borrows.
// ---------------------------------------------------------------------------

describe('s1WarpTo puts the machine back the way it found it', () => {
  it('resumes a machine that was running, exactly once', async () => {
    const c = fakeMachine({ wasRunning: true });
    await s1WarpTo(c as never, 592, 1084, withConstants());
    expect(c.calls.filter((k) => k.method === 'emulator/resume')).toHaveLength(1);
  });

  it('leaves a machine somebody else stopped STOPPED', async () => {
    // The bus is multi-client. An unconditional resume starts a machine a
    // debugger session deliberately paused.
    const c = fakeMachine({ wasRunning: false });
    await s1WarpTo(c as never, 592, 1084, withConstants());
    expect(c.calls.filter((k) => k.method === 'emulator/resume')).toHaveLength(0);
    // ...but it still has to advance to settle, which is the run_frames.
    expect(c.calls.filter((k) => k.method === 'emulator/run_frames')).toHaveLength(1);
  });

  it('surfaces an UNSERVED resume that left a live machine paused', async () => {
    const c = fakeMachine({ wasRunning: true, unserved: ['emulator/resume'] });
    const r = await s1WarpTo(c as never, 592, 1084, withConstants());
    expect(r.error).toMatch(/PAUSED/);
    expect(r.unservedMethod).toBe('emulator/resume');
  });

  it('still resumes when the poke itself throws', async () => {
    const c = fakeMachine();
    const real = c.call;
    c.call = async (m: string, p: Record<string, unknown> = {}) => {
      if (m === 'emulator/write_memory') { c.calls.push({ method: m, params: p }); throw new Error('boom'); }
      return real(m, p);
    };
    const r = await s1WarpTo(c as never, 592, 1084, withConstants());
    expect(r.warped).toBe(false);
    expect(r.error).toMatch(/boom/);
    expect(c.calls.filter((k) => k.method === 'emulator/resume')).toHaveLength(1);
  });
});
