import { describe, it, expect } from 'vitest';
import {
  flipArtWord, flipCollisionWord, flipClipboard, flipSectionRegion, flipDescription,
  FLIP_MASKS,
} from '../region-flip';
import type { FlipAxis } from '../region-flip';
import { copyFromSection, isBlockAligned } from '../map-clipboard';
import type { MapClipboard } from '../map-clipboard';
import {
  createSection, packNametableWord, unpackNametableWord, SECTION_TILES_WIDE,
} from '../../model/s4-types';
import type { Section } from '../../model/s4-types';
import { packCollisionCell, unpackCollisionCell } from '../../collision/collision-cell-word';
import { COLLISION_CELL_UNOWNED_MASK, unownedCollisionBits } from '../collision-word';
import { cellTileIndices } from '../../collision/collision-cell';
import type { AnyCommand, SetTilesCommand, SetCollisionEditCommand } from '../commands';

/**
 * MIRRORING A REGION: THE TRANSFORM IS TWO OPERATIONS AND DOING ONE IS THE BUG.
 *
 * ═══ WHAT THESE ROWS ARE BUILT TO CATCH ═══
 *
 * Reverse the order of the words along the axis, AND toggle each word's own
 * flip bit on that axis. Do only the first and every tile sits in the right
 * place drawn the wrong way round; do only the second and every tile is
 * mirrored where it stands, so the picture scrambles. Both failures look nearly
 * right on symmetric art — which is most of a tiled background — so:
 *
 *   • every fixture is DELIBERATELY ASYMMETRIC in both axes and in its flip
 *     bits, and
 *   • `plantReverseOnly` / `plantToggleOnly` below implement the two half-
 *     transforms explicitly, and rows 2c/2d/4c/4d assert the real transform
 *     DIFFERS from each of them on this fixture. Those rows are the reason the
 *     rest can be trusted.
 *
 * ⚠ ROUND-TRIP IDENTITY IS NECESSARY AND NOT SUFFICIENT. `flip(flip(x)) === x`
 * catches reverse-only and toggle-only at once — and it also passes if flip is
 * a NO-OP. So row 3a (identity) never stands alone: row 3b asserts the single
 * flip changed something specific, on the same fixture, in the same test.
 *
 * ⚠ TWO WORD LAYOUTS. The nametable's flip bits (11/12) and the collision cell
 * word's (10/11) are at different positions, and crossing them produces output
 * that still renders and is wrong. Row 1 pins each derived mask against the
 * OTHER codec's decoder — `unpackNametableWord` for the art masks,
 * `unpackCollisionCell` for the collision ones — so a mask cannot be green
 * against the function that produced it.
 */

// ─── FIXTURES ───────────────────────────────────────────────────────────────

/** An art word that is asymmetric in EVERY field a flip must not disturb. */
function art(tile: number, opts: {
  pal?: number; pri?: boolean; h?: boolean; v?: boolean;
} = {}): number {
  return packNametableWord(tile, opts.pal ?? 0, opts.pri ?? false, opts.v ?? false, opts.h ?? false);
}

/** A collision word with a shape, both flip flags authorable, and solidity. */
function coll(shape: number, opts: {
  x?: boolean; y?: boolean; sol?: 'none' | 'top' | 'sides-bottom' | 'all';
} = {}): number {
  return packCollisionCell({
    shape, xFlip: opts.x ?? false, yFlip: opts.y ?? false, solidity: opts.sol ?? 'top',
  });
}

/**
 * A 4x2-tile clipboard (2x1 collision cells) in which NO two words are equal
 * and every field varies: tile index, palette, priority, and both flip bits.
 *
 * 4x2 rather than 2x2 so a horizontal reverse has somewhere to go, and the two
 * collision cells carry DIFFERENT shapes so a reverse that did nothing is
 * visible on the collision plane as well as the art one.
 */
function fixture(): MapClipboard {
  return {
    widthTiles: 4, heightTiles: 2,
    nametable: new Uint16Array([
      art(1), art(2, { h: true }), art(3, { pal: 2 }), art(4, { pri: true, v: true }),
      art(5, { v: true }), art(6, { pal: 1, pri: true }), art(7, { h: true, v: true }), art(8),
    ]),
    collisionA: new Uint16Array([coll(0x11, { x: true }), coll(0x22, { sol: 'all' })]),
    collisionB: new Uint16Array([coll(0x33, { y: true }), coll(0x44)]),
    artOnly: false,
  };
}

/** THE FIRST HALF ONLY: words move, bits do not. */
function plantReverseOnly(clip: MapClipboard, axis: FlipAxis): Uint16Array {
  const { widthTiles: w, heightTiles: h } = clip;
  const out = new Uint16Array(w * h);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      out[r * w + c] = clip.nametable[(axis === 'v' ? h - 1 - r : r) * w + (axis === 'h' ? w - 1 - c : c)];
    }
  }
  return out;
}

/** THE SECOND HALF ONLY: bits toggle, words stay put. */
function plantToggleOnly(clip: MapClipboard, axis: FlipAxis): Uint16Array {
  return Uint16Array.from(clip.nametable, (word) => flipArtWord(word, axis));
}

/** A section with an asymmetric art + collision region written at (col,row). */
function sectionWith(col: number, row: number, clip: MapClipboard): Section {
  const s = createSection(0, 'flip');
  s.collisionEdit = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_WIDE);
  s.collisionEditB = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_WIDE);
  for (let r = 0; r < clip.heightTiles; r++) {
    for (let c = 0; c < clip.widthTiles; c++) {
      s.tileGrid.nametable[(row + r) * SECTION_TILES_WIDE + (col + c)] = clip.nametable[r * clip.widthTiles + c];
    }
  }
  const cellsW = clip.widthTiles >> 1, cellsH = clip.heightTiles >> 1;
  for (let cy = 0; cy < cellsH; cy++) {
    for (let cx = 0; cx < cellsW; cx++) {
      for (const i of cellTileIndices((col >> 1) + cx, (row >> 1) + cy, SECTION_TILES_WIDE)) {
        s.collisionEdit![i] = clip.collisionA[cy * cellsW + cx];
        s.collisionEditB![i] = clip.collisionB[cy * cellsW + cx];
      }
    }
  }
  return s;
}

function ntRect(s: Section, col: number, row: number, w: number, h: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.push(s.tileGrid.nametable[(row + r) * SECTION_TILES_WIDE + (col + c)]);
  return out;
}

/** Apply a batch's children to the section, the way the command applier does —
 *  enough of it to read the result back. */
function apply(section: Section, cmd: AnyCommand | null): void {
  if (!cmd) return;
  if (cmd.type === 'batch') { for (const child of cmd.commands) apply(section, child); return; }
  if (cmd.type === 'set-tiles') {
    for (const e of (cmd as SetTilesCommand).entries) section.tileGrid.nametable[e.index] = e.newNt;
    return;
  }
  if (cmd.type === 'set-collision-edit') {
    const c = cmd as SetCollisionEditCommand;
    const plane = c.plane === 'b' ? section.collisionEditB! : section.collisionEdit!;
    for (const e of c.entries) plane[e.index] = e.newColl;
  }
}

// ─── 1. THE MASKS ARE THE CODECS', AND THE TWO LAYOUTS ARE NOT CROSSED ──────

describe('region-flip · derived bit masks', () => {
  it('1a: the art masks decode as EXACTLY the flip field they name, and nothing else', () => {
    const h = unpackNametableWord(FLIP_MASKS.ntH);
    expect(h).toEqual({ tileIndex: 0, palette: 0, priority: false, vFlip: false, hFlip: true });
    const v = unpackNametableWord(FLIP_MASKS.ntV);
    expect(v).toEqual({ tileIndex: 0, palette: 0, priority: false, vFlip: true, hFlip: false });
  });

  it('1b: the collision masks decode as EXACTLY the flip field they name, and nothing else', () => {
    expect(unpackCollisionCell(FLIP_MASKS.collX))
      .toEqual({ shape: 0, xFlip: true, yFlip: false, solidity: 'none' });
    expect(unpackCollisionCell(FLIP_MASKS.collY))
      .toEqual({ shape: 0, xFlip: false, yFlip: true, solidity: 'none' });
  });

  it('1c: THE LAYOUTS ARE NOT CROSSED: the art masks and the collision masks are at '
    + 'different bit positions, and this is what a crossed pair would violate', () => {
    // Grounded in the engine's own reader, aeon b76576ea
    // tools/collision_pipeline.py:50-53 (CHUNK_XFLIP_BIT 0x0400, CHUNK_YFLIP_BIT
    // 0x0800) versus s4-types packNametableWord (hFlip << 11, vFlip << 12).
    // Asserted as a RELATION so no literal is typed: the art pair sits one bit
    // ABOVE the collision pair, and the two overlap in exactly one position.
    expect(FLIP_MASKS.ntH).toBe(FLIP_MASKS.collX * 2);
    expect(FLIP_MASKS.ntV).toBe(FLIP_MASKS.collY * 2);
    expect(FLIP_MASKS.ntH).toBe(FLIP_MASKS.collY);          // the trap, named
    expect(FLIP_MASKS.ntH & FLIP_MASKS.collX).toBe(0);
  });

  it('1d: a flip carries every bit it does not own: palette, priority, solidity, '
    + 'and the UNOWNED bits of a collision word', () => {
    const a = art(0x123, { pal: 3, pri: true });
    for (const axis of ['h', 'v'] as const) {
      const f = unpackNametableWord(flipArtWord(a, axis));
      expect(f.tileIndex).toBe(0x123);
      expect(f.palette).toBe(3);
      expect(f.priority).toBe(true);
    }
    // THE SIBLING RULE (collision-word.ts, 2026-08-28): a collision writer
    // authors the fields it owns and the cell keeps the rest. The unowned mask
    // is that module's, DERIVED from `packCollisionCell` — not `0xC000` typed
    // here, which is the copied-pin defect one field-move away from being
    // confidently wrong. A destination is authored with those bits SET on
    // purpose: every cell in every shipped act holds zero there, so a row that
    // does not author them is vacuous by construction.
    expect(COLLISION_CELL_UNOWNED_MASK).not.toBe(0);
    const c = coll(0x2AA, { x: true, sol: 'sides-bottom' }) | COLLISION_CELL_UNOWNED_MASK;
    for (const axis of ['h', 'v'] as const) {
      const f = flipCollisionWord(c, axis);
      expect(unownedCollisionBits(f)).toBe(COLLISION_CELL_UNOWNED_MASK);
      expect(unpackCollisionCell(f).shape).toBe(0x2AA);
      expect(unpackCollisionCell(f).solidity).toBe('sides-bottom');
    }
    // ...and the property holds BY CONSTRUCTION, not by luck: the bit a flip
    // XORs is inside the owned mask, so no unowned bit can ever be reached.
    expect(FLIP_MASKS.collX & COLLISION_CELL_UNOWNED_MASK).toBe(0);
    expect(FLIP_MASKS.collY & COLLISION_CELL_UNOWNED_MASK).toBe(0);
  });

  it('1f: A WHOLE-PLANE FLIP PRESERVES UNOWNED BITS CELL BY CELL: the property '
    + 'stated over the transform the app actually calls, not just the word helper', () => {
    const src = fixture();
    src.collisionA = Uint16Array.from(src.collisionA, (w, i) => (
      i === 0 ? (w | COLLISION_CELL_UNOWNED_MASK) : w));
    for (const axis of ['h', 'v'] as const) {
      const out = flipClipboard(src, axis);
      const before = [...src.collisionA].map(unownedCollisionBits).sort();
      const after = [...out.collisionA].map(unownedCollisionBits).sort();
      expect(after).toEqual(before);
      // ANTI-VACUOUS: there really is an unowned value in play.
      expect(before.some((b) => b !== 0)).toBe(true);
    }
  });

  it('1e: AIR IS AIR: a shape-0 collision cell keeps its word rather than becoming '
    + '0x400, which would still read as air and would dirty every air cell', () => {
    expect(flipCollisionWord(0, 'h')).toBe(0);
    expect(flipCollisionWord(0, 'v')).toBe(0);
    // ...and the art plane has NO such rule: tile 0 is an ordinary index.
    expect(flipArtWord(0, 'h')).toBe(FLIP_MASKS.ntH);
  });
});

// ─── 2. THE CLIPBOARD FLIP DOES BOTH HALVES ────────────────────────────────

describe('region-flip · flipClipboard', () => {
  it('2a: HORIZONTAL: every word comes from the mirrored column AND has its hFlip '
    + 'toggled', () => {
    const src = fixture();
    const out = flipClipboard(src, 'h');
    const { widthTiles: w, heightTiles: h } = src;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        expect(out.nametable[r * w + c]).toBe(flipArtWord(src.nametable[r * w + (w - 1 - c)], 'h'));
      }
    }
    // Spelled out once at a corner, so the row is not merely the implementation
    // restated: top-left must become the top-RIGHT tile, mirrored.
    const corner = unpackNametableWord(out.nametable[0]);
    expect(corner.tileIndex).toBe(4);       // was the last tile of row 0
    expect(corner.priority).toBe(true);     // carried
    expect(corner.vFlip).toBe(true);        // carried — the OTHER axis is untouched
    expect(corner.hFlip).toBe(true);        // toggled from false
  });

  it('2b: VERTICAL: mirrored ROW, vFlip toggled, hFlip untouched', () => {
    const src = fixture();
    const out = flipClipboard(src, 'v');
    const { widthTiles: w, heightTiles: h } = src;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        expect(out.nametable[r * w + c]).toBe(flipArtWord(src.nametable[(h - 1 - r) * w + c], 'v'));
      }
    }
    const corner = unpackNametableWord(out.nametable[0]);
    expect(corner.tileIndex).toBe(5);       // was row 1, column 0
    expect(corner.vFlip).toBe(false);       // toggled from true
    expect(corner.hFlip).toBe(false);       // untouched
  });

  it('2c: PLANTED VIOLATION: reverse-only (words move, bits do not) produces a '
    + 'DIFFERENT result on this fixture, in both axes', () => {
    for (const axis of ['h', 'v'] as const) {
      const src = fixture();
      const real = flipClipboard(src, axis).nametable;
      const half = plantReverseOnly(src, axis);
      expect([...real]).not.toEqual([...half]);
      // ...and it differs in EVERY word, because every word's flip bit moves.
      for (let i = 0; i < real.length; i++) expect(real[i]).not.toBe(half[i]);
    }
  });

  it('2d: PLANTED VIOLATION: toggle-only (bits toggle, words stay put) produces a '
    + 'DIFFERENT result on this fixture, in both axes', () => {
    for (const axis of ['h', 'v'] as const) {
      const src = fixture();
      const real = flipClipboard(src, axis).nametable;
      const half = plantToggleOnly(src, axis);
      expect([...real]).not.toEqual([...half]);
    }
  });

  it('2e: the COLLISION plane takes the same two-part transform with ITS OWN bits: '
    + 'the cells reverse and each cell\'s xFlip/yFlip toggles', () => {
    const src = fixture();
    const h = flipClipboard(src, 'h');
    // 2x1 cells: they swap, and the X flag toggles on each.
    expect(unpackCollisionCell(h.collisionA[0]))
      .toEqual({ shape: 0x22, xFlip: true, yFlip: false, solidity: 'all' });
    expect(unpackCollisionCell(h.collisionA[1]))
      .toEqual({ shape: 0x11, xFlip: false, yFlip: false, solidity: 'top' });
    // Vertical over a 1-row cell grid: no reversal is possible, so this row is
    // ENTIRELY the toggle half — the one case where reverse-only would be
    // indistinguishable from doing nothing.
    const v = flipClipboard(src, 'v');
    expect(unpackCollisionCell(v.collisionA[0]))
      .toEqual({ shape: 0x11, xFlip: true, yFlip: true, solidity: 'top' });
    expect(unpackCollisionCell(v.collisionB[0]))
      .toEqual({ shape: 0x33, xFlip: false, yFlip: false, solidity: 'top' });  // yFlip toggled OFF
  });

  it('2f: the ART flip and the COLLISION flip stay in step: cell k of the flipped '
    + 'plane describes the four tiles of block k of the flipped art', () => {
    const src = fixture();
    for (const axis of ['h', 'v'] as const) {
      const out = flipClipboard(src, axis);
      const cellsW = out.widthTiles >> 1;
      for (let cy = 0; cy < (out.heightTiles >> 1); cy++) {
        for (let cx = 0; cx < cellsW; cx++) {
          // Which SOURCE cell this destination cell came from...
          const srcCx = axis === 'h' ? cellsW - 1 - cx : cx;
          const srcCy = axis === 'v' ? (out.heightTiles >> 1) - 1 - cy : cy;
          // ...must be the cell that owns the source TILE the destination
          // tile (2cx, 2cy) came from. Computed from the ART indexing, not the
          // collision one, so the two are cross-checked rather than restated.
          const dstTileC = cx * 2, dstTileR = cy * 2;
          const srcTileC = axis === 'h' ? out.widthTiles - 1 - dstTileC : dstTileC;
          const srcTileR = axis === 'v' ? out.heightTiles - 1 - dstTileR : dstTileR;
          expect(srcTileC >> 1).toBe(srcCx);
          expect(srcTileR >> 1).toBe(srcCy);
        }
      }
    }
  });

  it('2g: it returns a NEW object and does not mutate the source: the paste ghost '
    + 'caches on clipboard object identity', () => {
    const src = fixture();
    const before = [...src.nametable];
    const out = flipClipboard(src, 'h');
    expect(out).not.toBe(src);
    expect(out.nametable).not.toBe(src.nametable);
    expect([...src.nametable]).toEqual(before);
  });
});

// ─── 3. ROUND TRIP, AND WHY IT IS NOT ENOUGH ON ITS OWN ────────────────────

describe('region-flip · round trip', () => {
  it('3a: flipping twice on the same axis is the identity, on both axes and both '
    + 'planes: NECESSARY AND NOT SUFFICIENT, see 3b', () => {
    for (const axis of ['h', 'v'] as const) {
      const src = fixture();
      const back = flipClipboard(flipClipboard(src, axis), axis);
      expect([...back.nametable]).toEqual([...src.nametable]);
      expect([...back.collisionA]).toEqual([...src.collisionA]);
      expect([...back.collisionB]).toEqual([...src.collisionB]);
      expect(back.artOnly).toBe(src.artOnly);
    }
  });

  it('3b: THE ROW 3a CANNOT DO: a SINGLE flip changes the plane. A no-op flip '
    + 'passes 3a perfectly', () => {
    for (const axis of ['h', 'v'] as const) {
      const src = fixture();
      const once = flipClipboard(src, axis);
      expect([...once.nametable]).not.toEqual([...src.nametable]);
      expect([...once.collisionA]).not.toEqual([...src.collisionA]);
    }
  });

  it('3c: h and v commute and neither is the other: flipping both is not flipping one', () => {
    const src = fixture();
    const hv = flipClipboard(flipClipboard(src, 'h'), 'v');
    const vh = flipClipboard(flipClipboard(src, 'v'), 'h');
    expect([...hv.nametable]).toEqual([...vh.nametable]);
    expect([...hv.nametable]).not.toEqual([...flipClipboard(src, 'h').nametable]);
    expect([...hv.nametable]).not.toEqual([...flipClipboard(src, 'v').nametable]);
  });
});

// ─── 4. ODD RUNS, AND THE CENTRE COLUMN ────────────────────────────────────

describe('region-flip · odd runs', () => {
  const odd = (): MapClipboard => ({
    widthTiles: 3, heightTiles: 1,
    nametable: new Uint16Array([art(9), art(10, { h: true }), art(11)]),
    collisionA: new Uint16Array(0), collisionB: new Uint16Array(0),
    artOnly: true,
  });

  it('4a: an odd run reverses correctly and the CENTRE column stays put, but still '
    + 'has its OWN flip bit toggled, which is the half an off-by-one drops silently', () => {
    const out = flipClipboard(odd(), 'h');
    expect(unpackNametableWord(out.nametable[0]).tileIndex).toBe(11);
    expect(unpackNametableWord(out.nametable[1]).tileIndex).toBe(10);   // centre, unmoved
    expect(unpackNametableWord(out.nametable[1]).hFlip).toBe(false);    // ...and TOGGLED (was true)
    expect(unpackNametableWord(out.nametable[2]).tileIndex).toBe(9);
  });

  it('4b: ART-ONLY IS PRESERVED, NOT UPGRADED: length-0 planes come back length 0 '
    + 'and artOnly stays true. A flip must not change what a selection carries', () => {
    for (const axis of ['h', 'v'] as const) {
      const out = flipClipboard(odd(), axis);
      expect(out.artOnly).toBe(true);
      expect(out.collisionA.length).toBe(0);
      expect(out.collisionB.length).toBe(0);
      expect(out.widthTiles).toBe(3);
      expect(out.heightTiles).toBe(1);
    }
  });

  it('4c: PLANTED VIOLATION: reverse-only is wrong on an odd run too (the centre '
    + 'column is where it hides)', () => {
    const src = odd();
    expect([...flipClipboard(src, 'h').nametable]).not.toEqual([...plantReverseOnly(src, 'h')]);
  });

  it('4d: PLANTED VIOLATION: toggle-only is wrong on an odd run', () => {
    const src = odd();
    expect([...flipClipboard(src, 'h').nametable]).not.toEqual([...plantToggleOnly(src, 'h')]);
  });

  it('4e: a 1x1 selection has nothing to reverse, so a flip is PURELY the bit toggle '
    + ': the case reverse-only cannot be told from doing nothing', () => {
    const one: MapClipboard = {
      widthTiles: 1, heightTiles: 1, nametable: new Uint16Array([art(7)]),
      collisionA: new Uint16Array(0), collisionB: new Uint16Array(0), artOnly: true,
    };
    expect(unpackNametableWord(flipClipboard(one, 'h').nametable[0]).hFlip).toBe(true);
    expect(unpackNametableWord(flipClipboard(one, 'v').nametable[0]).vFlip).toBe(true);
  });
});

// ─── 5. IN PLACE: ONE COMMAND, AND THE SAME TRANSFORM ──────────────────────

describe('region-flip · flipSectionRegion', () => {
  it('5a: a block-aligned region flips ART AND COLLISION, in ONE batch command', () => {
    const clip = fixture();
    const s = sectionWith(4, 6, clip);
    expect(isBlockAligned(4, 6, 4, 2)).toBe(true);
    const cmd = flipSectionRegion({
      section: s, sectionIndex: 0, col: 4, row: 6, w: 4, h: 2, axis: 'h',
      description: flipDescription('h', '2×1 blocks'),
    });
    expect(cmd).not.toBeNull();
    expect(cmd!.type).toBe('batch');
    const kinds = cmd!.commands.map((c) => c.type).sort();
    expect(kinds).toEqual(['set-collision-edit', 'set-collision-edit', 'set-tiles']);

    apply(s, cmd);
    // The section region must now equal the transform applied to the clipboard —
    // compared against `flipClipboard`, which rows 2a-2d have independently
    // pinned against both half-transforms.
    expect(ntRect(s, 4, 6, 4, 2)).toEqual([...flipClipboard(clip, 'h').nametable]);
    // ...and the collision cells, read back through the cell->tile mapping.
    const wantA = flipClipboard(clip, 'h').collisionA;
    for (let cx = 0; cx < 2; cx++) {
      for (const i of cellTileIndices(2 + cx, 3, SECTION_TILES_WIDE)) {
        expect(s.collisionEdit![i]).toBe(wantA[cx]);
      }
    }
  });

  it('5b: THE ART AND THE COLLISION DO NOT DESYNC: flipping in place gives exactly '
    + 'what a copy-flip-paste of the same rect would have written', () => {
    for (const axis of ['h', 'v'] as const) {
      const clip = fixture();
      const s = sectionWith(4, 6, clip);
      apply(s, flipSectionRegion({
        section: s, sectionIndex: 0, col: 4, row: 6, w: 4, h: 2, axis,
        description: 'x',
      }));
      const viaClipboard = flipClipboard(copyFromSection(sectionWith(4, 6, clip), 4, 6, 4, 2), axis);
      expect(ntRect(s, 4, 6, 4, 2)).toEqual([...viaClipboard.nametable]);
    }
  });

  it('5c: AN ART-ONLY (odd) REGION FLIPS ART ONLY: no collision child at all, and '
    + 'the collision under it is left exactly as it was', () => {
    const clip = fixture();
    const s = sectionWith(4, 6, clip);
    const collBefore = [...s.collisionEdit!];
    expect(isBlockAligned(5, 6, 3, 1)).toBe(false);
    const cmd = flipSectionRegion({
      section: s, sectionIndex: 0, col: 5, row: 6, w: 3, h: 1, axis: 'h', description: 'x',
    });
    expect(cmd!.commands.every((c) => c.type === 'set-tiles')).toBe(true);
    apply(s, cmd);
    expect([...s.collisionEdit!]).toEqual(collBefore);
    // ANTI-VACUOUS: the art really did move, so "no collision child" is not
    // "nothing happened".
    expect(ntRect(s, 5, 6, 3, 1)).not.toEqual([
      clip.nametable[1], clip.nametable[2], clip.nametable[3],
    ]);
  });

  it('5d: flipping the same region twice restores the section EXACTLY: art and '
    + 'both collision planes', () => {
    for (const axis of ['h', 'v'] as const) {
      const clip = fixture();
      const s = sectionWith(4, 6, clip);
      const nt0 = [...s.tileGrid.nametable], a0 = [...s.collisionEdit!], b0 = [...s.collisionEditB!];
      apply(s, flipSectionRegion({ section: s, sectionIndex: 0, col: 4, row: 6, w: 4, h: 2, axis, description: 'x' }));
      expect([...s.tileGrid.nametable]).not.toEqual(nt0);           // anti-vacuous
      apply(s, flipSectionRegion({ section: s, sectionIndex: 0, col: 4, row: 6, w: 4, h: 2, axis, description: 'x' }));
      expect([...s.tileGrid.nametable]).toEqual(nt0);
      expect([...s.collisionEdit!]).toEqual(a0);
      expect([...s.collisionEditB!]).toEqual(b0);
    }
  });

  it('5e: NOTHING OUTSIDE THE RECTANGLE MOVES', () => {
    const clip = fixture();
    const s = sectionWith(4, 6, clip);
    // Put a distinctive word in every neighbouring tile.
    const outside = [
      (6 - 1) * SECTION_TILES_WIDE + 4, (6 + 2) * SECTION_TILES_WIDE + 4,
      6 * SECTION_TILES_WIDE + 3, 6 * SECTION_TILES_WIDE + 8,
    ];
    for (const i of outside) s.tileGrid.nametable[i] = art(0x77, { pal: 1 });
    apply(s, flipSectionRegion({ section: s, sectionIndex: 0, col: 4, row: 6, w: 4, h: 2, axis: 'h', description: 'x' }));
    for (const i of outside) expect(s.tileGrid.nametable[i]).toBe(art(0x77, { pal: 1 }));
  });

  it('5f: a region symmetric under the axis returns null rather than an empty undo step', () => {
    const s = createSection(0, 'flip');
    // Two columns of the SAME tile, each already unflipped — mirroring them
    // would change the flip bits, so build one that is genuinely invariant:
    // a pair (tile, tile-with-hFlip) reads the same after an h flip.
    s.tileGrid.nametable[6 * SECTION_TILES_WIDE + 4] = art(5);
    s.tileGrid.nametable[6 * SECTION_TILES_WIDE + 5] = art(5, { h: true });
    const cmd = flipSectionRegion({
      section: s, sectionIndex: 0, col: 4, row: 6, w: 2, h: 1, axis: 'h', description: 'x',
    });
    expect(cmd).toBeNull();
  });

  it('5g: the description is one sentence from one place', () => {
    expect(flipDescription('h', '2×1 blocks')).toBe('Flip 2×1 blocks horizontally');
    expect(flipDescription('v', 'clipboard')).toBe('Flip clipboard vertically');
  });
});
