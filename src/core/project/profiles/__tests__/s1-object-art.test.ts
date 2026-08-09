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
      // Art file: artnem/*.nem (nemesis) or artunc/*.unc (uncompressed).
      if (link.compression === 'nemesis') {
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
        for (const rel of [link.artFile, link.mapAsm]) {
          if (!fs.existsSync(path.join(S1DIR, rel))) missing.push(`${where}:$${id.toString(16)} → ${rel}`);
        }
      }
      expect(missing, `missing files:\n${missing.join('\n')}`).toEqual([]);
    });
  });
});
