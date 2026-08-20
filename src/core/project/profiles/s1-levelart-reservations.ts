// Which level-pool tile indices a Sonic 1 object's sprite reads, per zone.
//
// WHY THIS EXISTS: some S1 objects (GHZ Platforms, Collapsing Ledge, MZ Grass
// Platform + Bricks, SYZ Light/Platform/Block, SLZ Platform/Elevator/Circling
// Platform/Staircase, …) draw their sprite from the ACT'S OWN level-art tile
// pool (`artSource: 'levelArt'` in s1-object-art.ts) rather than a standalone
// art file. `buildUsageIndex` only walks blocks/chunks, so these tiles look
// unreferenced there — but overwriting one corrupts saved, permanent object
// art. This module computes the set of pool indices those sprites can read,
// so `classic-surface-plan.ts` can refuse to claim them as "free".
//
// RESERVED TILES STAY EDITABLE IN PLACE. Painting platform art is a feature;
// this is NOT a lock (see editable-tiles.ts for the real lock predicate). It
// is a third, additive rule enforced by the caller: never claim a reserved
// slot as a free slot, and always diverge away from one instead of writing it
// in place. This module only computes the set — it does not enforce anything.
//
// Pure core: no fs, no DOM. Mapping ASM texts are passed in by the caller
// (the s1 adapter reads them during `levels.read()`); this module only parses
// already-read text via `parseAsmMappings`.
//
// DERIVATION (per the design, docs/superpowers/plans/2026-08-15-art-authoring-
// phase1-paint-through.md "Task 5c — object-aware tile claimability"):
//   • Derived — for each `id ∈ linkedObjectIds(zone)` whose
//     `resolveObjectArt(id, zone).artSource === 'levelArt'`, one request with
//     `tileBase = -(link.tileIndexOffset ?? 0)`, ALL frames (subtype only
//     changes which frame draws, never the mapAsm/artSource — see the design's
//     "why zone-static holds"; taking every frame also covers frames the ROM
//     animates that Aurora never previews).
//   • Supplemental — engine truth the id → art table cannot see (found by
//     grepping `ArtTile_Level` across s1disasm/_incObj), verified directly
//     against the disasm source for this module:
//       - (RETIRED by the boss-sprites sweep) syz `_maps/SYZ Boss Blocks.asm`:
//         object $76 (id_BossBlock, spawned by boss $75, _incObj/"75, 76 Boss -
//         SYZ Main and Blocks.asm":753-754) used to need a supplemental entry
//         because it was unlinked; it is now a syz `lvl()` row in
//         s1-object-art.ts, so the DERIVED pass finds it (base 0, all frames —
//         identical tiles to the old supplemental).
//       - lz (every act) and sbz act 3 only: `_maps/SBZ Stomper and
//         Door.asm`, base 0x1F0, frame 0 only. Object $6B
//         (_incObj/"6B SBZ Stomper and Sliding Door.asm") draws
//         `ArtTile_Level+$1F0` for its ".isSBZ3" ancient-lift/door branch,
//         taken when `v_zone == id_LZ` — i.e. SBZ3, the engine's "LZ act 4".
//         SBZ3 borrows LZ's tile/block/chunk files, so editing LZ act 1/2
//         (in the profile's own `lz` zone) can corrupt SBZ3's door.

import { resolveObjectArt, linkedObjectIds } from './s1-object-art';
import { parseAsmMappings } from '../../import/asm-mappings';

/** One request to reserve the tiles a mappings file's pieces read. */
export interface LevelArtReservationRequest {
  /** Disasm-relative mappings path (matches ObjectArtLink.mapAsm). */
  mapAsm: string;
  /** Pool index of mappings tile 0 (engine base − tileIndexOffset). */
  tileBase: number;
  /** Restrict to these frame indices; undefined = every frame in the file. */
  frames?: readonly number[];
  /** Contributing object ids, for messaging and tests. */
  ids: readonly number[];
}

const SBZ_STOMPER_AND_DOOR: LevelArtReservationRequest = {
  mapAsm: '_maps/SBZ Stomper and Door.asm', tileBase: 0x1f0, frames: [0], ids: [0x6b],
};

/**
 * The zone-static reservation requests for `(zone, act)`. Not placement-,
 * subtype-, or preview-frame-dependent — see the module doc.
 */
export function levelArtReservationRequests(zone: string, act: number): LevelArtReservationRequest[] {
  const out: LevelArtReservationRequest[] = [];

  for (const id of linkedObjectIds(zone)) {
    const link = resolveObjectArt(id, zone);
    if (!link || link.artSource !== 'levelArt') continue;
    out.push({
      mapAsm: link.mapAsm,
      // `+ 0` normalises a `-0` (when tileIndexOffset is absent) to `+0`, same
      // convention as composeObjectFrames in object-sprite.ts.
      tileBase: -(link.tileIndexOffset ?? 0) + 0,
      ids: [id],
    });
  }

  if (zone === 'lz' || (zone === 'sbz' && act === 3)) out.push(SBZ_STOMPER_AND_DOOR);

  return out;
}

/**
 * Union the tile indices `requests` read out of `mapTextByPath`, clamped to
 * `[0, poolTileCount)`. A request whose mapping text is missing from
 * `mapTextByPath` contributes nothing (permissive, matching the
 * `editableTileRange` null convention) rather than throwing.
 */
export function buildReservedTileSet(
  requests: readonly LevelArtReservationRequest[],
  mapTextByPath: ReadonlyMap<string, string>,
  poolTileCount: number,
): { tiles: ReadonlySet<number>; byTile: ReadonlyMap<number, readonly number[]> } {
  const tiles = new Set<number>();
  const byTile = new Map<number, Set<number>>();

  for (const req of requests) {
    const text = mapTextByPath.get(req.mapAsm);
    if (text === undefined) continue;
    const allFrames = parseAsmMappings(text);
    const frames = req.frames ? req.frames.map((i) => allFrames[i]).filter((f) => f !== undefined) : allFrames;

    for (const frame of frames) {
      for (const piece of frame.pieces) {
        const cellCount = piece.widthCells * piece.heightCells;
        for (let k = 0; k < cellCount; k++) {
          const idx = req.tileBase + piece.tile + k;
          if (idx < 0 || idx >= poolTileCount) continue;
          tiles.add(idx);
          let ids = byTile.get(idx);
          if (!ids) { ids = new Set<number>(); byTile.set(idx, ids); }
          for (const id of req.ids) ids.add(id);
        }
      }
    }
  }

  const byTileOut = new Map<number, readonly number[]>();
  for (const [idx, ids] of byTile) byTileOut.set(idx, [...ids].sort((a, b) => a - b));

  return { tiles, byTile: byTileOut };
}
