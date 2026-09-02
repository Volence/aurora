import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { s1Adapter } from '../s1';
import type { FileAccess, ZoneActRef } from '../adapter';
import { tileLockReason } from '../editable-tiles';
import { buildUsageIndex } from '../../level-classic/usage-index';
import { buildChunkSurface } from '../../art/classic-surface-buffer';
import { planSurfaceEdit, type SurfaceWrite } from '../../art/classic-surface-plan';
import { referencePath } from '../../../../test/support/fixture-tree';
import { whenS1Act, whenS1ActReservations, whenS1Acts } from '../../../../test/support/s1-checkout';

// ---------------------------------------------------------------------------
// Task 5c, T5 — the regression test that would have caught the bug this whole
// feature exists for. The synthetic fixtures used to build/unit-test
// s1-levelart-reservations.ts and classic-surface-plan.ts contain no objects
// at all, which is exactly why the original divergence-claims-object-art bug
// was missed: nothing in the synthetic suite could ever exercise it. This
// suite opens the REAL Sonic 1 disassembly and drives the real pipeline
// end-to-end — reservedTiles() through planSurfaceEdit() — against real GHZ
// data, so a regression here means the bug is back.
//
// Skipped (not failed) when the disasm tree is absent — and, since 2026-08-30,
// when it is PRESENT BUT INCOMPLETE. The old `referenceCheckout` gate asked only
// whether the top-level markers were there; on a checkout with the markers and
// no `artnem/` (say) all three rows ran and died inside the adapter with
// `act ghz/1 unavailable: missing 2 required file(s): ghz.act1.tiles.0, …` —
// logical keys, no path, no tree, no mention that the CHECKOUT is what is wrong.
// `whenS1Act` derives each act's gating files from the same profile the adapter
// enumerates and names the absent ones.
// ---------------------------------------------------------------------------

const S1DIR = referencePath('s1disasm');

function realFs(root: string): FileAccess {
  return {
    async exists(rel) { return fs.existsSync(path.join(root, rel)); },
    async read(rel) { return new Uint8Array(fs.readFileSync(path.join(root, rel))); },
    async list(rel) { return fs.readdirSync(path.join(root, rel)); },
  };
}

/**
 * Six SurfaceWrites, one pixel each, chosen deterministically from a real
 * chunk's composed surface: the first six DISTINCT chunk cells (by
 * chunkCellIndex — i.e. six different 16x16 block placements, not just six
 * different 8x8 sub-cells of the same block) whose current tile is used by
 * more than one block cell (`index.tileUsage(...).cells > 1`) and is
 * editable. Painting each with a value that differs from what is already
 * there (9, chosen because GHZ's real tile data never legitimately produces
 * an all-9s nibble run at these positions — verified by the divergence
 * actually firing, asserted below) forces isolate mode to diverge all six:
 * a shared tile can never be repainted in place, so each write must either
 * find a byte-identical match elsewhere or claim a fresh slot.
 */
function sixSharedTileDivergences(
  provenance: ReturnType<typeof buildChunkSurface>['provenance'],
  index: ReturnType<typeof buildUsageIndex>,
  isEditableTile: (t: number) => boolean,
): SurfaceWrite[] {
  const writes: SurfaceWrite[] = [];
  const seenChunkCells = new Set<number>();
  for (let i = 0; i < provenance.cells.length && writes.length < 6; i++) {
    const c = provenance.cells[i];
    if (c.tileIndex === 0) continue; // transparent tile — never a real divergence target
    if (index.tileUsage(c.tileIndex).cells <= 1) continue; // not shared — would just write in place
    if (!isEditableTile(c.tileIndex)) continue;
    if (c.chunkCellIndex === null || seenChunkCells.has(c.chunkCellIndex)) continue;
    seenChunkCells.add(c.chunkCellIndex);
    const cx = i % provenance.cellsX;
    const cy = Math.floor(i / provenance.cellsX);
    writes.push({ x: cx * 8, y: cy * 8, value: 9 });
  }
  return writes;
}

describe('object-aware tile claimability, real s1disasm', () => {
  it(
    'GHZ act 1: reservedTiles covers the platform run and stays out of a six-divergence isolate plan',
    // Not `whenS1Act`: this row's subject is the RESERVATION SET, which is built
    // from `_maps/*.asm` files that are not profile entries at all, so no
    // act-derived guard can see them and a missing one is tolerated into a
    // smaller set (O45 — `expected 48 to be greater than or equal to 150`).
    whenS1ActReservations('ghz', 1),
    async () => {
      const handle = await s1Adapter.open(realFs(S1DIR));
      const ghz1 = handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1)!;
      const doc = await handle.levels!.read(ghz1);
      const reserved = handle.levels!.reservedTiles!(ghz1)!;
      expect(reserved).not.toBeNull();

      // 1 — the platform run and the design's floor.
      for (let t = 0x3b; t <= 0x4a; t++) {
        expect(reserved.has(t), `tile 0x${t.toString(16)} should be reserved (GHZ platform run)`).toBe(true);
      }
      expect(reserved.size).toBeGreaterThanOrEqual(150);
      // Measured against the real disasm: 158 tiles, 0x3B..0xE4. Pinned exactly
      // (not just the >=150 floor) so a change in this number is visible and
      // has to be explained, rather than silently drifting.
      expect(reserved.size).toBe(158);
      const sorted = [...reserved].sort((a, b) => a - b);
      expect(sorted[0]).toBe(0x3b);
      expect(sorted[sorted.length - 1]).toBe(0xe4);

      // 2 — six forced divergences in isolate mode must never claim a
      // reserved slot as the new home for a diverging copy.
      const index = buildUsageIndex(doc);
      const range = handle.levels!.editableTileRange!(ghz1)!;
      const isEditableTile = (t: number) => tileLockReason(range, t) === null;
      const { provenance } = buildChunkSurface(doc, 0);
      const writes = sixSharedTileDivergences(provenance, index, isEditableTile);
      expect(writes).toHaveLength(6);

      const withReservations = planSurfaceEdit({
        doc, provenance, index, mode: 'isolate', isEditableTile, writes, reservedTiles: reserved,
      });
      expect(withReservations.ok).toBe(true);
      if (!withReservations.ok) return;
      expect(withReservations.plan.tileWrites.length).toBeGreaterThan(0);
      for (const w of withReservations.plan.tileWrites) {
        expect(reserved.has(w.tileIndex), `claimed tile 0x${w.tileIndex.toString(16)} must not be reserved`).toBe(
          false,
        );
      }

      // 3 — THE PLANTED VIOLATION, permanent. The identical six-divergence run
      // with `reservedTiles` omitted DOES claim a reserved tile: measured
      // today, the 5th claim (index 4) lands on 0x3B, the very first tile of
      // the GHZ platform run. This is the regression the whole feature exists
      // to prevent — assert it fires so this test keeps proving something. If
      // this ever stops claiming a reserved tile, something upstream changed
      // (the chosen writes, the resolver's search order, ...) and it needs to
      // be understood before this assertion is ever loosened or removed.
      const withoutReservations = planSurfaceEdit({
        doc, provenance, index, mode: 'isolate', isEditableTile, writes,
      });
      expect(withoutReservations.ok).toBe(true);
      if (!withoutReservations.ok) return;
      expect(withoutReservations.plan.tileWrites[4]?.tileIndex).toBe(0x3b);
      expect(withoutReservations.plan.tileWrites.some((w) => reserved.has(w.tileIndex))).toBe(true);
    },
  );

  // 4 — LZ act 1 and SBZ act 3 share LZ's tile/block/chunk files, and SBZ
  // act 3's object $6B (the ancient lift / sliding door) draws
  // ArtTile_Level+$1F0 through `_maps/SBZ Stomper and Door.asm` frame 0 (see
  // s1-levelart-reservations.ts's SBZ_STOMPER_AND_DOOR) — verified directly
  // against `_incObj/6B SBZ Stomper and Sliding Door.asm` line 67. The
  // design (2026-08-15 plan, "Measured, real s1disasm") predicted this
  // reserves {0x39F..0x3AD} in BOTH lz act 1 and sbz act 3.
  //
  // MEASURED, NOT AS PREDICTED: both acts' real on-disk level-art pool
  // (`artnem/8x8 - LZ.nem`, the only tile file either act's profile entry
  // names — see LZ_TILES in profiles/s1.ts) decodes to exactly 454 tiles,
  // i.e. [0, 0x1C6). 0x39F (927) is entirely outside that pool, so
  // `buildReservedTileSet`'s `[0, poolTileCount)` clamp (by design — the same
  // clamp `planSurfaceEdit`'s own findFreeSlot/findContentMatch bounds use)
  // drops the door's whole reservation. Measured: reservedTiles(lz act 1) and
  // reservedTiles(sbz act 3) are BOTH THE EMPTY SET, not a set covering
  // {0x39F..0x3AD}.
  //
  // This does not (currently) understate real risk: the same pool-size bound
  // that drops the reservation also bounds every place `planSurfaceEdit` can
  // read or write a tile index, so index 927 is equally unreachable by any
  // edit either way — nothing in Aurora's current model of these two acts can
  // touch it, reserved or not. It DOES mean the extra VRAM content SBZ3 DMAs
  // over LZ's base art at runtime (wherever in the ROM that turns out to
  // live — it is not among the PLC/animatedArt entries this profile models
  // for either zone) is invisible to Aurora entirely, which is a real gap if
  // Aurora's model of either zone's tile pool is ever widened later.
  //
  // Reported per the task brief rather than adjusting the assertion to pass:
  // this pins the ACTUAL behavior today, not the design's prediction.
  it(
    'LZ act 1 and SBZ act 3: the shared-file door reservation is clamped away by both acts’ 454-tile pool, not present',
    whenS1Acts(['lz', 1], ['sbz', 3]),
    async () => {
      const handle = await s1Adapter.open(realFs(S1DIR));

      const lz1 = handle.levels!.list().find((r) => r.zone === 'lz' && r.act === 1)!;
      const lzDoc = await handle.levels!.read(lz1);
      expect(Math.floor(lzDoc.tiles.length / 32)).toBe(454);
      const lzReserved = handle.levels!.reservedTiles!(lz1)!;
      expect(lzReserved.size).toBe(0);

      const sbz3ref: ZoneActRef = handle.levels!.list().find((r) => r.zone === 'sbz' && r.act === 3)!;
      expect(sbz3ref.available).toBe(true);
      const sbzDoc = await handle.levels!.read(sbz3ref);
      expect(Math.floor(sbzDoc.tiles.length / 32)).toBe(454);
      const sbzReserved = handle.levels!.reservedTiles!(sbz3ref)!;
      expect(sbzReserved.size).toBe(0);
    },
  );
  /**
   * U7 (ERR-A3). A mappings .asm that is THERE and unreadable used to be folded
   * into the same answer as one that is absent: the request was skipped and the
   * set came back NON-NULL BUT INCOMPLETE. `reservedTiles` has a documented
   * "not known" spelling — null — that both planners refuse under, and a
   * quietly-short set defeats it: the allocator then hands out tiles an object
   * sprite is still drawing through.
   */
  it(
    'a present-but-unreadable mappings .asm reports NOT KNOWN, not an empty reservation',
    whenS1Act('ghz', 1),
    async () => {
      const real = realFs(S1DIR);
      let refusedOne = false;
      const fa: FileAccess = {
        ...real,
        async read(rel) {
          // Exactly the class of failure a permissions bit or a locked file
          // produces: exists() says yes, read() throws.
          if (rel.endsWith('.asm') && rel.startsWith('_maps/')) { refusedOne = true; throw new Error('EACCES'); }
          return real.read(rel);
        },
      };
      const handle = await s1Adapter.open(fa);
      const ghz1 = handle.levels!.list().find((r) => r.zone === 'ghz' && r.act === 1)!;
      await handle.levels!.read(ghz1);
      expect(refusedOne, 'the fixture never hit a mappings file — the act reserves nothing').toBe(true);
      expect(handle.levels!.reservedTiles!(ghz1)).toBeNull();
    },
  );
});
