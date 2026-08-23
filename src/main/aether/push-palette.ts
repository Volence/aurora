/**
 * One live palette push, from an editor line to a running game.
 *
 * The geometry and the write ORDER live in `core/aether/palette-push.ts`
 * (pure, and the thing the unit tests pin). This module owns the parts that
 * need a connection: gating, symbol resolution, the pause window, and never
 * leaving the machine stopped.
 */

import type { AetherClient } from './client';
import { MethodNotServedError, isMethodNotServed, unservedMethodOf } from './unserved';
import {
  planPalettePush, planPalettePushWordsFor,
  type PalettePushPlan, type PalettePushKind,
} from '../../core/aether/palette-push';
import type { Color } from '../../core/model/types';

export enum PaletteGateReason {
  Disconnected = 'disconnected',
  NoMethod = 'no-write-memory',
  NoSymbols = 'no-symbols',
  /**
   * Some OTHER method this push needs is not served — `lookup_symbol`,
   * `pause`, `resume`. Kept apart from `NoSymbols` because "your ROM has no
   * palette symbols" is a claim about the ROM, and a client that makes it when
   * the real answer is "this server cannot look symbols up" has invented a
   * diagnosis. `unservedMethod` says which.
   */
  UnservedMethod = 'unserved-method',
  /** Line 0 is the character palette; `Pal_Base` does not include it. */
  LineZero = 'line-0',
}

export interface PalettePushResult {
  pushed: boolean;
  gate?: PaletteGateReason;
  error?: string;
  /** Set when the failure was "the server does not serve this" — names which. */
  unservedMethod?: string;
}

const hex = (n: number) => '0x' + (n >>> 0).toString(16).toUpperCase();
const hexBytes = (b: Uint8Array) => '0x' + Buffer.from(b).toString('hex');

/**
 * Push a line held as editor CRAM words — the path the UI actually uses.
 *
 * `kind` selects the geometry: aeon writes `Pal_Base` (lines 1-3) then raises
 * the dirty flag; classic writes the line's own `v_palette_line_N` symbol
 * (lines 0-3, no flag — S1's VBlank re-DMAs unconditionally). The kind is the
 * OPEN PROJECT's, not a probe of the ROM: if the running ROM is the other
 * family, its listing simply lacks the symbols and the push gates NoSymbols —
 * resolution IS the detection (contract D7; nothing here hardcodes addresses).
 */
export function pushPaletteWords(
  client: AetherClient,
  line: number,
  words: readonly number[],
  kind: PalettePushKind = 'aeon',
): Promise<PalettePushResult> {
  return pushPlanned(client, line, () => planPalettePushWordsFor(kind, line, words));
}

/** Push a line held as `Color`s. (aeon-only caller today) */
export function pushPaletteLine(
  client: AetherClient,
  line: number,
  colors: readonly Color[],
): Promise<PalettePushResult> {
  return pushPlanned(client, line, () => planPalettePush(line, colors));
}

async function pushPlanned(
  client: AetherClient,
  line: number,
  build: () => PalettePushPlan,
): Promise<PalettePushResult> {
  if (client.status !== 'connected') {
    return { pushed: false, gate: PaletteGateReason.Disconnected };
  }
  if (!client.hasMethod('emulator/write_memory')) {
    // The pre-existing gate, kept at its own reason so the UI copy that already
    // reads it does not change meaning — but now it NAMES the method too.
    return {
      pushed: false,
      gate: PaletteGateReason.NoMethod,
      unservedMethod: 'emulator/write_memory',
      error: new MethodNotServedError('emulator/write_memory', 'advertised-list', client.server?.name).message,
    };
  }
  // The push also NEEDS these, and learning it after the pause is how a machine
  // gets left stopped. `lookup_symbol` in particular: without it the resolution
  // below fails and the old code called that "no symbols", which names the ROM
  // for something the server did.
  for (const m of ['emulator/lookup_symbol', 'emulator/pause', 'emulator/resume'] as const) {
    if (!client.hasMethod(m)) {
      return {
        pushed: false,
        gate: PaletteGateReason.UnservedMethod,
        unservedMethod: m,
        error: new MethodNotServedError(m, 'advertised-list', client.server?.name).message,
      };
    }
  }

  // Planned BEFORE anything touches the wire, so a line-0 push is refused
  // without pausing the machine for a write that will not happen.
  let plan: PalettePushPlan;
  try {
    plan = build();
  } catch (e) {
    return {
      pushed: false,
      gate: line === 0 ? PaletteGateReason.LineZero : undefined,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  // EVERY symbol the plan names, or nothing. A ROM built without them — the
  // other engine family, a stripped build, a future rename — greys the feature
  // out; it never writes into a guessed address, which is the whole point of
  // contract D7.
  const addrs = new Map<string, number>();
  try {
    for (const s of plan.symbols) addrs.set(s, await client.resolve(s));
  } catch (e) {
    // A ROM built without them greys the feature out. `lookup_symbol` being
    // unserved does NOT — that is the server, not the ROM, and it gets its own
    // gate so nobody goes rebuilding a listing that was always fine.
    const unserved = unservedMethodOf(e);
    return {
      pushed: false,
      gate: unserved !== null ? PaletteGateReason.UnservedMethod : PaletteGateReason.NoSymbols,
      unservedMethod: unserved ?? undefined,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  const addrOf = (symbol: string, offset: number) => hex((addrs.get(symbol) ?? 0) + offset);

  // `write_memory` is require_paused. The machine must go back to WHATEVER IT
  // WAS DOING afterwards, including when a write throws.
  //
  // Note `wasRunning` rather than an unconditional resume. The bus is
  // multi-client: a debugger, a harness or a person may have the machine
  // deliberately paused, and an unconditional resume would start it running
  // underneath them the first time an artist nudged a slider. This harness
  // caught exactly that — an observer client had paused the machine, the push
  // resumed it, and the observer's next call was refused `machineRunning`.
  const pauseResult = await client.call('emulator/pause') as { wasRunning?: boolean };
  const shouldResume = pauseResult?.wasRunning !== false;
  let result: PalettePushResult;
  /** A resume the server could not perform leaves the machine STOPPED. */
  let resumeFailure: string | null = null;
  try {
    for (const w of plan.writes) {
      await client.call('emulator/write_memory', {
        addr: addrOf(w.symbol, w.offset),
        bytes: hexBytes(w.bytes),
      });
    }
    result = { pushed: true };
  } catch (e) {
    result = {
      pushed: false,
      gate: isMethodNotServed(e) ? PaletteGateReason.UnservedMethod : undefined,
      unservedMethod: unservedMethodOf(e) ?? undefined,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    if (shouldResume) {
      try {
        await client.call('emulator/resume');
      } catch (e) {
        // A DEAD LINK is already reported by whatever killed it, and there is
        // no machine left to un-freeze. An UNSERVED `resume` is a live machine
        // that WE stopped and cannot start again — the artist's next drag lands
        // on a frozen game, and silence here is what makes that inexplicable.
        if (isMethodNotServed(e)) resumeFailure = (e as Error).message;
      }
    }
  }
  if (resumeFailure !== null) {
    return {
      ...result,
      unservedMethod: result.unservedMethod ?? 'emulator/resume',
      error: [result.error, `the machine was left PAUSED: ${resumeFailure}`].filter(Boolean).join('; '),
    };
  }
  return result;
}
