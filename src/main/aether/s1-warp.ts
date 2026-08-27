/**
 * Play-from-cursor on the CLASSIC (s1disasm) path — the twin of `warp.ts`.
 *
 * aeon grew a supported interface for this: a DEBUG mailbox the engine consumes
 * at frame top, which does the rebase and the cache reseed inside the frame
 * boundary and publishes the clamped destination back. S1 has nothing of the
 * kind, in any build flavour. There is no mailbox to add without changing the
 * disassembly, so the only route is poking the player's position on a running
 * machine — and that is a route with a measured hazard rather than a hunch.
 *
 * WHAT WAS MEASURED (docs/reviews/2026-08-27-s1-vplayer-spike.md, instrument
 * scratchpad/s1-vplayer-spike-probe.mjs; one checkpoint, control run twice and
 * required to be identical first):
 *
 *   - A player poked from x=80 to x=592 HOLDS at 592, drift 0 over 60 frames,
 *     with a state hash that differs from the control. The engine does not
 *     fight the poke.
 *   - THE CAMERA FOLLOWS ON ITS OWN: 0 -> 160 -> 320 -> 432 over ~30 frames,
 *     leaving the player centred. Nothing has to drive it.
 *   - The hazard is the WRITE WINDOW, and IT FAILS SILENTLY. Poked at the
 *     instant `v_gamemode` becomes 0x0C, the write reads back correctly and is
 *     then discarded: S1's level init clears object RAM and re-seeds Sonic from
 *     the start-position table, and the machine ends BYTE-IDENTICAL to the
 *     control. Entering a level is not the level being ready.
 *
 * ⚠ THIS DOES NOT POKE THE CAMERA, and the reason is stronger here than on
 * aeon. `warp.ts`'s header records that writing `Camera_X`/`Camera_Y` directly
 * tears badly — 699 of 2048 nametable words wrong, ~150 frames of visibly wrong
 * background. On S1 the measurement above says the camera follows by itself, so
 * touching it would buy nothing and cost that.
 *
 * THE SHAPE, ruled as decision d-15(b): POKE, LET IT SETTLE, READ BACK WHERE
 * THE PLAYER ACTUALLY ENDED UP, AND SURFACE THAT. The reasoning is that it
 * turns every unmeasured failure mode into a visible one. Only `x` on GHZ act 1
 * with the player at rest was ever measured; into a wall, mid-air, in a loop or
 * mid-roll is not, and S1 resolves collision against whatever position it is
 * handed. A design that reported the ASK would be confidently wrong in exactly
 * the cases nobody has measured.
 *
 * And it pays for the init hazard for free: comparing the read-back against the
 * PRE-POKE position detects the init discard and a collision ejection with one
 * mechanism, so there is no separate init-window guard here to rot alongside it.
 * What that cannot see is written down at `classify` below.
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { AetherClient } from './client';
import { WarpGateReason } from './warp';
import { MethodNotServedError, isMethodNotServed, unservedMethodOf } from './unserved';
import {
  parseS1ObjectOffsets, S1_OFFSET_SOURCE, type S1ObjectOffsets,
} from '../../core/aether/s1-object-offsets';

/** The one symbol this needs from the listing. `v_player` is a label, so it resolves. */
export const S1_PLAYER_SYMBOL = 'v_player';

/**
 * Frames to let the game run between the poke and the read-back.
 *
 * Both bounds come from the spike, not from taste:
 *
 *   - the init discard was visible TEN FRAMES after the poke, so anything at or
 *     under 10 can read back a position the engine is about to throw away;
 *   - the camera finished following in ROUGHLY 30 FRAMES, so at 30 the
 *     read-back is taken after the visible transition rather than in the middle
 *     of it, and the half-second the user waits is the pan they were going to
 *     watch anyway.
 *
 * The poke itself was measured stable at every 10-frame sample out to 60, so 30
 * sits inside the band where the answer had already stopped changing.
 *
 * `run_frames` rather than resume-and-sleep ON PURPOSE. A wall-clock settle is
 * the exact shape the spike warned about: it would work on a fast machine and
 * fail on a slow one, and its failure mode is a silent no-op.
 */
export const S1_SETTLE_FRAMES = 30;

/**
 * Mirrors `WarpResult`. `landed` means the same thing it means there — WHERE
 * THE PLAYER ACTUALLY IS — but it is arrived at differently: aeon's engine
 * publishes its own clamped destination, and S1 is simply asked afterwards.
 */
export interface S1WarpResult {
  warped: boolean;
  gate?: WarpGateReason;
  error?: string;
  /** Set when the failure was "the server does not serve this" — names which. */
  unservedMethod?: string;
  /** Where the player actually is once the game has had its turn. */
  landed?: { x: number; y: number };
  /** Where he was before the poke. The discard signature is `landed === from`. */
  from?: { x: number; y: number };
  /** True when the game moved him off the destination — worth telling the user. */
  clamped?: boolean;
  /** How many frames were run before believing the read-back. */
  settledFrames?: number;
}

export interface S1WarpOptions {
  /** The classic project's root — the disassembly checkout Aurora has open. */
  projectDir: string;
  settleFrames?: number;
  /**
   * Seam for the `_Constants.asm` read. Defaults to the filesystem; the tests
   * hand text in, so every decision this file makes is testable without one.
   */
  readConstants?: (dir: string) => string | null;
}

const hex = (n: number) => '0x' + (n >>> 0).toString(16).toUpperCase();
const word = (v: number) => '0x' + (v & 0xffff).toString(16).padStart(4, '0');

/** Read the disassembly's constants file, or null if it is not there to read. */
function readConstantsFromDisk(dir: string): string | null {
  try {
    return readFileSync(join(dir, S1_OFFSET_SOURCE.file), 'utf8');
  } catch {
    return null;
  }
}

export async function s1WarpTo(
  client: AetherClient,
  x: number,
  y: number,
  opts: S1WarpOptions,
): Promise<S1WarpResult> {
  if (client.status !== 'connected') {
    return { warped: false, gate: WarpGateReason.Disconnected };
  }

  // Checked before the wire, as the aeon twin does. S1 object positions are
  // 16-bit words; a caller handing us something bigger has a bug we should not
  // silently truncate into a poke somewhere else in the act.
  for (const [name, v] of [['x', x], ['y', y]] as const) {
    if (!Number.isInteger(v)) {
      return { warped: false, error: `warp ${name}=${v} is not an integer` };
    }
    if (v < 0 || v > 0xffff) {
      return { warped: false, error: `warp ${name}=${v} is out of range 0-65535` };
    }
  }

  // THE OFFSETS FIRST, because this is the gate that needs no machine at all.
  // Discovering it after a pause would leave a stopped emulator behind a
  // failure that never had anything to do with the emulator.
  const source = (opts.readConstants ?? readConstantsFromDisk)(opts.projectDir);
  const offsets: S1ObjectOffsets | null = source === null ? null : parseS1ObjectOffsets(source);
  if (offsets === null) {
    return {
      warped: false,
      gate: WarpGateReason.NoOffsets,
      error:
        `could not read ${S1_OFFSET_SOURCE.x}/${S1_OFFSET_SOURCE.y} from ` +
        `${join(opts.projectDir, S1_OFFSET_SOURCE.file)} — they are equates, so they come from the ` +
        'disassembly rather than from the ROM\'s symbols',
    };
  }

  let base: number;
  try {
    base = await client.resolve(S1_PLAYER_SYMBOL);
  } catch (e) {
    // TWO DIFFERENT FAILURES LAND HERE, exactly as in `warp.ts`, and they have
    // different answers. A ROM with no listing loaded simply cannot say where
    // `v_player` is — the fix is the listing. `lookup_symbol` being UNSERVED is
    // not a fact about the ROM at all, and reporting it as "no symbols" sends
    // the user to rebuild a disassembly that was never the problem.
    const unserved = unservedMethodOf(e);
    return {
      warped: false,
      gate: unserved !== null ? WarpGateReason.UnservedMethod : WarpGateReason.NoSymbols,
      unservedMethod: unserved ?? undefined,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // ASKED BEFORE THE PAUSE. Derived from oracle a1bee6e
  // (crates/oracle-aether/src/engine.rs): `write_memory` (:2400) and
  // `run_frames` (:2008) are both `require_paused`; `read_memory`, `pause` and
  // `resume` are not. So the sequence NEEDS `pause` to be able to write and to
  // run frames at all, and finding a gap halfway would leave a machine paused
  // with half a poke in it.
  for (const m of [
    'emulator/pause', 'emulator/write_memory', 'emulator/read_memory', 'emulator/run_frames',
  ] as const) {
    if (!client.hasMethod(m)) {
      // The wording comes from the error class, not from a second copy of the
      // sentence — a guard that matches on it is matching ONE rule.
      return {
        warped: false,
        gate: WarpGateReason.UnservedMethod,
        unservedMethod: m,
        error: new MethodNotServedError(m, 'advertised-list', client.server?.name).message,
      };
    }
  }

  const settleFrames = opts.settleFrames ?? S1_SETTLE_FRAMES;
  const addrX = base + offsets.obX;
  const addrY = base + offsets.obY;
  const readWord = async (addr: number): Promise<number> => {
    const r = await client.call('emulator/read_memory', { addr: hex(addr), len: 2 }) as { bytes: string };
    // ⚠ The prefix is stripped by an EXPLICIT check, never by a hex-character
    // class: `'0x0250'.replace(/[^0-9a-fA-F]/g,'')` drops the `x` and KEEPS the
    // leading `0`, shifting every byte. That defect cost the spike a whole
    // debugging pass and it reported clean, confident, wrong numbers while it
    // was there.
    return Number.parseInt(r.bytes.replace(/^0x/i, ''), 16);
  };
  const readPos = async () => ({ x: await readWord(addrX), y: await readWord(addrY) });

  const pauseResult = await client.call('emulator/pause') as { wasRunning?: boolean };
  const wasRunning = pauseResult?.wasRunning !== false;
  let result: S1WarpResult;
  /** A resume the server could not perform leaves the machine STOPPED. */
  let resumeFailure: string | null = null;

  try {
    // WHERE HE WAS. Read on the paused machine, before the poke, because it is
    // half of the read-back comparison: without it a discarded poke and a
    // successful one are indistinguishable from outside.
    const from = await readPos();

    await client.call('emulator/write_memory', { addr: hex(addrX), bytes: word(x) });
    await client.call('emulator/write_memory', { addr: hex(addrY), bytes: word(y) });

    // AND THE GAME GETS A TURN. The write reading back is not the feature
    // working — that is precisely the measured failure. Only a position that
    // has survived the level init and the collision resolver is worth
    // reporting.
    await client.call('emulator/run_frames', { frames: settleFrames });

    const landed = await readPos();
    result = classify({ x, y }, from, landed, settleFrames);
  } catch (e) {
    result = {
      warped: false,
      unservedMethod: unservedMethodOf(e) ?? undefined,
      gate: isMethodNotServed(e) ? WarpGateReason.UnservedMethod : undefined,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    // Put the machine back the way it was found. `wasRunning` is the courtesy
    // the multi-client bus needs: an unconditional resume starts a machine a
    // debugger session deliberately stopped.
    //
    // A DEAD LINK here is nothing to do — the machine is gone and whatever
    // killed it is already in `result`. An UNSERVED `resume` is the opposite:
    // the link is fine, the machine is alive, and it is STOPPED because of us.
    if (wasRunning) {
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

/**
 * Turn three positions into an answer.
 *
 * WHAT THIS COVERS. Every way the poke can fail that leaves the player
 * somewhere other than the destination — the level-init discard, an ejection
 * out of solid ground, a snap down onto a floor, a player who was moving when
 * the key was pressed and has kept moving. All of them come out as a position
 * the caller can show, rather than as a confident echo of the ask.
 *
 * WHAT IT CANNOT COVER, and these are real:
 *
 *  - **A poke while the game is not in a level at all.** `v_player` is a live
 *    object on the title screen too (sonic.asm:2077 moves it), so a poke there
 *    lands, holds, and reads back as a clean success while the user sees
 *    nothing. Nothing in these three numbers distinguishes that; the gate that
 *    would is a game-mode check, and it is deliberately absent because the
 *    measured discard happens AT mode 0x0C, so a mode gate would not have
 *    covered the hazard it looks like it covers.
 *  - **An init discard that happens to re-seed him where he already was.** If
 *    the pre-poke position IS the start position, a discard and a genuine hold
 *    at that spot are the same three numbers. The user sees "did not take" and
 *    the truth is "did not take", so the report is right by luck rather than by
 *    construction.
 *  - **Anything that goes wrong later than the settle budget.** A poke into a
 *    wall that takes S1 forty frames to unwind reads back mid-unwind.
 */
function classify(
  asked: { x: number; y: number },
  from: { x: number; y: number },
  landed: { x: number; y: number },
  settledFrames: number,
): S1WarpResult {
  const base = { landed, from, settledFrames };
  // ASKED FIRST, and the order is load-bearing: warping to the spot the player
  // already stands on makes `landed === from` true, and checking the discard
  // signature first would report that no-op as a silent failure.
  if (landed.x === asked.x && landed.y === asked.y) {
    return { ...base, warped: true, clamped: false };
  }
  if (landed.x === from.x && landed.y === from.y) {
    return {
      ...base,
      warped: false,
      clamped: false,
      error:
        `the poke did not take — the player is back at (${from.x}, ${from.y}), where he started. ` +
        'S1 re-seeds Sonic from the start position table while the act is still loading, and a ' +
        'poke in that window is discarded silently. Try again once the act is running.',
    };
  }
  return { ...base, warped: true, clamped: true };
}

/** Named once so the string is not repeated where it has to agree with itself. */
const unservedResumeMethod = 'emulator/resume';
