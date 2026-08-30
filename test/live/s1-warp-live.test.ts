// THE LIVE HALF OF PLAY-FROM-CURSOR ON CLASSIC — a FOREGROUND instrument.
//
// ==========================================================================
//  RUN IT WITH:
//
//      AURORA_LIVE_S1_WARP=1 npx vitest run test/live/s1-warp-live.test.ts
//
//  It is OPT-IN and it SKIPS WITH A MESSAGE otherwise, so `npx vitest run`
//  never starts an emulator. That is deliberate and it is not tidiness: the
//  node suite cannot see a running machine, and a background agent driving one
//  deadlocks. Nothing here may run except from a foreground session.
// ==========================================================================
//
// It spawns its OWN headless `oracle-aether` on a private mkdtemp socket. The
// default socket chain is never consulted, so it cannot touch a window someone
// is looking at.
//
// WHAT IT IS FOR. The unit suite proves the decisions: the address derivation,
// the gate selection, the result shaping, and — the load-bearing one — that a
// poke which is accepted and then reverted is reported as NOT WARPED. What it
// structurally cannot prove is that the mechanism moves Sonic in a real S1.
// This file closes that, by calling the SAME `s1WarpTo` the editor calls
// through the SAME `AetherClient`, so there is no second copy of the sequence
// to drift from the shipped one.
//
// THREE ANTI-VACUOUS GATES, each of which the spike probe earned the hard way:
//
//  1. It refuses to report anything unless `v_gamemode` actually reached a
//     level. The first version of the spike measured a "player" drifting on the
//     SEGA SCREEN and produced a perfectly clean figure describing nothing.
//  2. It settles 180 frames past entering the level before it trusts the
//     machine, because entering a level is not the level being ready.
//  3. It asserts the player MOVED, not merely that the call returned
//     `warped: true` — a result object is not a game.

import { describe, it, expect } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AetherClient } from '../../src/main/aether/client';
import { s1WarpTo, S1_SETTLE_FRAMES } from '../../src/main/aether/s1-warp';
import { parseS1ObjectOffsets } from '../../src/core/aether/s1-object-offsets';
import { referencePath } from '../support/fixture-tree';

/**
 * `id_Level`, derived from the disassembly rather than typed.
 *
 * It is a `label *-GameModeArray` behind the `gmptr` macro (sonic.asm:438-452),
 * so its value is its INDEX in that table times the 4 bytes a `bra.w` occupies.
 * Counting the entries is the whole derivation, and it goes null — never a
 * plausible default — if the table is not shaped the way this expects.
 */
function levelGameMode(s1: string): number | null {
  const src = readFileSync(join(s1, 'sonic.asm'), 'utf8');
  const table = src.slice(src.indexOf('GameModeArray:'));
  const entries = [...table.matchAll(/^(id_\w+):[ \t]+gmptr\b/gm)].map((m) => m[1]);
  const i = entries.indexOf('id_Level');
  return i < 0 ? null : i * 4;
}

/**
 * A sibling checkout that actually contains the artefact this row needs.
 *
 * The twelve-level WALK UP this replaces resolved correctly on this machine, so
 * it was never a false green — but it was one of only two routes into a peer
 * tree in the whole suite that `AURORA_<NAME>_REPO` / `AURORA_PEER_ROOT` could
 * not redirect, measured by fs-level trace on 2026-08-30
 * (`docs/reviews/2026-08-30-s1disasm-test-coupling.md`). `referencePath` is the
 * one derivation the rest of the suite uses, and it honours those overrides, so
 * this row can now be pointed at a build that lives somewhere else. The
 * REQUIREMENT is unchanged: the named artefact must be present, or the row
 * skips saying which one was not.
 */
function sibling(name: string, within: string): string | null {
  const root = referencePath(name);
  return existsSync(join(root, within)) ? root : null;
}

const OPTED_IN = process.env.AURORA_LIVE_S1_WARP === '1';
const S1 = sibling('s1disasm', 's1built.bin');
const ORACLE = sibling('oracle', 'target/release/oracle-aether');

const missing: string[] = [];
if (!OPTED_IN) missing.push('AURORA_LIVE_S1_WARP=1 not set');
if (!S1) missing.push('no sibling s1disasm with a built s1built.bin');
else if (!existsSync(join(S1, 'sonic.lst'))) missing.push('s1disasm has no sonic.lst — build it');
if (!ORACLE) missing.push('no sibling oracle with target/release/oracle-aether — cargo build --release');

const row = missing.length === 0 ? it : it.skip;
const why = missing.length === 0 ? '' : ` — SKIPPED: ${missing.join('; ')}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('play-from-cursor moves Sonic in a real S1', () => {
  row(`pokes, settles, and reports where he actually landed${why}`, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aurora-s1-live-'));
    const sock = join(dir, 'o.sock');
    let srv: ChildProcess | null = null;
    let client: AetherClient | null = null;
    try {
      srv = spawn(join(ORACLE!, 'target/release/oracle-aether'),
        [join(S1!, 's1built.bin'), '--socket', sock], { stdio: ['ignore', 'pipe', 'pipe'] });
      for (let i = 0; i < 150 && !existsSync(sock); i++) await sleep(100);
      expect(existsSync(sock), 'the headless server never created its socket').toBe(true);

      client = new AetherClient({
        connect: () => net.connect(sock) as never,
        socketPath: sock,
        log: () => {},
      });
      await client.connect();
      expect(client.status).toBe('connected');
      await client.loadSymbols(join(S1!, 'sonic.lst'));

      // ---- get into a level, DRIVEN BY THE GAME MODE ----------------------
      // Not by a guessed cadence of Start presses: that is how the spike ended
      // up measuring the SEGA screen.
      const gm = await client.resolve('v_gamemode');
      const readByte = async (addr: number): Promise<number> => {
        const r = await client!.call('emulator/read_memory', {
          addr: '0x' + (addr >>> 0).toString(16).toUpperCase(), len: 1,
        }) as { bytes: string };
        // Explicit prefix strip. A hex-character class keeps the leading '0'
        // of '0x' and shifts every byte — the spike's most expensive defect.
        return Number.parseInt(r.bytes.replace(/^0x/i, ''), 16);
      };
      const ID_LEVEL = levelGameMode(S1!);
      expect(ID_LEVEL, 'could not derive id_Level from sonic.asm\'s GameModeArray').not.toBeNull();
      let mode = -1;
      for (let k = 0; k < 60 && mode !== ID_LEVEL; k++) {
        await client.call('emulator/resume');
        await sleep(500);
        await client.call('emulator/pause');
        mode = await readByte(gm);
        if (mode === 0x00 || mode === 0x04 || mode === 0x08) {
          await client.call('emulator/press', { buttons: ['start'] });
          await client.call('emulator/run_frames', { frames: 8 });
        }
      }
      // ANTI-VACUOUS GATE 1. Every figure below would describe an intro screen.
      expect(mode, 'never reached a level — the result below would be about the title screen')
        .toBe(ID_LEVEL);

      // ANTI-VACUOUS GATE 2. Entering the level is not the level being ready:
      // S1's init clears object RAM and re-seeds Sonic, and a poke inside that
      // window is DISCARDED SILENTLY.
      await client.call('emulator/run_frames', { frames: 180 });

      const player = await client.resolve('v_player');
      // THE SAME EQUATES THE FEATURE DERIVES, read the same way, so this
      // instrument cannot disagree with the thing it is measuring.
      const off = parseS1ObjectOffsets(readFileSync(join(S1!, '_Constants.asm'), 'utf8'));
      expect(off, 'could not derive obX/obY from the checkout').not.toBeNull();
      const readWord = async (addr: number): Promise<number> => {
        const r = await client!.call('emulator/read_memory', {
          addr: '0x' + (addr >>> 0).toString(16).toUpperCase(), len: 2,
        }) as { bytes: string };
        return Number.parseInt(r.bytes.replace(/^0x/i, ''), 16);
      };
      const before = await readWord(player + off!.obX);

      // ---- THE SHIPPED CALL, not a copy of it ----------------------------
      await client.call('emulator/resume');            // as the editor finds it
      const target = { x: (before + 512) & 0xffff, y: await readWord(player + off!.obY) };
      const r = await s1WarpTo(client, target.x, target.y, { projectDir: S1! });

      expect(r.gate, `gated: ${r.error}`).toBeUndefined();
      expect(r.warped, `not warped: ${r.error}`).toBe(true);
      expect(r.from!.x).toBe(before);
      expect(r.settledFrames).toBe(S1_SETTLE_FRAMES);

      // ANTI-VACUOUS GATE 3. A result object is not a game. Ask the machine
      // again, independently of what `s1WarpTo` returned.
      await client.call('emulator/pause');
      const actually = await readWord(player + off!.obX);
      await client.call('emulator/resume');
      expect(actually, 'the reported landing disagrees with the machine').toBe(r.landed!.x);
      expect(actually, 'the player did not move at all').not.toBe(before);

      // And the machine is running again, as it was found.
      const st = await client.call('emulator/status') as { running?: boolean };
      expect(st.running).not.toBe(false);
    } finally {
      client?.disconnect();
      srv?.kill();
    }
  }, 120_000);
});
