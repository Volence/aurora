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

export const WARP_SYMBOLS = ['Warp_Req_X', 'Warp_Req_Y', 'Warp_Req_Flag'] as const;

export enum WarpGateReason {
  Disconnected = 'disconnected',
  /** A release ROM: the mailbox is DEBUG-shape only. */
  NoSymbols = 'no-symbols',
}

export interface WarpResult {
  warped: boolean;
  gate?: WarpGateReason;
  error?: string;
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
    // A release build simply does not carry these. Grey the feature out; never
    // fall back to a literal address, which in a release ROM would be pointing
    // at whatever else now lives there.
    return {
      warped: false,
      gate: WarpGateReason.NoSymbols,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const maxPolls = opts.maxPolls ?? DEFAULT_MAX_POLLS;
  const readWord = async (addr: number): Promise<number> => {
    const r = await client.call('emulator/read_memory', { addr: hex(addr), len: 2 }) as { bytes: string };
    return Number.parseInt(r.bytes.replace(/^0x/i, ''), 16);
  };

  try {
    // Frame-top consumption makes this tear-free by construction, so unlike the
    // palette push there is no pause window here and the game never stutters.
    await client.call('emulator/write_memory', { addr: hex(addrX), bytes: word(x) });
    await client.call('emulator/write_memory', { addr: hex(addrY), bytes: word(y) });
    await client.call('emulator/write_memory', { addr: hex(addrFlag), bytes: '0x01' });

    let polls = 0;
    for (; polls < maxPolls; polls++) {
      const r = await client.call('emulator/read_memory', { addr: hex(addrFlag), len: 1 }) as { bytes: string };
      if (Number.parseInt(r.bytes.replace(/^0x/i, ''), 16) === 0) break;
    }
    if (polls >= maxPolls) {
      return { warped: false, polls, error: `the engine did not acknowledge the warp within ${maxPolls} polls` };
    }

    const landedX = await readWord(addrX);
    const landedY = await readWord(addrY);
    return {
      warped: true,
      polls: polls + 1,
      landed: { x: landedX, y: landedY },
      clamped: landedX !== x || landedY !== y,
    };
  } catch (e) {
    return { warped: false, error: e instanceof Error ? e.message : String(e) };
  }
}
