import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  resolveObjectPieces,
  resolveEffectiveObjectArt,
  objectHasSubtypeRule,
  objectArtKey,
  ruleObjectIdsAnyZone,
} from '../object-subtype-rules';
import { resolveObjectArt } from '../s1-object-art';
import { referenceCheckout, referenceCheckoutReason, referencePath, S1_PINNED } from '../../../../../test/support/fixture-tree';

const S1DIR = referencePath(S1_PINNED);
/** Why the rows below skip when they skip — read by scripts/skip-report-reporter.mjs. */
const S1_ABSENT = referenceCheckoutReason(S1_PINNED);

describe('object-subtype-rules', () => {
  describe('objectHasSubtypeRule / objectArtKey', () => {
    it('rule objects report a rule; rule-less ids do not', () => {
      expect(objectHasSubtypeRule(0x11, 'ghz')).toBe(true); // Bridge
      expect(objectHasSubtypeRule(0x26, 'ghz')).toBe(true); // Monitor (base rule)
      expect(objectHasSubtypeRule(0x36, 'lz')).toBe(true); // Spikes (base rule, any zone)
      expect(objectHasSubtypeRule(0x1f, 'ghz')).toBe(false); // Crabmeat (static)
      expect(objectHasSubtypeRule(0x0d, 'ghz')).toBe(false); // Signpost (static)
    });

    it('$11 Bridge has a rule in GHZ but not other zones (zone-scoped)', () => {
      expect(objectHasSubtypeRule(0x11, 'ghz')).toBe(true);
      expect(objectHasSubtypeRule(0x11, 'mz')).toBe(false);
    });

    it('objectArtKey keys rule objects by subtype and static objects by bare id', () => {
      // Rule object: distinct subtypes → distinct keys.
      expect(objectArtKey(0x26, 'ghz', 0)).toBe('38:0');
      expect(objectArtKey(0x26, 'ghz', 6)).toBe('38:6');
      // Static object: subtype is ignored — one key regardless of subtype.
      expect(objectArtKey(0x1f, 'ghz', 0)).toBe('31');
      expect(objectArtKey(0x1f, 'ghz', 9)).toBe('31');
    });

    it('resolveObjectPieces returns null for a rule-less id (single-frame path)', () => {
      expect(resolveObjectPieces(0x1f, 'ghz', 0)).toBeNull(); // Crabmeat
      expect(resolveObjectPieces(0x0d, 'ghz', 0)).toBeNull(); // Signpost
    });
  });

  describe('Bridge $11 (GHZ/Bridge.cs)', () => {
    it('subtype 0x0C → 12 log pieces, frame 0, centred on the origin', () => {
      const set = resolveObjectPieces(0x11, 'ghz', 0x0c)!;
      expect(set).not.toBeNull();
      expect(set.pieces).toHaveLength(12);
      // Every piece is the log frame (0).
      for (const p of set.pieces) expect(p.frame).toBe(0);
      // st = -(N*16)/2 = -96; logs at -96, -80, ... in 16px steps.
      expect(set.pieces[0].dx).toBe(-96);
      expect(set.pieces[1].dx).toBe(-80);
      expect(set.pieces[11].dx).toBe(96 - 16); // 80
      // Centred: first and last are symmetric about -8 (SonLVL's Offset centring).
      const first = set.pieces[0].dx;
      const last = set.pieces[11].dx;
      expect(first + last).toBe(-16); // 2 * (-8)
    });

    it('log count = subtype & 0x1F', () => {
      expect(resolveObjectPieces(0x11, 'ghz', 8)!.pieces).toHaveLength(8);
      expect(resolveObjectPieces(0x11, 'ghz', 16)!.pieces).toHaveLength(16);
      // High bits above 0x1F are masked off.
      expect(resolveObjectPieces(0x11, 'ghz', 0x88)!.pieces).toHaveLength(8);
    });
  });

  describe('Monitor $26 (Common/Monitor.xml)', () => {
    const cases: [number, number][] = [
      [0x0, 1], [0x1, 3], [0x2, 4], [0x3, 5], [0x4, 6], [0x5, 7], [0x6, 8], [0x7, 9], [0x8, 10], [0x9, 11],
    ];
    it.each(cases)('subtype low-nibble %i → frame %i (single piece at origin)', (sub, frame) => {
      const set = resolveObjectPieces(0x26, 'ghz', sub)!;
      expect(set.pieces).toHaveLength(1);
      expect(set.pieces[0]).toMatchObject({ frame, dx: 0, dy: 0 });
    });
    it('only the low nibble selects the icon', () => {
      // 0x16 → nibble 6 → frame 8, same as 0x06.
      expect(resolveObjectPieces(0x26, 'ghz', 0x16)!.pieces[0].frame).toBe(8);
    });
  });

  describe('Spikes $36 (Common/Spikes.xml)', () => {
    it.each([[0x00, 0], [0x10, 1], [0x20, 2], [0x30, 3], [0x40, 4], [0x50, 5]])(
      'Type nibble in subtype %i → frame %i', (sub, frame) => {
        expect(resolveObjectPieces(0x36, 'ghz', sub)!.pieces[0].frame).toBe(frame);
      },
    );
    it('movement bits (low nibble) do not change the frame', () => {
      expect(resolveObjectPieces(0x36, 'ghz', 0x01)!.pieces[0].frame).toBe(0);
      expect(resolveObjectPieces(0x36, 'ghz', 0x13)!.pieces[0].frame).toBe(1);
    });
  });

  describe('Spring $41 (Common/Spring.xml)', () => {
    it('up (dir 0) uses Spring Horizontal frame 0; red pal 0 / yellow pal 1', () => {
      const red = resolveObjectPieces(0x41, 'ghz', 0x00)!;
      expect(red.pieces[0].frame).toBe(0);
      expect(red.link.artFile).toContain('Spring Horizontal');
      expect(red.link.pal).toBe(0);
      const yellow = resolveObjectPieces(0x41, 'ghz', 0x02)!; // bit1 set
      expect(yellow.link.pal).toBe(1);
    });
    it('horizontal (dir 1) uses Spring Vertical frame 3', () => {
      const h = resolveObjectPieces(0x41, 'ghz', 0x10)!;
      expect(h.pieces[0].frame).toBe(3);
      expect(h.link.artFile).toContain('Spring Vertical');
    });
    it('down (dir 2) reuses the up frame/art', () => {
      const d = resolveObjectPieces(0x41, 'ghz', 0x20)!;
      expect(d.pieces[0].frame).toBe(0);
      expect(d.link.artFile).toContain('Spring Horizontal');
    });
  });

  describe('Spiked Pole $17 (GHZ/SpikedPole.cs)', () => {
    it('N = min(0x16, subtype) segments cycling frames 0..7, right-anchored', () => {
      const set = resolveObjectPieces(0x17, 'ghz', 0x10)!; // default 16 segments
      expect(set.pieces).toHaveLength(16);
      expect(set.pieces[0].frame).toBe(0);
      expect(set.pieces[7].frame).toBe(7);
      expect(set.pieces[8].frame).toBe(0); // frame index wraps (i & 7)
      // start offset = -(N<<3) = -128; step +16.
      expect(set.pieces[0].dx).toBe(-128);
      expect(set.pieces[1].dx).toBe(-112);
    });
    it('subtype clamps at 0x16 segments', () => {
      expect(resolveObjectPieces(0x17, 'ghz', 0x30)!.pieces).toHaveLength(0x16);
    });
  });

  describe('Swinging Platform $15 (GHZ/SwingingPlatform.cs)', () => {
    it('length links: anchor(frame2) + N chain(frame1) + platform(frame0)', () => {
      const set = resolveObjectPieces(0x15, 'ghz', 3)!; // 3 links
      expect(set.pieces).toHaveLength(1 + 3 + 1);
      expect(set.pieces[0]).toMatchObject({ frame: 2, dx: 0, dy: 0 }); // anchor
      expect(set.pieces[1]).toMatchObject({ frame: 1, dx: 0, dy: 16 }); // chain link 1
      expect(set.pieces[3]).toMatchObject({ frame: 1, dx: 0, dy: 48 }); // chain link 3
      // platform at 8 + 16*length = 56.
      expect(set.pieces[4]).toMatchObject({ frame: 0, dx: 0, dy: 56 });
    });
    it('length = subtype & 0xF (max 15, no clamp: matches engine andi.w #$F,d1)', () => {
      // 15 chain links + anchor + platform = 17 pieces.
      const set = resolveObjectPieces(0x15, 'ghz', 0x0f)!;
      expect(set.pieces).toHaveLength(1 + 15 + 1);
      // The 15th chain link sits at y = 16 + 16*14 = 240; platform at 8 + 16*15 = 248.
      expect(set.pieces[15]).toMatchObject({ frame: 1, dx: 0, dy: 240 });
      expect(set.pieces[16]).toMatchObject({ frame: 0, dx: 0, dy: 248 });
      // Only the low nibble counts (high bits ignored).
      expect(resolveObjectPieces(0x15, 'ghz', 0x1f)!.pieces).toHaveLength(1 + 15 + 1);
    });
    it('applies in GHZ/MZ/SLZ/SBZ (all four zones)', () => {
      for (const z of ['ghz', 'mz', 'slz', 'sbz']) expect(objectHasSubtypeRule(0x15, z)).toBe(true);
    });
  });

  describe('SYZ Spikeball chain $57 (SYZ/SpikeballChain.cs)', () => {
    it('(subtype & 0x0F)+1 balls stacked straight up', () => {
      const set = resolveObjectPieces(0x57, 'syz', 2)!; // 3 balls
      expect(set.pieces).toHaveLength(3);
      expect(set.pieces.map((p) => p.dy)).toEqual([0, -16, -32]);
      for (const p of set.pieces) expect(p.frame).toBe(0);
    });
    it('is SYZ-scoped (LZ $57 is a different static object, no rule)', () => {
      expect(objectHasSubtypeRule(0x57, 'syz')).toBe(true);
      expect(objectHasSubtypeRule(0x57, 'lz')).toBe(false);
    });
  });

  describe('Newtron $42 (GHZ/Newtron.xml): frame + palette per subtype', () => {
    it('subtype 0 → frame 3 pal 0; subtype 1 → frame 1 pal 1', () => {
      const g = resolveObjectPieces(0x42, 'ghz', 0)!;
      expect(g.pieces[0].frame).toBe(3);
      expect(g.link.pal).toBe(0);
      const f = resolveObjectPieces(0x42, 'ghz', 1)!;
      expect(f.pieces[0].frame).toBe(1);
      expect(f.link.pal).toBe(1);
    });
  });

  describe('B6 LevelArt / offset-art subtype rules', () => {
    it('GHZ $18 Platform: "Large" (movement 0x0A) → frame 1, else frame 0', () => {
      expect(resolveObjectPieces(0x18, 'ghz', 0x00)!.pieces[0].frame).toBe(0); // Stationary
      expect(resolveObjectPieces(0x18, 'ghz', 0x05)!.pieces[0].frame).toBe(0); // Left->Right
      expect(resolveObjectPieces(0x18, 'ghz', 0x0a)!.pieces[0].frame).toBe(1); // Large
      // The rule reuses the LevelArt link (tiles from doc.tiles).
      expect(resolveObjectPieces(0x18, 'ghz', 0)!.link.artSource).toBe('levelArt');
      // SLZ/SYZ Platform ($18) have no "Large" variant → NO rule (static frame 0).
      expect(objectHasSubtypeRule(0x18, 'slz')).toBe(false);
      expect(objectHasSubtypeRule(0x18, 'syz')).toBe(false);
    });

    it('GHZ $1A Collapsing Cliff: subtype bit0 → light (0) / shadow (1)', () => {
      expect(resolveObjectPieces(0x1a, 'ghz', 0)!.pieces[0].frame).toBe(0);
      expect(resolveObjectPieces(0x1a, 'ghz', 1)!.pieces[0].frame).toBe(1);
    });

    it('MZ $2F Grass Platform: Sprite bits4-5 → frame 0/1/2 (Symmetrical/Asym/Column)', () => {
      expect(resolveObjectPieces(0x2f, 'mz', 0x00)!.pieces[0].frame).toBe(0);
      expect(resolveObjectPieces(0x2f, 'mz', 0x10)!.pieces[0].frame).toBe(1);
      expect(resolveObjectPieces(0x2f, 'mz', 0x20)!.pieces[0].frame).toBe(2);
    });

    it('SYZ $56 Block: frame = (subtype & 0x70) >> 4', () => {
      expect(resolveObjectPieces(0x56, 'syz', 0x00)!.pieces[0].frame).toBe(0);
      expect(resolveObjectPieces(0x56, 'syz', 0x30)!.pieces[0].frame).toBe(3);
      expect(resolveObjectPieces(0x56, 'syz', 0x70)!.pieces[0].frame).toBe(7);
      // Low nibble (switch id) is ignored for the frame.
      expect(resolveObjectPieces(0x56, 'syz', 0x2f)!.pieces[0].frame).toBe(2);
    });

    it('SLZ $5B Stairs: fixed 4-step composite (frame 0 at X 0/32/64/96)', () => {
      const set = resolveObjectPieces(0x5b, 'slz', 0)!;
      expect(set.pieces.map((p) => p.dx)).toEqual([0, 32, 64, 96]);
      expect(set.pieces.every((p) => p.frame === 0)).toBe(true);
    });

    it('LZ $61 Block/Cork: each subtype selects its own art file + byte offset + frame', () => {
      const cork = resolveEffectiveObjectArt(0x61, 'lz', 0x27, resolveObjectArt(0x61, 'lz')!);
      expect(cork.link.artFile).toContain('LZ Cork.nem');
      expect(cork.link.tileIndexOffset).toBe(282);
      expect(cork.pieces![0].frame).toBe(2);

      const falling = resolveEffectiveObjectArt(0x61, 'lz', 0x01, resolveObjectArt(0x61, 'lz')!);
      expect(falling.link.artFile).toContain('LZ Horizontal Door.nem');
      expect(falling.link.tileIndexOffset).toBe(0);
      expect(falling.pieces![0].frame).toBe(0);

      const rising = resolveEffectiveObjectArt(0x61, 'lz', 0x13, resolveObjectArt(0x61, 'lz')!);
      expect(rising.link.artFile).toContain('LZ Rising Platform.nem');
      expect(rising.link.tileIndexOffset).toBe(105); // 3360 / 32

      const block = resolveEffectiveObjectArt(0x61, 'lz', 0x30, resolveObjectArt(0x61, 'lz')!);
      expect(block.link.artFile).toContain('LZ 32x32 Block.nem');
      expect(block.link.tileIndexOffset).toBe(1530); // 48960 / 32
      expect(block.link.pal).toBe(3);
    });
  });

  describe('resolveEffectiveObjectArt (rule LINK overrides, the app render path)', () => {
    it('a static id returns the base link, no pieces', () => {
      const base = resolveObjectArt(0x1f, 'ghz')!; // Crabmeat
      const eff = resolveEffectiveObjectArt(0x1f, 'ghz', 0, base);
      expect(eff.link).toBe(base);
      expect(eff.pieces).toBeNull();
    });

    it('Spring $41 horizontal OVERRIDES the art file to Spring Vertical.nem (frame 3)', () => {
      const base = resolveObjectArt(0x41, 'ghz')!;
      expect(base.artFile).toContain('Spring Horizontal'); // base is the UP art
      const eff = resolveEffectiveObjectArt(0x41, 'ghz', 0x10, base);
      expect(eff.link.artFile).toContain('Spring Vertical'); // override applied
      expect(eff.link.artFile).not.toBe(base.artFile);
      expect(eff.pieces).not.toBeNull();
      expect(eff.pieces![0].frame).toBe(3);
    });

    it('Spring $41 color and Newtron $42 flying OVERRIDE the palette line', () => {
      const spBase = resolveObjectArt(0x41, 'ghz')!;
      expect(resolveEffectiveObjectArt(0x41, 'ghz', 0x00, spBase).link.pal).toBe(0); // red
      expect(resolveEffectiveObjectArt(0x41, 'ghz', 0x02, spBase).link.pal).toBe(1); // yellow
      const ntBase = resolveObjectArt(0x42, 'ghz')!;
      expect(resolveEffectiveObjectArt(0x42, 'ghz', 0, ntBase).link.pal).toBe(0); // grounded
      expect(resolveEffectiveObjectArt(0x42, 'ghz', 1, ntBase).link.pal).toBe(1); // flying
    });

    it('a composite rule returns the base link (no art swap) + its pieces', () => {
      const base = resolveObjectArt(0x11, 'ghz')!; // Bridge
      const eff = resolveEffectiveObjectArt(0x11, 'ghz', 0x0c, base);
      expect(eff.link).toBe(base);
      expect(eff.pieces).toHaveLength(12);
    });
  });

  describe('every rule object is art-linked (a rule needs a base art link)', () => {
    it('resolveObjectArt resolves for every rule id in every zone it rules', () => {
      const zones = ['ghz', 'mz', 'syz', 'lz', 'slz', 'sbz'];
      for (const id of ruleObjectIdsAnyZone()) {
        for (const zone of zones) {
          if (!objectHasSubtypeRule(id, zone)) continue;
          expect(resolveObjectArt(id, zone), `rule $${id.toString(16)} in ${zone} must be linked`).toBeDefined();
          expect(resolveObjectPieces(id, zone, 0), `rule $${id.toString(16)} in ${zone} must produce pieces`).not.toBeNull();
        }
      }
    });
  });

  describe('composed frame against real s1disasm', { skip: !referenceCheckout(S1_PINNED), meta: { skipReason: S1_ABSENT } }, () => {
    it('a subtype-$0C bridge composes a non-empty ~192px-wide frame', async () => {
      const { composeObjectFramesFromFiles } = await import('../../../level-classic/object-sprite');
      const set = resolveObjectPieces(0x11, 'ghz', 0x0c)!;
      const art = new Uint8Array(fs.readFileSync(path.join(S1DIR, set.link.artFile)));
      const map = new TextDecoder('utf-8').decode(fs.readFileSync(path.join(S1DIR, set.link.mapAsm)));
      const frame = composeObjectFramesFromFiles(map, art, set.link.compression, set.pieces);
      // 12 logs * 16px = 192px span.
      expect(frame.width).toBe(192);
      expect(frame.height).toBe(16);
      // Non-empty: at least one opaque pixel.
      expect(frame.indices.some((v) => v !== 0)).toBe(true);
    });

    it('a horizontal spring composes through the EFFECTIVE link (Spring Vertical art), not the base', async () => {
      const { composeObjectFramesFromFiles } = await import('../../../level-classic/object-sprite');
      const compose = (link: { artFile: string; mapAsm: string; compression: 'nemesis' | 'uncompressed' }, pieces: { frame: number; dx: number; dy: number }[]) => {
        const art = new Uint8Array(fs.readFileSync(path.join(S1DIR, link.artFile)));
        const map = new TextDecoder('utf-8').decode(fs.readFileSync(path.join(S1DIR, link.mapAsm)));
        return composeObjectFramesFromFiles(map, art, link.compression, pieces);
      };
      const base = resolveObjectArt(0x41, 'ghz')!; // Spring Horizontal.nem (the UP art)
      const eff = resolveEffectiveObjectArt(0x41, 'ghz', 0x10, base); // horizontal
      // Resolution picked the Spring Vertical art (the horizontal frame's real tiles).
      expect(eff.link.artFile).toContain('Spring Vertical');

      const good = compose(eff.link, eff.pieces!); // frame 3 against Spring Vertical.nem
      // Composing frame 3 against the BASE (wrong) art is what the pre-fix app path did.
      const garbled = compose(base, eff.pieces!); // frame 3 against Spring Horizontal.nem

      // The correct composition is non-empty…
      expect(good.indices.some((v) => v !== 0)).toBe(true);
      // …and demonstrably differs from the wrong-art composition (the bug this guards).
      const key = (f: { indices: Uint8Array }) => Array.from(f.indices).join(',');
      expect(key(good)).not.toBe(key(garbled));
    });
  });
});
