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

const S1DIR = '/home/volence/sonic_hacks/s1disasm';

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
      // Object ids are 7-bit.
      expect(id, tag).toBeGreaterThanOrEqual(0);
      expect(id, tag).toBeLessThanOrEqual(0x7f);
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

  describe.skipIf(!fs.existsSync(S1DIR))('against real s1disasm', () => {
    it('every linked art + mappings file exists on disk', () => {
      const missing: string[] = [];
      for (const { where, id, link } of allLinks()) {
        // LevelArt has no on-disk art file (sentinel) — only its mappings exist.
        const files = link.artSource === 'levelArt' ? [link.mapAsm] : [link.artFile, link.mapAsm];
        for (const rel of files) {
          if (!fs.existsSync(path.join(S1DIR, rel))) missing.push(`${where}:$${id.toString(16)} → ${rel}`);
        }
      }
      expect(missing, `missing files:\n${missing.join('\n')}`).toEqual([]);
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
