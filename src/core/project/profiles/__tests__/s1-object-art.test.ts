import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  S1_OBJECT_ART_BASE,
  S1_OBJECT_ART_ZONE,
  resolveObjectArt,
  linkedObjectIds,
  type ObjectArtLink,
} from '../s1-object-art';
import { objectHasSubtypeRule } from '../object-subtype-rules';
import { referenceCheckout, referenceCheckoutReason, referencePath, S1_PINNED } from '../../../../../test/support/fixture-tree';

const S1DIR = referencePath(S1_PINNED);
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason(S1_PINNED);

function allLinks(): { where: string; id: number; link: ObjectArtLink }[] {
  const out: { where: string; id: number; link: ObjectArtLink }[] = [];
  for (const [id, link] of Object.entries(S1_OBJECT_ART_BASE)) {
    out.push({ where: 'base', id: Number(id), link });
  }
  for (const [zone, map] of Object.entries(S1_OBJECT_ART_ZONE)) {
    for (const [id, link] of Object.entries(map)) out.push({ where: zone, id: Number(id), link });
  }
  return out;
}

describe('s1-object-art linkage table', () => {
  it('every entry has a plausible, disasm-relative shape', () => {
    for (const { where, id, link } of allLinks()) {
      const tag = `${where}:$${id.toString(16)}`;
      // Object ids live in the disasm object index (obID is a byte; the index
      // runs to $8C — _inc/Object Pointers.asm:156). Placeable objpos ids stop
      // at $7F, but the FZ/SBZ2 boss actors $82-$86 are linked for their
      // sprite docs.
      expect(id, tag).toBeGreaterThanOrEqual(0);
      expect(id, tag).toBeLessThanOrEqual(0x8c);
      // artSource is always one of the two known kinds (B6).
      expect(['file', 'levelArt'], tag).toContain(link.artSource);
      if (link.artSource === 'levelArt') {
        // LevelArt draws from doc.tiles: sentinel art file, no real path on disk.
        expect(link.artFile, tag).toBe('LevelArt');
      } else if (link.compression === 'nemesis') {
        // Art file: artnem/*.nem (nemesis) or artunc/*.unc (uncompressed).
        expect(link.artFile, tag).toMatch(/^artnem\/.+\.nem$/);
      } else {
        expect(link.artFile, tag).toMatch(/^artunc\/.+\.unc$/);
      }
      // Mappings are _maps/*.asm.
      expect(link.mapAsm, tag).toMatch(/^_maps\/.+\.asm$/);
      // No path escapes.
      expect(link.artFile.includes('..'), tag).toBe(false);
      expect(link.mapAsm.includes('..'), tag).toBe(false);
      // Frame is a non-negative int; palette line is 0..3.
      expect(Number.isInteger(link.frame) && link.frame >= 0, tag).toBe(true);
      expect(link.pal, tag).toBeGreaterThanOrEqual(0);
      expect(link.pal, tag).toBeLessThanOrEqual(3);
      // tileIndexOffset, when present, is an integer (tiles = byte offset / 32).
      if (link.tileIndexOffset !== undefined) {
        expect(Number.isInteger(link.tileIndexOffset), tag).toBe(true);
      }
    }
  });

  it('resolveObjectArt: zone overrides win over base; unknown ids are undefined', () => {
    // $1C is GHZ "Bridge stump" but SLZ "Fireball Thrower" — different art.
    const ghz1c = resolveObjectArt(0x1c, 'ghz');
    const slz1c = resolveObjectArt(0x1c, 'slz');
    expect(ghz1c?.artFile).toContain('GHZ Bridge');
    expect(slz1c?.artFile).toContain('SLZ Cannon');
    // A base id (Monitor) resolves in any zone.
    expect(resolveObjectArt(0x26, 'lz')?.artFile).toContain('Monitors');
    // Crabmeat is zone-scoped: present in GHZ, absent in MZ (no Crabmeat there).
    expect(resolveObjectArt(0x1f, 'ghz')).toBeDefined();
    expect(resolveObjectArt(0x1f, 'mz')).toBeUndefined();
    // A never-linked id falls through to undefined (hex-box fallback).
    expect(resolveObjectArt(0x0e, 'ghz')).toBeUndefined();
  });

  it('links the remaining straightforward badniks (Newtron/Jaws/Orbinaut/Ball Hog)', () => {
    expect(resolveObjectArt(0x42, 'ghz')?.artFile).toContain('Newtron'); // GHZ
    expect(resolveObjectArt(0x42, 'ghz')?.frame).toBe(3); // img1 = frame 3
    expect(resolveObjectArt(0x2c, 'lz')?.artFile).toContain('Jaws'); // LZ
    expect(resolveObjectArt(0x60, 'lz')?.artFile).toContain('Orbinaut'); // LZ
    expect(resolveObjectArt(0x60, 'slz')?.pal).toBe(1); // SLZ startpal 1
    expect(resolveObjectArt(0x1e, 'sbz')?.artFile).toContain('Ball Hog'); // SBZ
  });

  it('links the B5 sweep additions (rule + static) across zones', () => {
    // Rule objects gained a base art link so their composite can render.
    expect(resolveObjectArt(0x11, 'ghz')?.mapAsm).toContain('Bridge'); // Bridge
    expect(resolveObjectArt(0x15, 'ghz')?.artFile).toContain('Swinging Platform'); // Swinging Platform
    expect(resolveObjectArt(0x44, 'ghz')?.artFile).toContain('Edge Wall'); // Wall Barrier
    expect(resolveObjectArt(0x3c, 'ghz')?.artFile).toContain('Breakable Wall'); // GHZ Breakable Wall
    // New static single-frame links.
    expect(resolveObjectArt(0x0b, 'lz')?.artFile).toContain('Breakable Pole'); // LZ Pole
    expect(resolveObjectArt(0x16, 'lz')?.frame).toBe(3); // Harpoon default = vertical (frame 3)
    expect(resolveObjectArt(0x64, 'lz')?.frame).toBe(19); // Bubbles (img1 = frame 19)
    expect(resolveObjectArt(0x32, 'mz')?.artFile).toContain('MZ Switch'); // MZ Switch
    expect(resolveObjectArt(0x6d, 'sbz')?.frame).toBe(9); // SBZ Flamethrower (frame 9)
    expect(resolveObjectArt(0x52, 'sbz')?.pal).toBe(1); // SBZ stomper (frame2special, pal 1)
    expect(resolveObjectArt(0x5d, 'slz')?.artFile).toContain('Fan'); // SLZ Fan
  });

  it('B6: LevelArt objects are linked with artSource=levelArt (tiles from doc.tiles)', () => {
    // GHZ Platform ($18) + Collapsing Cliff ($1A).
    const plat = resolveObjectArt(0x18, 'ghz');
    expect(plat?.artSource).toBe('levelArt');
    expect(plat?.artFile).toBe('LevelArt');
    expect(plat?.mapAsm).toContain('Platforms (GHZ)');
    expect(resolveObjectArt(0x1a, 'ghz')?.artSource).toBe('levelArt');
    // MZ Grass Platform ($2F) + Brick ($46).
    expect(resolveObjectArt(0x2f, 'mz')?.artSource).toBe('levelArt');
    expect(resolveObjectArt(0x46, 'mz')?.mapAsm).toContain('MZ Bricks');
    // SLZ Platform/Elevator/Circling/Stairs.
    expect(resolveObjectArt(0x18, 'slz')?.artSource).toBe('levelArt');
    expect(resolveObjectArt(0x59, 'slz')?.mapAsm).toContain('Elevators');
    expect(resolveObjectArt(0x5a, 'slz')?.mapAsm).toContain('Circling');
    expect(resolveObjectArt(0x5b, 'slz')?.mapAsm).toContain('Staircase');
    // SYZ Siren Light ($12, frame 1) + Platform ($18) + Block ($56).
    expect(resolveObjectArt(0x12, 'syz')?.mapAsm).toContain('Light');
    expect(resolveObjectArt(0x12, 'syz')?.frame).toBe(1);
    expect(resolveObjectArt(0x18, 'syz')?.artSource).toBe('levelArt');
    expect(resolveObjectArt(0x56, 'syz')?.mapAsm).toContain('Floating Blocks');
  });

  it('B6: offset-art objects carry the tile-index shift (byte offset / 32)', () => {
    // Common Switch ($32) offset=-128 → -4 tiles, in LZ/SBZ/SYZ.
    for (const zone of ['lz', 'sbz', 'syz']) {
      const sw = resolveObjectArt(0x32, zone);
      expect(sw?.artFile, zone).toContain('Switch.nem');
      expect(sw?.artSource, zone).toBe('file');
      expect(sw?.tileIndexOffset, zone).toBe(-4);
    }
    // MZ $32 is a DIFFERENT switch (own art, no offset) — must NOT be shifted.
    expect(resolveObjectArt(0x32, 'mz')?.artFile).toContain('MZ Switch');
    expect(resolveObjectArt(0x32, 'mz')?.tileIndexOffset).toBeUndefined();
    // LZ Block/Cork ($61) default = Cork, offset=9024 → +282 tiles.
    const cork = resolveObjectArt(0x61, 'lz');
    expect(cork?.artFile).toContain('LZ Cork.nem');
    expect(cork?.frame).toBe(2);
    expect(cork?.tileIndexOffset).toBe(282);
  });

  it('linkedObjectIds includes the base ids plus the zone overrides', () => {
    const ghz = linkedObjectIds('ghz');
    expect(ghz).toContain(0x26); // Monitor (base)
    expect(ghz).toContain(0x1f); // Crabmeat (ghz)
    expect(ghz).not.toContain(0x2d); // Burrobot is LZ-only
    // Ascending, unique.
    expect([...ghz].sort((a, b) => a - b)).toEqual(ghz);
    expect(new Set(ghz).size).toBe(ghz.length);
  });

  describe('against real s1disasm', { skip: !referenceCheckout(S1_PINNED), meta: { skipReason: S1_ABSENT } }, () => {
    it('every linked art + mappings file exists on disk', () => {
      const missing: string[] = [];
      for (const { where, id, link } of allLinks()) {
        // LevelArt has no on-disk art file (sentinel) — only its mappings exist.
        const files = link.artSource === 'levelArt' ? [link.mapAsm] : [link.artFile, link.mapAsm];
        for (const rel of files) {
          if (!fs.existsSync(path.join(S1DIR, rel))) missing.push(`${where}:$${id.toString(16)} → ${rel}`);
        }
      }
      // ⚠ ANCHOR ROW — this one does not skip on an incomplete checkout either:
      // "every linked file exists on disk" is precisely the proposition, so a
      // missing `artnem/` is a real red. Before 2026-08-30 the message listed
      // REPO-RELATIVE paths and no root, so it never said which tree was short.
      expect(
        missing,
        `${missing.length} linked art/mappings file(s) are absent under ${S1DIR}. If this whole `
        + 'list is one directory, that is an INCOMPLETE s1disasm checkout rather than a broken '
        + `link table:\n${missing.join('\n')}`,
      ).toEqual([]);
    });
  });
});

describe('red-box sweep closeout (post-B6)', () => {
  it('links the SonLVL-less MZ objects transcribed from the disasm source', () => {
    expect(resolveObjectArt(0x31, 'mz')?.artFile).toContain('MZ Metal Blocks'); // Chained Stompers
    expect(resolveObjectArt(0x31, 'mz')?.pal).toBe(0); // no Tile_Pal bits → line 0
    expect(resolveObjectArt(0x4c, 'mz')?.artFile).toContain('MZ Lava'); // Lava Geyser Maker
    expect(resolveObjectArt(0x4c, 'mz')?.pal).toBe(3); // Tile_Pal4 → line 3
  });

  it('links the SLZ stairway block as LevelArt frame 5 with the FBlock rule', () => {
    const link = resolveObjectArt(0x56, 'slz');
    expect(link?.artSource).toBe('levelArt');
    expect(link?.frame).toBe(5); // SLZ subtypes are $5x/$Dx → (subtype&0x70)>>4 = 5
    expect(objectHasSubtypeRule(0x56, 'slz')).toBe(true);
  });

  it('aliases the LZ links + rules into sbz for SBZ3 (the engine LZ act 4)', () => {
    for (const id of [0x0c, 0x16, 0x2c, 0x2d, 0x56, 0x57, 0x61, 0x62, 0x64]) {
      expect(resolveObjectArt(id, 'sbz'), `sbz $${id.toString(16)}`).toBeDefined();
      expect(resolveObjectArt(id, 'sbz')).toBe(resolveObjectArt(id, 'lz')); // identical link objects
    }
    expect(objectHasSubtypeRule(0x61, 'sbz')).toBe(true); // Block/Cork variants
  });

  it('links the formerly name-only SBZ machines from the disasm source', () => {
    expect(resolveObjectArt(0x6b, 'sbz')?.artFile).toContain('SBZ Stomper'); // Stomper and Door
    expect(resolveObjectArt(0x6f, 'sbz')?.mapAsm).toContain('SBZ Spinning Platforms'); // Platform Conveyor
    // $66 Rotating Junction stays a red box: a true multi-art composite.
    expect(resolveObjectArt(0x66, 'sbz')).toBeUndefined();
  });
});

// --- boss-family rows (transcribed from the disasm source; no SonLVL objdefs) --

import { parseAsmMappings } from '../../../import/asm-mappings';

/** Every boss-family link: [tag, zone-or-undefined, id]. */
const BOSS_ROWS: readonly [string, string | undefined, number][] = [
  ['GHZ boss', undefined, 0x3d],
  ['Wrecking Ball', undefined, 0x48],
  ['MZ boss', undefined, 0x73],
  ['Boss Fire', 'mz', 0x74],
  ['SYZ boss', undefined, 0x75],
  ['Boss Block', 'syz', 0x76],
  ['LZ boss', undefined, 0x77],
  ['SLZ boss', undefined, 0x7a],
  ['Boss Spikeball', undefined, 0x7b],
  ['SBZ2 Eggman', undefined, 0x82],
  ['Crumbling Floor', undefined, 0x83],
  ['FZ Cylinder', undefined, 0x84],
  ['FZ Eggman', undefined, 0x85],
  ['FZ Plasma Launcher', undefined, 0x86],
];

describe('boss-family art rows', () => {
  it('the five zone bosses share ONE Eggman ship link (Nem_Eggman via PLC_Boss, Map_Eggman frame 0, line 0)', () => {
    const ghz = resolveObjectArt(0x3d);
    expect(ghz?.artFile).toBe('artnem/Boss - Main.nem');
    expect(ghz?.mapAsm).toBe('_maps/Eggman.asm');
    expect(ghz?.frame).toBe(0); // .ship
    expect(ghz?.pal).toBe(0); // ArtTile_Eggman carries no Tile_Pal bits
    for (const id of [0x73, 0x75, 0x77, 0x7a]) {
      expect(resolveObjectArt(id), `$${id.toString(16)}`).toBe(ghz); // the SAME link object
    }
  });

  it('the boss sub-objects and FZ/SBZ2 actors carry their cited art/maps/palette', () => {
    // $48 leads with the BALL: Map_GBall @ ArtTile_GHZ_Giant_Ball|Tile_Pal3
    // (_incObj/3D, 48 …:479-480) → Nem_Ball, palette line 2 (Tile_Pal3 equ
    // 2<<13, _Constants.asm:438). Frame 0 = .shiny (in-game alternates 0/1).
    expect(resolveObjectArt(0x48)?.artFile).toBe('artnem/GHZ Giant Ball.nem');
    expect(resolveObjectArt(0x48)?.mapAsm).toBe('_maps/GHZ Ball.asm');
    expect(resolveObjectArt(0x48)?.frame).toBe(0);
    expect(resolveObjectArt(0x48)?.pal).toBe(2);
    // $7B: Map_SSawBall frame 1 (.silver — `move.b #1,obFrame`, _incObj 7A,7B:536).
    expect(resolveObjectArt(0x7b)?.artFile).toBe('artnem/SLZ Little Spikeball.nem');
    expect(resolveObjectArt(0x7b)?.mapAsm).toBe('_maps/Seesaw Ball.asm');
    expect(resolveObjectArt(0x7b)?.frame).toBe(1);
    // $82/$85 both draw Nem_Sbz2Eggman through Map_SEgg (PLC_EggmanSBZ2:433 /
    // PLC_FZBoss:444 load the same binclude at different tiles).
    for (const id of [0x82, 0x85]) {
      expect(resolveObjectArt(id)?.artFile, `$${id.toString(16)}`).toBe('artnem/Boss - Eggman in SBZ2 & FZ.nem');
      expect(resolveObjectArt(id)?.mapAsm, `$${id.toString(16)}`).toBe('_maps/Eggman - Scrap Brain 2.asm');
    }
    // $83: ArtTile_Eggman_Trap_Floor|Tile_Pal3 → palette line 2.
    expect(resolveObjectArt(0x83)?.artFile).toBe('artnem/SBZ Vanishing Block.nem');
    expect(resolveObjectArt(0x83)?.pal).toBe(2);
    // $84/$86: both on Nem_FzBoss (ArtTile_FZ_Boss, line 0), different maps.
    expect(resolveObjectArt(0x84)?.artFile).toBe('artnem/Boss - Final Zone.nem');
    expect(resolveObjectArt(0x84)?.mapAsm).toBe("_maps/FZ Eggman's Cylinders.asm");
    expect(resolveObjectArt(0x86)?.artFile).toBe('artnem/Boss - Final Zone.nem');
    expect(resolveObjectArt(0x86)?.mapAsm).toBe('_maps/Plasma Ball Launcher.asm');
    // $74 (mz): Map_Fire @ ArtTile_MZ_Fireball (line 0), Nem_MzFire.
    expect(resolveObjectArt(0x74, 'mz')?.artFile).toBe('artnem/Fireballs.nem');
    expect(resolveObjectArt(0x74, 'mz')?.mapAsm).toBe('_maps/Fireballs.asm');
    expect(resolveObjectArt(0x74)).toBeUndefined(); // zone-scoped: no base entry
    // $76 (syz): LevelArt @ ArtTile_Level|Tile_Pal3 → line 2.
    expect(resolveObjectArt(0x76, 'syz')?.artSource).toBe('levelArt');
    expect(resolveObjectArt(0x76, 'syz')?.pal).toBe(2);
    expect(resolveObjectArt(0x76)).toBeUndefined();
  });

  describe('against real s1disasm', { skip: !referenceCheckout(S1_PINNED), meta: { skipReason: S1_ABSENT } }, () => {
    it('every boss mapAsm parses and the linked default frame exists', () => {
      for (const [tag, zone, id] of BOSS_ROWS) {
        const link = resolveObjectArt(id, zone)!;
        expect(link, tag).toBeDefined();
        const text = fs.readFileSync(path.join(S1DIR, link.mapAsm), 'utf8');
        const frames = parseAsmMappings(text);
        expect(frames.length, `${tag} (${link.mapAsm})`).toBeGreaterThan(0);
        expect(link.frame, `${tag} default frame in range`).toBeLessThan(frames.length);
        // The default frame must actually draw something (not a blank frame).
        expect(frames[link.frame].pieces.length, `${tag} frame ${link.frame} has pieces`).toBeGreaterThan(0);
      }
    });

    it('frame counts match the hand-derived transcriptions (Eggman ship + Boss Items)', () => {
      // HAND-DERIVED from the mappingsTable headers, never from the parser:
      //   _maps/Eggman.asm — 13 mappingsTableEntry rows: .ship, .facenormal1,
      //     .facenormal2, .facelaugh1, .facelaugh2, .facehit, .facepanic,
      //     .facedefeat, .flame1, .flame2, .blank, .escapeflame1, .escapeflame2.
      const eggman = parseAsmMappings(fs.readFileSync(path.join(S1DIR, '_maps/Eggman.asm'), 'utf8'));
      expect(eggman.length).toBe(13);
      //   _maps/Boss Items.asm — 8 rows: .chainanchor1, .chainanchor2, .cross,
      //     .widepipe, .pipe, .spike, .legmask, .legs. (The chain anchor Obj48
      //     draws in its own slot — no longer any doc's lead frame.)
      const items = parseAsmMappings(fs.readFileSync(path.join(S1DIR, '_maps/Boss Items.asm'), 'utf8'));
      expect(items.length).toBe(8);
      // .chainanchor1 is the single 2x2 piece at tile 0 of Nem_Weapons.
      expect(items[0].pieces.length).toBe(1);
      expect(items[0].pieces[0].tile).toBe(0);
      //   _maps/GHZ Ball.asm ($48's doc) — 4 rows: .shiny, .check1, .check2,
      //     .check3. HAND-DERIVED piece counts: .shiny = 6 (two 2x1 shine
      //     pieces at tile $24 + four 3x3 quadrants of tile 0, h/v-flipped),
      //     .check1/2/3 = 4 quadrants each.
      const ball = parseAsmMappings(fs.readFileSync(path.join(S1DIR, '_maps/GHZ Ball.asm'), 'utf8'));
      expect(ball.length).toBe(4);
      expect(ball.map((f) => f.pieces.length)).toEqual([6, 4, 4, 4]);
    });
  });
});

// --- zone-free classification (the "Ring is not stored per zone" measurement) --
//
// The distinction is measured against the disasm, not assumed: a zone-free id's
// art is ONE shared file. Ring's Nem_Ring is a single binclude (sonic.asm:4682)
// queued by PLC_Main (_inc/Pattern Load Cues.asm:77), the cue list every level
// loads; Moto Bug's Nem_Motobug is queued only by PLC_GHZ (line 116). The
// classifier answers from the transcribed maps: in base AND overridden nowhere.

import { objectArtIsZoneFree } from '../s1-object-art';

describe('objectArtIsZoneFree', () => {
  it('Ring ($25), Monitor ($26) and Signpost ($0d) are zone-free: base-linked, never overridden', () => {
    expect(objectArtIsZoneFree(0x25)).toBe(true);
    expect(objectArtIsZoneFree(0x26)).toBe(true);
    expect(objectArtIsZoneFree(0x0d)).toBe(true);
  });

  it('zone-scoped ids are NOT zone-free: Moto Bug ($40, ghz-only) and the per-zone $1c/$53', () => {
    expect(objectArtIsZoneFree(0x40)).toBe(false);
    expect(objectArtIsZoneFree(0x1c)).toBe(false); // GHZ Bridge stump vs SLZ Fireball Thrower
    expect(objectArtIsZoneFree(0x53)).toBe(false); // different art in MZ/SLZ/SBZ
  });

  it('unlinked ids are not zone-free (there is nothing to open)', () => {
    expect(objectArtIsZoneFree(0x02)).toBe(false);
    expect(objectArtIsZoneFree(0x71)).toBe(false); // Invisible Block — deliberately unlinked
  });

  it('every zone-boss id is zone-free (shared PLC_Boss/PLC_EggmanSBZ2/PLC_FZBoss bincludes, base-linked, never overridden)', () => {
    // Art provenance per id is cited on the rows themselves; the shared lists:
    // PLC_Boss (_inc/Pattern Load Cues.asm:285-290) for $3D/$73/$75/$77/
    // $7A/$7B, PLC_EggmanSBZ2 (:432-434) for $82/$83, PLC_FZBoss (:441-445)
    // for $84/$85/$86. $48's Nem_Ball rides PLC_GHZ2 (:126) but is ONE
    // standalone binclude (sonic.asm:4502) — the classifier measures "one
    // shared art file, never overridden per zone", which still holds.
    for (const id of [0x3d, 0x48, 0x73, 0x75, 0x77, 0x7a, 0x7b, 0x82, 0x83, 0x84, 0x85, 0x86]) {
      expect(objectArtIsZoneFree(id), `$${id.toString(16)}`).toBe(true);
    }
    // The two zone-scoped boss parts are NOT: $74's Nem_MzFire rides PLC_MZ
    // (:173) and $76 is LevelArt (the act's own tile pool).
    expect(objectArtIsZoneFree(0x74)).toBe(false);
    expect(objectArtIsZoneFree(0x76)).toBe(false);
  });

  it('agrees with resolveObjectArt across every zone: a zone-free id resolves IDENTICALLY everywhere', () => {
    const zones = Object.keys(S1_OBJECT_ART_ZONE);
    for (const id of Object.keys(S1_OBJECT_ART_BASE).map(Number)) {
      if (!objectArtIsZoneFree(id)) continue;
      const base = resolveObjectArt(id, undefined);
      for (const z of zones) {
        expect(resolveObjectArt(id, z), `id $${id.toString(16)} in ${z}`).toBe(base);
      }
    }
  });
});
