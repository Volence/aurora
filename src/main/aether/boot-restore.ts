/**
 * Boot-position override — put the player back after a ROM reload so that the
 * FIRST painted frame is already the destination.
 *
 * This replaces the old restore shape (resume, then retry the warp mailbox
 * until the level state consumed it), which worked but drew the authored act
 * start first and visibly jumped. The engine grew a supported boot-time
 * mailbox instead (aeon master a2a24eb9, `ENGINE_ARCHITECTURE.md` §4.12b):
 *
 *   Boot_At_X / Boot_At_Y  u16 world pixels — the SAME convention as
 *                          Warp_Req_X/Y, deliberately
 *   Boot_At_Flag           u8; 0 = idle/consumed (the ack), nonzero = pending
 *
 * THE WRITE WINDOW IS THE WHOLE PROTOCOL. Boot zeroes all 64KB of work RAM,
 * so a write made at the reset-paused machine is GONE before the level init
 * can read it — the boot proceeds with authored values silently, and the
 * client looks finished having done nothing (the engine's own gate proves the
 * pre-resume write is eaten, `aeon/tools/boot_override_gate.py`, case `pre`).
 * The supported sequence, verbatim from §4.12b:
 *
 *   reload_rom -> run_to GameState_OJZScroll_Init -> write X, Y, FLAG LAST
 *              -> continue
 *
 * At the init's entry the RAM clear has already happened, nothing has been
 * painted (the init switches the display on in its tail), and the machine is
 * stopped — so there is no race at all, and the init consumes the request
 * single-shot. The engine clamps to the act bounds, publishes the CLAMPED
 * pair back into X/Y, and clears the flag as its ack — so `landed` reports
 * where the player actually IS, not what was asked.
 *
 * Server rules this sequence leans on (oracle-aether engine.rs):
 * `run_to` (engine.rs:1290) and `write_memory` (engine.rs:1401) are both
 * require_paused — satisfied here because the caller pauses for `reload_rom`
 * (itself gated, engine.rs:2627) and `run_to` returns with the machine
 * paused at the target. `read_memory` is a pure read with no gate, so the
 * ack can be watched while the game runs.
 */

import type { AetherClient } from './client';
import { MethodNotServedError, isMethodNotServed, unservedMethodOf } from './unserved';

/** Declaration order mirrors `aeon/games/sonic4/config/ram.emp` (X, Y, Flag) — and the WRITE order is the protocol: payload first, flag LAST. */
export const BOOT_SYMBOLS = ['Boot_At_X', 'Boot_At_Y', 'Boot_At_Flag'] as const;

/**
 * Where the engine consumes the mailbox — the run_to target that defines the
 * write window. Game-specific by design (§4.12b: cross-act boot is Game_Entry
 * parameterisation, not this mailbox); a ROM without it simply gates off.
 */
export const BOOT_INIT_SYMBOL = 'GameState_OJZScroll_Init';

export enum BootRestoreGate {
  Disconnected = 'disconnected',
  /** Release ROM, or a DEBUG ROM older than the override — fall back to the warp. */
  NoSymbols = 'no-symbols',
  /** The boot never reached the init within the run bound — the window never opened. */
  InitNotReached = 'init-not-reached',
  /**
   * The SERVER does not serve a method this sequence needs. Emphatically NOT
   * `NoSymbols`: that gate means "this ROM predates the boot override", which
   * is a statement about the artifact and sends the caller to its warp
   * fallback. An unserved `run_to` or `write_memory` breaks the warp fallback
   * too, so reporting it as NoSymbols would send the caller down a second path
   * that cannot work either, for a reason nobody was told.
   */
  UnservedMethod = 'unserved-method',
}

export interface BootRestoreResult {
  restored: boolean;
  gate?: BootRestoreGate;
  error?: string;
  /** Set when the failure was "the server does not serve this" — names which. */
  unservedMethod?: string;
  /** The engine-published (clamped) pair — where the player actually IS. */
  landed?: { x: number; y: number };
  /** True when the engine moved the destination — worth telling the user. */
  clamped?: boolean;
  /**
   * True when this routine resumed the machine. The caller owns the
   * `wasRunning` courtesy (the bus is multi-client; never unconditionally
   * resume a machine somebody else stopped) — this says whether the courtesy
   * has already been paid, so the caller does not resume twice.
   */
  resumed: boolean;
  /** How many ack polls the consumption took, for tuning. */
  polls?: number;
}

/**
 * The init consumes the mailbox inside the very frame `run_to` stopped at the
 * entry of — the expected ack is poll 1 or 2, not the warp's ~20-frame reseed.
 * 60 is purely a wedge bound, far past anything a healthy build needs.
 */
const DEFAULT_MAX_POLLS = 60;

const hex = (n: number) => '0x' + (n >>> 0).toString(16).toUpperCase();
const word = (v: number) => '0x' + (v & 0xffff).toString(16).padStart(4, '0');

export interface BootRestoreOptions {
  /**
   * What `emulator/pause` said before the reload. When false, somebody else
   * stopped this machine deliberately: the ack is collected by single-frame
   * steps and the machine is LEFT paused, exactly as `warpTo` does.
   */
  wasRunning: boolean;
  maxPolls?: number;
}

/**
 * PRECONDITION: the machine is paused at reset, immediately after
 * `reload_rom` + `load_symbols`, and has NOT been resumed. A call after
 * resume is exactly the silently-eaten write the protocol exists to prevent —
 * this routine cannot detect that for you.
 *
 * Never throws: every failure comes back as `{ restored: false, ... }`, so a
 * restore problem can never turn a good build into a failed one.
 */
export async function bootRestoreTo(
  client: AetherClient,
  x: number,
  y: number,
  opts: BootRestoreOptions,
): Promise<BootRestoreResult> {
  if (client.status !== 'connected') {
    return { restored: false, gate: BootRestoreGate.Disconnected, resumed: false };
  }

  // Same range rule as the warp: the wire carries u16 world pixels, and a
  // caller handing us more has a bug we must not truncate into a boot
  // somewhere else.
  for (const [name, v] of [['x', x], ['y', y]] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) {
      return { restored: false, resumed: false, error: `boot restore ${name}=${v} is out of range 0-65535` };
    }
  }

  // ASKED BEFORE THE MACHINE MOVES, for the same reason the resolution below
  // happens before `run_to`: the documented precondition is a machine paused at
  // reset, and discovering a gap after the boot has advanced leaves the caller's
  // fallback starting somewhere this routine never described. The ack step
  // needs a different method depending on who owns the pause, so the list is
  // built from `wasRunning` rather than guessed at.
  for (const m of [
    'emulator/lookup_symbol', 'emulator/run_to', 'emulator/write_memory', 'emulator/read_memory',
    opts.wasRunning ? 'emulator/resume' : 'emulator/run_frames',
  ]) {
    if (!client.hasMethod(m)) {
      return {
        restored: false, resumed: false,
        gate: BootRestoreGate.UnservedMethod,
        unservedMethod: m,
        error: new MethodNotServedError(m, 'advertised-list', client.server?.name).message,
      };
    }
  }

  // Resolve EVERYTHING before advancing the machine one frame: a ROM missing
  // any of these gates off cleanly with the machine still at reset, so the
  // caller's fallback starts from the same place this routine did.
  let addrX: number, addrY: number, addrFlag: number;
  try {
    [addrX, addrY, addrFlag] = await Promise.all(
      [...BOOT_SYMBOLS, BOOT_INIT_SYMBOL].map((s) => client.resolve(s)),
    );
  } catch (e) {
    // NoSymbols is a claim about the ROM ("older than the override"). Only make
    // it when the lookup actually ran and came back empty-handed.
    const unserved = unservedMethodOf(e);
    return {
      restored: false, resumed: false,
      gate: unserved !== null ? BootRestoreGate.UnservedMethod : BootRestoreGate.NoSymbols,
      unservedMethod: unserved ?? undefined,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  let resumed = false;
  try {
    // OPEN THE WINDOW. Boot zeroes all work RAM; only past the init's entry is
    // a write guaranteed to survive to the single consumer. `run_to` returns
    // with the machine paused AT the target, which is what lets the writes
    // below pass the same require_paused gate.
    const run = await client.call('emulator/run_to', { symbol: BOOT_INIT_SYMBOL }) as
      { reached?: boolean };
    if (run?.reached !== true) {
      // The window never opened (deadline, or a watch ended the run). The
      // machine HAS advanced — the caller's warp fallback still works from
      // wherever this stopped.
      return {
        restored: false, gate: BootRestoreGate.InitNotReached, resumed: false,
        error: `the boot never reached ${BOOT_INIT_SYMBOL} — no write window`,
      };
    }

    // PAYLOAD FIRST, FLAG LAST — the write order IS the protocol. The window
    // is race-free (stopped machine, single-shot init), but the order rule is
    // the mailbox's contract and the engine's gate enforces it as such.
    await client.call('emulator/write_memory', { addr: hex(addrX), bytes: word(x) });
    await client.call('emulator/write_memory', { addr: hex(addrY), bytes: word(y) });
    await client.call('emulator/write_memory', { addr: hex(addrFlag), bytes: '0x01' });

    // CONTINUE, and collect the ack. The init consumes the request in the very
    // frame it was stopped at the entry of; the cleared flag is the ack and
    // the published-back X/Y are the clamped landing.
    if (opts.wasRunning) {
      await client.call('emulator/resume');
      resumed = true;
    }
    const maxPolls = opts.maxPolls ?? DEFAULT_MAX_POLLS;
    let polls = 0;
    for (; polls < maxPolls; polls++) {
      // Paused by someone else: step it ourselves rather than resuming, so a
      // deliberately stopped machine stays stopped (warpTo's precedent).
      if (!opts.wasRunning) await client.call('emulator/run_frames', { frames: 1 });
      const r = await client.call('emulator/read_memory', { addr: hex(addrFlag), len: 1 }) as { bytes: string };
      if (Number.parseInt(r.bytes.replace(/^0x/i, ''), 16) === 0) break;
    }
    if (polls >= maxPolls) {
      return {
        restored: false, resumed,
        error: `the engine never consumed the boot override within ${maxPolls} polls`,
      };
    }

    const readWord = async (addr: number): Promise<number> => {
      const r = await client.call('emulator/read_memory', { addr: hex(addr), len: 2 }) as { bytes: string };
      return Number.parseInt(r.bytes.replace(/^0x/i, ''), 16);
    };
    const landedX = await readWord(addrX);
    const landedY = await readWord(addrY);
    return {
      restored: true, resumed, polls: polls + 1,
      landed: { x: landedX, y: landedY },
      clamped: landedX !== x || landedY !== y,
    };
  } catch (e) {
    return {
      restored: false, resumed,
      gate: isMethodNotServed(e) ? BootRestoreGate.UnservedMethod : undefined,
      unservedMethod: unservedMethodOf(e) ?? undefined,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
