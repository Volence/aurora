/**
 * One live palette push, from an editor line to a running game.
 *
 * The geometry and the write ORDER live in `core/aether/palette-push.ts`
 * (pure, and the thing the unit tests pin). This module owns the parts that
 * need a connection: gating, symbol resolution, the pause window, and never
 * leaving the machine stopped.
 */

import type { AetherClient } from './client';
import {
  planPalettePush, planPalettePushWordsFor,
  type PalettePushPlan, type PalettePushKind,
} from '../../core/aether/palette-push';
import type { Color } from '../../core/model/types';

export enum PaletteGateReason {
  Disconnected = 'disconnected',
  NoMethod = 'no-write-memory',
  NoSymbols = 'no-symbols',
  /** Line 0 is the character palette; `Pal_Base` does not include it. */
  LineZero = 'line-0',
}

export interface PalettePushResult {
  pushed: boolean;
  gate?: PaletteGateReason;
  error?: string;
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
    return { pushed: false, gate: PaletteGateReason.NoMethod };
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
    return {
      pushed: false,
      gate: PaletteGateReason.NoSymbols,
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
  try {
    for (const w of plan.writes) {
      await client.call('emulator/write_memory', {
        addr: addrOf(w.symbol, w.offset),
        bytes: hexBytes(w.bytes),
      });
    }
    return { pushed: true };
  } catch (e) {
    return { pushed: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    if (shouldResume) {
      try { await client.call('emulator/resume'); } catch { /* a dead link is already reported */ }
    }
  }
}
