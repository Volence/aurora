import { describe, it, expect } from 'vitest';
import { bootRestoreTo, BOOT_SYMBOLS, BOOT_INIT_SYMBOL, BootRestoreGate } from '../boot-restore';
import { MethodNotServedError } from '../unserved';

/**
 * The fake here is a MODEL OF THE ENGINE'S CONTRACT (ENGINE_ARCHITECTURE.md
 * §4.12b), not a call recorder that accepts any sequence:
 *
 *  - `run_to` the init simulates the boot, and the boot ZEROES WORK RAM —
 *    everything written before it is discarded, exactly the silent loss the
 *    protocol warns about.
 *  - The init is SINGLE-SHOT: it consumes the mailbox once, on the first
 *    advance after the boot. A flag raised later is never seen.
 *  - Consumption clamps to act bounds, publishes the clamped pair back into
 *    X/Y, and clears the flag as the ack.
 *  - `run_to`, `write_memory`, `run_frames` are require_paused
 *    (oracle-aether engine.rs:1290/1401/1263); `read_memory` is a pure read.
 *
 * Because the loss/single-shot rules are modelled rather than assumed, a
 * regression to the broken sequence (write before run_to) FAILS these tests
 * naturally instead of passing against an indifferent mock — and the
 * "the model actually bites" meta-test at the bottom proves that guard
 * asserts something.
 */

// One fixture table; every expectation below derives from it. The addresses
// are arbitrary (the fake serves lookup from this same table, so the property
// under test is "the client writes where it resolved", never a literal).
const SYMS: Record<string, number> = {
  Boot_At_X: 0xffe508,
  Boot_At_Y: 0xffe50a,
  Boot_At_Flag: 0xffe50c,
  [BOOT_INIT_SYMBOL]: 0xa1724,
};
// Act bounds the fake's init clamps to — free fixture parameters; the clamp
// expectations are COMPUTED from them (Math.min), never written out by hand.
const BOUND_X = 0x0900;
const BOUND_Y = 0x0700;

/**
 * Everything this fake's `call` switch actually implements, plus the lookup its
 * `resolve` stands in for. Written out instead of `() => true` so a row can drop
 * exactly one method and watch the routine refuse — a fake that serves
 * everything cannot express the condition under test.
 */
const SERVED = [
  'emulator/run_to', 'emulator/write_memory', 'emulator/read_memory',
  'emulator/resume', 'emulator/run_frames', 'emulator/lookup_symbol',
];

interface FakeOpts {
  symbols?: Record<string, number>;
  /** run_to answers reached:false (deadline) instead of stopping at the init. */
  initUnreachable?: boolean;
  /** Methods this server does NOT serve — dropped from the advertised list. */
  unserved?: string[];
}

function fakeEngine(opts: FakeOpts = {}) {
  const symbols = opts.symbols ?? SYMS;
  const ram = new Map<number, number>();
  const log: string[] = [];
  let paused = true;         // the caller pauses for reload_rom before us
  let booted = false;        // run_to-the-init has happened
  let initConsumed = false;  // the init is single-shot

  const readByte = (a: number) => ram.get(a) ?? 0;
  const writeBytes = (addr: number, hexBytes: string) => {
    const h = hexBytes.replace(/^0x/i, '');
    for (let i = 0; i < h.length / 2; i++) {
      ram.set(addr + i, Number.parseInt(h.slice(i * 2, i * 2 + 2), 16));
    }
  };
  const readWord = (a: number) => (readByte(a) << 8) | readByte(a + 1);
  const writeWord = (a: number, v: number) => { ram.set(a, (v >> 8) & 0xff); ram.set(a + 1, v & 0xff); };

  /** The init: single-shot, first advance after the boot. */
  const advance = () => {
    if (!booted || initConsumed) return;
    initConsumed = true;
    if (readByte(symbols.Boot_At_Flag) !== 0) {
      // Clamp, publish the CLAMPED pair back, clear the flag as the ack.
      writeWord(symbols.Boot_At_X, Math.min(readWord(symbols.Boot_At_X), BOUND_X));
      writeWord(symbols.Boot_At_Y, Math.min(readWord(symbols.Boot_At_Y), BOUND_Y));
      ram.set(symbols.Boot_At_Flag, 0);
    }
  };

  const served = SERVED.filter((m) => !(opts.unserved ?? []).includes(m));
  const client = {
    status: 'connected' as const,
    server: { name: 'oracle-next' },
    hasMethod: (m: string) => served.includes(m),
    resolve: async (name: string): Promise<number> => {
      // `resolve` IS `emulator/lookup_symbol` — model that, or the unserved
      // case cannot be expressed at all.
      if (!served.includes('emulator/lookup_symbol')) {
        throw new MethodNotServedError('emulator/lookup_symbol', 'advertised-list', 'oracle-next');
      }
      const a = symbols[name];
      if (a === undefined) throw new Error(`symbol ${name} did not resolve`);
      return a;
    },
    call: async (method: string, params?: Record<string, unknown>): Promise<unknown> => {
      log.push(`${method}:${params?.symbol ?? params?.addr ?? ''}`);
      // A real client REJECTS an unadvertised method rather than answering it.
      // Without this the fake would serve a method it claims not to have, and
      // any row about the unserved path would be testing the fake.
      if (!served.includes(method)) {
        throw new MethodNotServedError(method, 'advertised-list', 'oracle-next');
      }
      const requirePaused = () => {
        if (!paused) throw new Error(`${method} needs the machine paused; call emulator/pause first`);
      };
      switch (method) {
        case 'emulator/run_to': {
          requirePaused();
          if (opts.initUnreachable) return { reached: false };
          // THE BOOT ZEROES ALL WORK RAM — anything written before this
          // point is silently lost, which is the whole protocol.
          ram.clear();
          booted = true;
          return { reached: true };
        }
        case 'emulator/write_memory': {
          requirePaused();
          writeBytes(Number(params!.addr), String(params!.bytes));
          return {};
        }
        case 'emulator/resume': paused = false; advance(); return {};
        case 'emulator/run_frames': requirePaused(); advance(); return {};
        case 'emulator/read_memory': {
          const addr = Number(params!.addr);
          const len = Number(params!.len ?? 1);
          let h = '';
          for (let i = 0; i < len; i++) h += readByte(addr + i).toString(16).padStart(2, '0');
          return { bytes: '0x' + h };
        }
        default: return {};
      }
    },
  };
  return { client, log, ram, isPaused: () => paused, symbols };
}

const hexAddr = (n: number) => '0x' + (n >>> 0).toString(16).toUpperCase();

describe('bootRestoreTo: the supported sequence', () => {
  it('restores: run_to the init FIRST, then X, then Y, then the flag LAST, then continue', async () => {
    const { client, log } = fakeEngine();
    const r = await bootRestoreTo(client as never, 0x0123, 0x0456, { wasRunning: true });

    expect(r.restored).toBe(true);
    expect(r.resumed).toBe(true);
    // In-bounds request (0x0123 <= BOUND_X, 0x0456 <= BOUND_Y), so the
    // published pair is the request itself and nothing was clamped.
    expect(r.landed).toEqual({ x: Math.min(0x0123, BOUND_X), y: Math.min(0x0456, BOUND_Y) });
    expect(r.clamped).toBe(false);

    // Order, derived from the fixture's own addresses (BOOT_SYMBOLS order
    // mirrors aeon games/sonic4/config/ram.emp: X, Y, Flag):
    const runTo = log.findIndex((c) => c.startsWith('emulator/run_to:'));
    const writeAt = (sym: string) =>
      log.findIndex((c) => c === `emulator/write_memory:${hexAddr(SYMS[sym])}`);
    const [wx, wy, wf] = BOOT_SYMBOLS.map(writeAt);
    const resume = log.findIndex((c) => c.startsWith('emulator/resume'));
    expect(runTo).toBeGreaterThanOrEqual(0);
    expect(wx).toBeGreaterThan(runTo);   // write AFTER the window opens
    expect(wy).toBeGreaterThan(wx);      // payload order X then Y
    expect(wf).toBeGreaterThan(wy);      // the flag LAST
    expect(resume).toBeGreaterThan(wf);  // continue only once the mailbox is whole
  });

  it('publishes back the CLAMPED pair when the destination is out of the act', async () => {
    const { client } = fakeEngine();
    // Both coordinates past the fake's bounds; the expectation is computed
    // with the same Math.min the model applies — not a hand-copied number.
    const askX = BOUND_X + 0x200, askY = BOUND_Y + 0x300;
    const r = await bootRestoreTo(client as never, askX, askY, { wasRunning: true });
    expect(r.restored).toBe(true);
    expect(r.landed).toEqual({ x: Math.min(askX, BOUND_X), y: Math.min(askY, BOUND_Y) });
    expect(r.clamped).toBe(true);
  });

  it('leaves a machine that somebody else stopped STOPPED, stepping frames for the ack', async () => {
    const { client, log, isPaused } = fakeEngine();
    const r = await bootRestoreTo(client as never, 0x0100, 0x0100, { wasRunning: false });
    expect(r.restored).toBe(true);
    expect(r.resumed).toBe(false);
    expect(log.some((c) => c.startsWith('emulator/resume'))).toBe(false);
    expect(log.some((c) => c.startsWith('emulator/run_frames'))).toBe(true);
    expect(isPaused()).toBe(true);
  });

  it('gates off with no-symbols (and WITHOUT advancing the machine) on a ROM that lacks the mailbox', async () => {
    // An older DEBUG ROM: warp symbols exist, boot symbols do not. The gate
    // must fire before run_to so the caller's fallback starts from reset too.
    const { client, log } = fakeEngine({ symbols: { [BOOT_INIT_SYMBOL]: SYMS[BOOT_INIT_SYMBOL] } });
    const r = await bootRestoreTo(client as never, 0x0100, 0x0100, { wasRunning: true });
    expect(r.restored).toBe(false);
    expect(r.gate).toBe(BootRestoreGate.NoSymbols);
    expect(log).toEqual([]); // not one call reached the machine
  });

  it('gates off when the boot never reaches the init, without writing anything', async () => {
    const { client, log } = fakeEngine({ initUnreachable: true });
    const r = await bootRestoreTo(client as never, 0x0100, 0x0100, { wasRunning: true });
    expect(r.restored).toBe(false);
    expect(r.gate).toBe(BootRestoreGate.InitNotReached);
    expect(log.some((c) => c.startsWith('emulator/write_memory'))).toBe(false);
  });

  it('refuses out-of-range coordinates before touching the wire', async () => {
    const { client, log } = fakeEngine();
    const r = await bootRestoreTo(client as never, 0x10000, 0, { wasRunning: true });
    expect(r.restored).toBe(false);
    expect(r.error).toMatch(/out of range/);
    expect(log).toEqual([]);
  });
});

describe('the model actually bites (anti-vacuous check on the fake itself)', () => {
  /**
   * If the fake accepted any call order, every ordering assertion above would
   * be the only guard — and a fake that cannot fail proves nothing about the
   * sequence's NECESSITY. So: drive the fake with the exact broken sequence
   * the engine contract warns about (writes at the reset-paused machine,
   * BEFORE run_to) and show the model eats the writes, exactly as the real
   * boot's RAM clear does (aeon tools/boot_override_gate.py, case `pre`).
   */
  it('a write made before run_to is silently zeroed and the boot comes out authored', async () => {
    const { client, ram, symbols } = fakeEngine();
    // The broken order: payload+flag first, run_to after.
    await client.call('emulator/write_memory', { addr: hexAddr(symbols.Boot_At_X), bytes: '0x0123' });
    await client.call('emulator/write_memory', { addr: hexAddr(symbols.Boot_At_Y), bytes: '0x0456' });
    await client.call('emulator/write_memory', { addr: hexAddr(symbols.Boot_At_Flag), bytes: '0x01' });
    await client.call('emulator/run_to', { symbol: BOOT_INIT_SYMBOL });
    await client.call('emulator/resume');
    // The flag was never seen (zeroed before the init ran): no ack semantics,
    // no publish — the mailbox reads all-zero, i.e. the authored boot.
    expect(ram.get(symbols.Boot_At_Flag) ?? 0).toBe(0);
    const x = ((ram.get(symbols.Boot_At_X) ?? 0) << 8) | (ram.get(symbols.Boot_At_X + 1) ?? 0);
    expect(x).toBe(0); // NOT 0x0123 — the write is gone
  });

  it('the init is single-shot: a flag raised after the first advance is never consumed', async () => {
    const { client, ram, symbols } = fakeEngine();
    await client.call('emulator/run_to', { symbol: BOOT_INIT_SYMBOL });
    await client.call('emulator/run_frames', { frames: 1 }); // init runs, mailbox empty -> authored boot
    // Now raise the flag legitimately (machine still paused) — TOO LATE.
    await client.call('emulator/write_memory', { addr: hexAddr(symbols.Boot_At_Flag), bytes: '0x01' });
    await client.call('emulator/run_frames', { frames: 1 });
    // Nothing consumes it: the flag stays raised forever, no ack, no publish.
    expect(ram.get(symbols.Boot_At_Flag)).toBe(0x01);
  });
});

/**
 * THE CUTOVER ROWS. `NoSymbols` here means "this ROM predates the boot
 * override", and it sends the caller to its warp fallback. An unserved method
 * breaks the warp fallback too, so answering NoSymbols would route the caller
 * down a second path that cannot work either, for a reason nobody was told.
 */
describe('bootRestoreTo and a server that does not serve what it needs', () => {
  it('gates UnservedMethod, not NoSymbols, when run_to is missing, and does not advance', async () => {
    const f = fakeEngine({ unserved: ['emulator/run_to'] });
    const r = await bootRestoreTo(f.client as never, 0x100, 0x100, { wasRunning: true });

    expect(r.restored).toBe(false);
    expect(r.gate).toBe(BootRestoreGate.UnservedMethod);
    expect(r.gate).not.toBe(BootRestoreGate.NoSymbols);
    expect(r.unservedMethod).toBe('emulator/run_to');
    expect(r.resumed).toBe(false);
    // The precondition is a machine paused at reset; the caller's fallback
    // starts from there, so this must not have moved it.
    expect(f.log).toEqual([]);
  });

  it('gates UnservedMethod when the lookup itself is not served', async () => {
    const f = fakeEngine({ unserved: ['emulator/lookup_symbol'] });
    const r = await bootRestoreTo(f.client as never, 0x100, 0x100, { wasRunning: true });
    expect(r.gate).toBe(BootRestoreGate.UnservedMethod);
    expect(r.unservedMethod).toBe('emulator/lookup_symbol');
    expect(f.log).toEqual([]);
  });

  /**
   * The discrimination. Without this row, an implementation that answered
   * UnservedMethod for every resolution failure would pass — and the release-ROM
   * gate this routine was built around would be gone with nothing complaining.
   */
  it('still gates NoSymbols on a ROM that simply lacks the mailbox', async () => {
    const f = fakeEngine({ symbols: { [BOOT_INIT_SYMBOL]: 0xa1724 } });
    const r = await bootRestoreTo(f.client as never, 0x100, 0x100, { wasRunning: true });
    expect(r.gate).toBe(BootRestoreGate.NoSymbols);
    expect(r.unservedMethod).toBeUndefined();
  });

  it('needs run_frames rather than resume when somebody else owns the pause', async () => {
    // The ack step differs by who stopped the machine, so the required-method
    // list is built from `wasRunning` instead of being one fixed list.
    const stepping = await bootRestoreTo(
      fakeEngine({ unserved: ['emulator/run_frames'] }).client as never,
      0x100, 0x100, { wasRunning: false },
    );
    expect(stepping.unservedMethod).toBe('emulator/run_frames');

    const running = await bootRestoreTo(
      fakeEngine({ unserved: ['emulator/run_frames'] }).client as never,
      0x100, 0x100, { wasRunning: true },
    );
    // A running machine never steps frames, so its absence must NOT gate.
    expect(running.gate).not.toBe(BootRestoreGate.UnservedMethod);
    expect(running.restored).toBe(true);
  });
});
