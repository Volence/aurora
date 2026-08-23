/**
 * Play-from-cursor — warp the running game to a point in the act.
 *
 * THIS DOES NOT POKE THE CAMERA. An earlier design wrote `Camera_X`/`Camera_Y`
 * and `Player_1` directly; measured, that tears badly. aeon's tile cache latches
 * its streaming direction from per-frame camera deltas, so a teleport hands it a
 * huge spurious delta and mis-latches: at a 2048px jump, 699 of 2048 plane-A
 * nametable words disagreed with the same destination reached by walking, and it
 * took ~150 frames (~2.5s) of visibly wrong background to reconcile.
 * (`scratchpad/warp-tearing-harness.mjs` is that measurement.)
 *
 * So the engine grew a supported interface instead — a DEBUG mailbox consumed at
 * frame top, which performs the rebase and cache/plane reseed inside the frame
 * boundary. The streaming rules stay on the engine's side of the wall, where
 * they can change without silently rotting a poke sequence in this file.
 *
 * Protocol (aeon master 6c341697, pinned by its owner):
 *   write Warp_Req_X (u16 world px), Warp_Req_Y (u16), then Warp_Req_Flag = 1
 *   LAST — a torn read must never act on half a destination. The engine clears
 *   the flag when it has consumed the request, so flag == 0 is the ack, and it
 *   publishes the CLAMPED destination back into X/Y so a caller can report
 *   where the player actually landed.
 */

import type { AetherClient } from './client';
import { MethodNotServedError, isMethodNotServed, unservedMethodOf } from './unserved';

export const WARP_SYMBOLS = ['Warp_Req_X', 'Warp_Req_Y', 'Warp_Req_Flag'] as const;

export enum WarpGateReason {
  Disconnected = 'disconnected',
  /** A release ROM: the mailbox is DEBUG-shape only. */
  NoSymbols = 'no-symbols',
  /**
   * The SERVER cannot do this, and it is not the ROM's fault. Distinct from
   * `NoSymbols` on purpose: greying the warp out as "release ROM" when the
   * truth is "this server does not serve lookup_symbol" hands the user a
   * plausible, documented, wrong explanation — and the ROM they are told to
   * rebuild is not the thing that changed.
   */
  UnservedMethod = 'unserved-method',
}

export interface WarpResult {
  warped: boolean;
  gate?: WarpGateReason;
  error?: string;
  /** Set when the failure was "the server does not serve this" — names which. */
  unservedMethod?: string;
  /** Where the engine says the player actually is, after its own clamping. */
  landed?: { x: number; y: number };
  /** True when the engine moved the destination — worth telling the user. */
  clamped?: boolean;
  /** How many flag reads the ack took. Useful when tuning the poll budget. */
  polls?: number;
}

/**
 * The engine's gate run measured a 21-frame ack on a cross-section warp, most
 * of it the reseed settling. 120 polls is comfortably past that without being
 * an unbounded wait if a build ever stops answering.
 */
const DEFAULT_MAX_POLLS = 120;

const hex = (n: number) => '0x' + (n >>> 0).toString(16).toUpperCase();
const word = (v: number) => '0x' + (v & 0xffff).toString(16).padStart(4, '0');

export async function warpTo(
  client: AetherClient,
  x: number,
  y: number,
  opts: { maxPolls?: number } = {},
): Promise<WarpResult> {
  if (client.status !== 'connected') {
    return { warped: false, gate: WarpGateReason.Disconnected };
  }

  // Checked before the wire. The protocol carries u16 world pixels; today's
  // acts sit well under that, and floating-origin exists to keep runtime world
  // coordinates 16-bit even when mega-acts land. A caller handing us something
  // bigger has a bug we should not silently truncate into a warp somewhere else.
  for (const [name, v] of [['x', x], ['y', y]] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) {
      return { warped: false, error: `warp ${name}=${v} is out of range 0-65535` };
    }
  }

  let addrX: number, addrY: number, addrFlag: number;
  try {
    [addrX, addrY, addrFlag] = await Promise.all(WARP_SYMBOLS.map((s) => client.resolve(s)));
  } catch (e) {
    // TWO DIFFERENT FAILURES LAND HERE, and they have different answers.
    //
    // A release build simply does not carry these symbols. Grey the feature
    // out; never fall back to a literal address, which in a release ROM would
    // be pointing at whatever else now lives there.
    //
    // But `lookup_symbol` itself being unserved is not a fact about the ROM at
    // all, and reporting it as "no symbols" sends the user to rebuild a ROM
    // that was never the problem.
    const unserved = unservedMethodOf(e);
    return {
      warped: false,
      gate: unserved !== null ? WarpGateReason.UnservedMethod : WarpGateReason.NoSymbols,
      unservedMethod: unserved ?? undefined,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const maxPolls = opts.maxPolls ?? DEFAULT_MAX_POLLS;
  const readWord = async (addr: number): Promise<number> => {
    const r = await client.call('emulator/read_memory', { addr: hex(addr), len: 2 }) as { bytes: string };
    return Number.parseInt(r.bytes.replace(/^0x/i, ''), 16);
  };

  // `write_memory` IS require_paused, mailbox or not. Frame-top consumption
  // makes the warp itself tear-free, but the write that requests it still has
  // to happen on a stopped machine — the first version of this skipped the
  // pause on that reasoning and every warp failed with
  // "needs the machine paused; call emulator/pause first".
  //
  // ASKED BEFORE THE PAUSE, not discovered after it. If the server does not
  // serve one of the three methods this sequence needs, the sequence cannot
  // complete — and finding that out halfway leaves a machine paused with a
  // half-written mailbox in it.
  for (const m of ['emulator/pause', 'emulator/write_memory', 'emulator/read_memory'] as const) {
    if (!client.hasMethod(m)) {
      // The wording comes from the error class, not from a second copy of the
      // sentence — a guard that matches on it must be matching ONE rule.
      return {
        warped: false,
        gate: WarpGateReason.UnservedMethod,
        unservedMethod: m,
        error: new MethodNotServedError(m, 'advertised-list', client.server?.name).message,
      };
    }
  }

  const pauseResult = await client.call('emulator/pause') as { wasRunning?: boolean };
  const wasRunning = pauseResult?.wasRunning !== false;
  let resumed = false;
  let result: WarpResult;
  /** A resume the server could not perform leaves the machine STOPPED. */
  let resumeFailure: string | null = null;

  try {
    await client.call('emulator/write_memory', { addr: hex(addrX), bytes: word(x) });
    await client.call('emulator/write_memory', { addr: hex(addrY), bytes: word(y) });
    await client.call('emulator/write_memory', { addr: hex(addrFlag), bytes: '0x01' });

    // AND THE MACHINE HAS TO RUN TO CONSUME IT. The engine takes the request at
    // frame top, so polling a paused machine waits forever — the second failure
    // this sequence produced was "did not acknowledge within 120 polls", from
    // polling a machine that could not advance.
    //
    // `read_memory` is a pure read with no pause gate, so the flag can be
    // watched while the game runs.
    if (wasRunning) {
      await client.call('emulator/resume');
      resumed = true;
    }

    let polls = 0;
    for (; polls < maxPolls; polls++) {
      // Paused by someone else: step it ourselves rather than resuming, so a
      // deliberately stopped machine stays stopped.
      if (!wasRunning) await client.call('emulator/run_frames', { frames: 1 });
      const r = await client.call('emulator/read_memory', { addr: hex(addrFlag), len: 1 }) as { bytes: string };
      if (Number.parseInt(r.bytes.replace(/^0x/i, ''), 16) === 0) break;
    }
    if (polls >= maxPolls) {
      result = { warped: false, polls, error: `the engine did not acknowledge the warp within ${maxPolls} polls` };
    } else {
      const landedX = await readWord(addrX);
      const landedY = await readWord(addrY);
      result = {
        warped: true,
        polls: polls + 1,
        landed: { x: landedX, y: landedY },
        clamped: landedX !== x || landedY !== y,
      };
    }
  } catch (e) {
    result = {
      warped: false,
      unservedMethod: unservedMethodOf(e) ?? undefined,
      gate: isMethodNotServed(e) ? WarpGateReason.UnservedMethod : undefined,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    // Put the machine back the way it was found. A warp that quietly leaves the
    // game stopped looks like the warp hung.
    //
    // A DEAD LINK here is genuinely nothing to do: the machine is gone, and the
    // failure that killed it is already in `result`. An UNSERVED `resume` is
    // the opposite — the link is fine, the machine is alive, and it is STOPPED
    // because of us. That cannot be swallowed, so it is appended to the result
    // even when the warp itself succeeded.
    if (wasRunning && !resumed) {
      try {
        await client.call('emulator/resume');
      } catch (e) {
        if (isMethodNotServed(e)) resumeFailure = (e as Error).message;
        /* else: a dead link is already reported by whatever killed it */
      }
    }
  }
  if (resumeFailure !== null) {
    return {
      ...result,
      unservedMethod: result.unservedMethod ?? unservedResumeMethod,
      error: [result.error, `the machine was left PAUSED: ${resumeFailure}`].filter(Boolean).join('; '),
    };
  }
  return result;
}

/** Named once so the string is not repeated where it has to agree with itself. */
const unservedResumeMethod = 'emulator/resume';
