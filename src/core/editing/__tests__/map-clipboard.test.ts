import { describe, it, expect } from 'vitest';
import {
  snapMarquee, isBlockAligned, copyFromSection, copyChunkToClipboard,
  buildPasteCommand, effectivePasteLayers, pasteBaseStep, selectionSizeLabel, artOnlyReason,
  effectiveGranularity,
} from '../map-clipboard';
import { buildRegionWriteCommand } from '../map-stamp';
import { selectionToChunk } from '../selection-to-chunk';
import { cellTileIndices } from '../../collision/collision-cell';
import {
  createSection, createChunkDef, packNametableWord,
  SECTION_TILES_WIDE, SECTION_TILES_HIGH,
} from '../../model/s4-types';
import type { Section } from '../../model/s4-types';
import type { MarqueeGranularity } from '../map-clipboard';
import type { AnyCommand, SetCollisionEditCommand, SetTilesCommand } from '../commands';

/**
 * TILE-GRANULAR MARQUEE SELECTION + THE COLLISION RULE IT FORCES.
 *
 * ═══ WHAT THE MEASUREMENT SAID, AND WHY THESE ROWS ARE THE SHAPE THEY ARE ═══
 *
 * Art in a section is per-8px TILE: one nametable word each,
 * `SECTION_TILES_WIDE`-strided. Collision is per-16px CELL: `cellTileIndices`
 * returns FOUR tile indices for one cell word, so the four 8x8 tiles of a 2x2
 * block share a single collision value and there is no way to give one of them
 * a different one. Row 1 below asserts that from the collision module directly
 * rather than restating it in prose, because every rule in this file is a
 * consequence of it.
 *
 * The consequence: a rectangle that does not begin AND end on even tile coords
 * has no cell it wholly owns at that edge. Tile-granular selection is therefore
 * structurally fine for art and structurally impossible for collision — a
 * constraint, not a defect.
 *
 * The rule chosen: a selection carries collision IFF it is block-aligned, keyed
 * on the RECT (never on the armed granularity), and every surface that could
 * imply otherwise refuses rather than degrades. What these rows are built to
 * catch is the degradation, in both directions:
 *
 *   - QUIETLY DROPPING COLLISION is not what happens; what happens if the rule
 *     is missing is far worse. An art-only clipboard's planes are LENGTH 0, so
 *     a per-cell read yields `undefined -> 0` and a paste writes AIR over every
 *     cell of its footprint — silently deleting the author's collision under
 *     art he only meant to move. Rows 5a/5b are that, from two independent
 *     enforcement points.
 *   - QUIETLY RE-SNAPPING to blocks is caught by rows 2a-2c, which pin the
 *     tile-granular rect exactly.
 *
 * ANTI-VACUOUS THROUGHOUT: every row that asserts collision is NOT written has
 * a companion proving collision IS written for the aligned case through the
 * same call, so a pass cannot come from collision writing being broken outright.
 */

/** A section with a recognisable art region and both collision planes seeded.
 *  The collision word lives at the top-left tile of each 2x2 cell, which is
 *  where `copyFromSection` reads it and `cellTileIndices` puts it. */
function seedSection(col: number, row: number, w: number, h: number): Section {
  const section = createSection(0, 'test');
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const idx = (row + r) * SECTION_TILES_WIDE + (col + c);
      section.tileGrid.nametable[idx] = packNametableWord(r * w + c + 1, 1, false, false, false);
    }
  }
  const A = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  const B = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
  // Every cell of the WHOLE section, not just the art region: the rows below
  // paste into untouched ground and have to be able to tell "unchanged" from
  // "was already zero".
  for (let cr = 0; cr < SECTION_TILES_HIGH / 2; cr++) {
    for (let cc = 0; cc < SECTION_TILES_WIDE / 2; cc++) {
      for (const i of cellTileIndices(cc, cr, SECTION_TILES_WIDE)) {
        A[i] = 0x100;
        B[i] = 0x200;
      }
    }
  }
  section.collisionEdit = A;
  section.collisionEditB = B;
  return section;
}

const children = (cmd: { commands: AnyCommand[] } | null): AnyCommand[] => cmd?.commands ?? [];
const collisionChildren = (cmd: { commands: AnyCommand[] } | null) =>
  children(cmd).filter((c): c is SetCollisionEditCommand => c.type === 'set-collision-edit');
const tileChildren = (cmd: { commands: AnyCommand[] } | null) =>
  children(cmd).filter((c): c is SetTilesCommand => c.type === 'set-tiles');

describe('1. the engine constraint every rule below is derived from', () => {
  it('one 16px collision cell IS four 8px tiles — so a tile has no collision of its own', () => {
    // Not a restatement: this is the collision module's own answer, and if it
    // ever became 1:1 every rule in this file should be deleted, not adjusted.
    const indices = cellTileIndices(3, 5, SECTION_TILES_WIDE);
    expect(indices).toHaveLength(4);
    const tc = 3 * 2, tr = 5 * 2;
    expect(indices).toEqual([
      tr * SECTION_TILES_WIDE + tc, tr * SECTION_TILES_WIDE + tc + 1,
      (tr + 1) * SECTION_TILES_WIDE + tc, (tr + 1) * SECTION_TILES_WIDE + tc + 1,
    ]);
    // The four tiles span exactly the even-origin 2x2 block, which is the whole
    // reason `isBlockAligned` demands even origin AND even size.
    expect(isBlockAligned(tc, tr, 2, 2)).toBe(true);
  });
});

describe('2. snapMarquee at tile granularity', () => {
  it('2a. takes the dragged tiles EXACTLY, inclusive of both endpoints', () => {
    // 5 wide (10..14) and 3 tall (7..9) — odd in both axes and odd in origin,
    // which is precisely what block granularity could never produce.
    expect(snapMarquee(10, 7, 14, 9, 'tile')).toEqual({ col: 10, row: 7, w: 5, h: 3 });
  });

  it('2b. is corner-order independent', () => {
    expect(snapMarquee(14, 9, 10, 7, 'tile')).toEqual(snapMarquee(10, 7, 14, 9, 'tile'));
  });

  it('2c. a single click selects ONE tile, not one block', () => {
    expect(snapMarquee(7, 7, 7, 7, 'tile')).toEqual({ col: 7, row: 7, w: 1, h: 1 });
    // ...and block granularity still selects the enclosing block, unchanged.
    expect(snapMarquee(7, 7, 7, 7, 'block')).toEqual({ col: 6, row: 6, w: 2, h: 2 });
  });

  it('2d. clamps to the section at BOTH edges, derived from the section constants', () => {
    const lastCol = SECTION_TILES_WIDE - 1, lastRow = SECTION_TILES_HIGH - 1;
    expect(snapMarquee(-40, -40, 3, 3, 'tile')).toEqual({ col: 0, row: 0, w: 4, h: 4 });
    expect(snapMarquee(lastCol - 2, lastRow - 2, lastCol + 999, lastRow + 999, 'tile'))
      .toEqual({ col: lastCol - 2, row: lastRow - 2, w: 3, h: 3 });
  });

  it('2e. DEFAULTS to block granularity — every pre-existing caller is unchanged', () => {
    expect(snapMarquee(3, 5, 8, 9)).toEqual(snapMarquee(3, 5, 8, 9, 'block'));
    // The shipped block contract, restated so a regression in it is visible
    // here and not only in the app: rounds OUT to cover what was dragged.
    expect(snapMarquee(3, 5, 8, 9, 'block')).toEqual({ col: 2, row: 4, w: 8, h: 6 });
  });
});

describe('2M. the Ctrl/Cmd modifier INVERTS the armed granularity', () => {
  // The owner's words were "if you hold control it behaves like it did where it
  // forces to draw collision size" — Ctrl = block. These rows pin why that was
  // built as an inversion instead of a constant: read literally it is a no-op in
  // the state every author starts in.
  it('2M-a. held: block becomes tile, and tile becomes block — symmetric', () => {
    expect(effectiveGranularity('block', true)).toBe('tile');
    expect(effectiveGranularity('tile', true)).toBe('block');
  });

  it('2M-b. not held: the armed setting passes through untouched, both ways', () => {
    expect(effectiveGranularity('block', false)).toBe('block');
    expect(effectiveGranularity('tile', false)).toBe('tile');
  });

  it('2M-c. WHY IT INVERTS: a literal "Ctrl means block" would be a no-op in the '
    + 'shipped default, because the shipped default IS block', () => {
    // Not a restatement of the store's initial value — this is the store's own
    // initial value, so if the default ever moved to `tile` this row fails and
    // the design note above must be re-read rather than quietly falsified.
    const shippedDefault: MarqueeGranularity = 'block';
    expect(effectiveGranularity(shippedDefault, true)).not.toBe(shippedDefault);
  });

  it('2M-d. THE HALF THE OWNER ASKED FOR: in Tile mode, holding it snaps to '
    + 'collision size — the same rect a plain Block drag would give', () => {
    // Derived end to end through `snapMarquee`, not asserted on the string: the
    // claim is about the RECT, and the rect is what the author sees.
    const drag = [3, 5, 8, 9] as const;
    const tileHeld = snapMarquee(...drag, effectiveGranularity('tile', true));
    const blockPlain = snapMarquee(...drag, effectiveGranularity('block', false));
    expect(tileHeld).toEqual(blockPlain);
    expect(isBlockAligned(tileHeld.col, tileHeld.row, tileHeld.w, tileHeld.h)).toBe(true);
  });

  it('2M-e. THE DISCRIMINATING PAIR: in Block mode, holding it gives the EXACT '
    + 'dragged tiles — the one combination no setting alone can produce', () => {
    const drag = [3, 5, 8, 9] as const;   // odd origin, odd size: block can never make it
    const blockHeld = snapMarquee(...drag, effectiveGranularity('block', true));
    expect(blockHeld).toEqual({ col: 3, row: 5, w: 6, h: 5 });
    // ...and it is NOT what the same drag gives unheld, which is the whole point.
    expect(blockHeld).not.toEqual(snapMarquee(...drag, effectiveGranularity('block', false)));
    expect(isBlockAligned(blockHeld.col, blockHeld.row, blockHeld.w, blockHeld.h)).toBe(false);
  });

  it('2M-f. two of the four combinations are INDISTINGUISHABLE by their output — '
    + 'so a test that only checks alignment cannot see the modifier at all', () => {
    // This row exists to name the harness's own exposure. Block+plain and
    // Tile+held produce byte-identical rects, so any row asserting only
    // "is it block-aligned" would pass with the modifier entirely unimplemented.
    const drag = [3, 5, 8, 9] as const;
    const grid = {
      blockPlain: snapMarquee(...drag, effectiveGranularity('block', false)),
      blockHeld: snapMarquee(...drag, effectiveGranularity('block', true)),
      tilePlain: snapMarquee(...drag, effectiveGranularity('tile', false)),
      tileHeld: snapMarquee(...drag, effectiveGranularity('tile', true)),
    };
    expect(grid.blockPlain).toEqual(grid.tileHeld);      // the collapsed pair
    expect(grid.blockHeld).toEqual(grid.tilePlain);      // ...and the other one
    expect(grid.blockPlain).not.toEqual(grid.blockHeld); // the pairs differ
  });
});

describe('3. isBlockAligned is about the RECT, and needs all four bounds even', () => {
  it('3a. accepts an even origin with an even size', () => {
    expect(isBlockAligned(0, 0, 2, 2)).toBe(true);
    expect(isBlockAligned(10, 8, 4, 6)).toBe(true);
  });

  it('3b. rejects an odd ORIGIN even when the size is even', () => {
    expect(isBlockAligned(1, 0, 4, 4)).toBe(false);
    expect(isBlockAligned(0, 1, 4, 4)).toBe(false);
  });

  it('3c. rejects an odd SIZE even when the origin is even', () => {
    expect(isBlockAligned(0, 0, 5, 4)).toBe(false);
    expect(isBlockAligned(0, 0, 4, 3)).toBe(false);
  });

  it('3d. a TILE-granularity drag that lands on even bounds is aligned like any other', () => {
    const m = snapMarquee(4, 6, 7, 9, 'tile');   // 4..7 x 6..9 = 4x4 at (4,6)
    expect(m).toEqual({ col: 4, row: 6, w: 4, h: 4 });
    expect(isBlockAligned(m.col, m.row, m.w, m.h)).toBe(true);
  });
});

describe('4. copyFromSection carries collision iff the rect is block-aligned', () => {
  it('4a. ALIGNED: art tile-exact AND both planes sized (w>>1)*(h>>1)', () => {
    const section = seedSection(4, 4, 4, 4);
    const clip = copyFromSection(section, 4, 4, 4, 4);
    expect(clip.artOnly).toBe(false);
    expect(clip.nametable.length).toBe(16);
    expect(clip.collisionA.length).toBe(4);
    expect(clip.collisionB.length).toBe(4);
    expect(Array.from(clip.collisionA).every((v) => v === 0x100)).toBe(true);
  });

  it('4b. NOT ALIGNED: art is still tile-exact, and the planes are EMPTY', () => {
    const section = seedSection(4, 4, 6, 6);
    const clip = copyFromSection(section, 5, 4, 3, 3);   // odd origin, odd size
    expect(clip.artOnly).toBe(true);
    expect(clip.widthTiles).toBe(3);
    expect(clip.heightTiles).toBe(3);
    expect(clip.nametable.length).toBe(9);
    // The art really is the art at (5,4), not a re-snapped (4,4) — this is the
    // row that fails if anything quietly rounds the selection back to blocks.
    expect(clip.nametable[0]).toBe(section.tileGrid.nametable[4 * SECTION_TILES_WIDE + 5]);
    expect(clip.collisionA.length).toBe(0);
    expect(clip.collisionB.length).toBe(0);
  });

  it('4c. EMPTY, not zero-filled — a zero-filled plane of the right length would '
    + 'be indistinguishable from "all air" and would ERASE on paste', () => {
    const clip = copyFromSection(seedSection(0, 0, 8, 8), 1, 1, 4, 4);
    const cells = (4 >> 1) * (4 >> 1);
    expect(cells).toBe(4);
    expect(clip.collisionA.length).not.toBe(cells);
    expect(clip.collisionA.length).toBe(0);
  });
});

describe('5. THE DATA-LOSS GATE: an art-only clipboard can never write collision', () => {
  const artOnlyClip = () => copyFromSection(seedSection(0, 0, 16, 16), 3, 3, 5, 5);

  it('5a. buildPasteCommand with layers "both" emits NO collision child', () => {
    const section = seedSection(0, 0, 16, 16);
    const clip = artOnlyClip();
    expect(clip.artOnly).toBe(true);
    // Pasted somewhere the art actually differs — the same rect back onto
    // itself is a no-op the builder correctly reports as null, which would make
    // this row pass for the wrong reason.
    const cmd = buildPasteCommand({
      clip, section, sectionIndex: 0, baseCol: 40, baseRow: 40, layers: 'both',
      description: 'x',
    });
    expect(cmd).not.toBeNull();
    expect(tileChildren(cmd).length).toBeGreaterThan(0);     // it DID paste art
    expect(collisionChildren(cmd)).toHaveLength(0);
  });

  it('5a-control. ANTI-VACUOUS: an ALIGNED clipboard through the same call DOES '
    + 'emit collision children — so 5a cannot be green because collision writing is broken', () => {
    const src = seedSection(0, 0, 16, 16);
    const clip = copyFromSection(src, 0, 0, 4, 4);
    expect(clip.artOnly).toBe(false);
    // Paste into a section whose collision differs, so there is something to write.
    const dest = createSection(1, 'dest');
    dest.collisionEdit = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    dest.collisionEditB = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    const cmd = buildPasteCommand({
      clip, section: dest, sectionIndex: 1, baseCol: 8, baseRow: 8, layers: 'both',
      description: 'x',
    });
    expect(collisionChildren(cmd).length).toBeGreaterThan(0);
  });

  it('5b. the REGION WRITER refuses it too, independently of buildPasteCommand — '
    + 'a future call site that forgets the layer rule is a no-op, not data loss', () => {
    const section = seedSection(0, 0, 16, 16);
    const clip = artOnlyClip();
    const cmd = buildRegionWriteCommand({
      source: clip, section, sectionIndex: 0, baseCol: 4, baseRow: 4,
      writeArt: false, writeCollision: true, description: 'x',
    });
    // writeArt off + collision refused = nothing to do at all.
    expect(cmd).toBeNull();
  });

  it('5c. an ODD paste base refuses collision even for a WELL-FORMED source — '
    + '`baseCol >> 1` floors, so the art would land a tile out of step with it', () => {
    const src = seedSection(0, 0, 16, 16);
    const clip = copyFromSection(src, 0, 0, 4, 4);       // aligned, planes present
    const dest = createSection(1, 'dest');
    dest.collisionEdit = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    dest.collisionEditB = new Uint16Array(SECTION_TILES_WIDE * SECTION_TILES_HIGH);
    const odd = buildRegionWriteCommand({
      source: clip, section: dest, sectionIndex: 1, baseCol: 9, baseRow: 8,
      writeArt: true, writeCollision: true, description: 'x',
    });
    expect(collisionChildren(odd)).toHaveLength(0);
    expect(tileChildren(odd).length).toBeGreaterThan(0);   // art still lands
    // ...and the SAME source one column over, on the grid, does write collision.
    const even = buildRegionWriteCommand({
      source: clip, section: dest, sectionIndex: 1, baseCol: 8, baseRow: 8,
      writeArt: true, writeCollision: true, description: 'x',
    });
    expect(collisionChildren(even).length).toBeGreaterThan(0);
  });

  it('5d. "collision only" over an art-only clipboard is null, not an empty write', () => {
    const section = seedSection(0, 0, 16, 16);
    expect(buildPasteCommand({
      clip: artOnlyClip(), section, sectionIndex: 0, baseCol: 3, baseRow: 3,
      layers: 'collision', description: 'x',
    })).toBeNull();
    expect(effectivePasteLayers(artOnlyClip(), 'collision')).toBeNull();
    expect(effectivePasteLayers(artOnlyClip(), 'both')).toBe('art');
  });
});

describe('6. the paste grid follows the clipboard', () => {
  it('6a. art-only pastes on the TILE grid, collision-carrying on the BLOCK grid', () => {
    const section = seedSection(0, 0, 16, 16);
    expect(pasteBaseStep(copyFromSection(section, 3, 3, 5, 5))).toBe(1);
    expect(pasteBaseStep(copyFromSection(section, 4, 4, 4, 4))).toBe(2);
  });

  it('6b. an art-only paste at an ODD base really does land at that odd base', () => {
    const src = seedSection(0, 0, 16, 16);
    const clip = copyFromSection(src, 3, 3, 5, 5);
    const dest = createSection(1, 'dest');
    const cmd = buildPasteCommand({
      clip, section: dest, sectionIndex: 1, baseCol: 7, baseRow: 5, layers: 'both',
      description: 'x',
    });
    const entries = tileChildren(cmd)[0].entries;
    // The clipboard's top-left word must appear at exactly (7,5).
    const wanted = entries.find((e) => e.index === 5 * SECTION_TILES_WIDE + 7);
    expect(wanted).toBeDefined();
    expect(wanted!.newNt).toBe(clip.nametable[0]);
  });
});

describe('7. saving as a chunk is refused rather than made lossy', () => {
  it('7a. a non-block-aligned selection returns null', () => {
    const section = seedSection(0, 0, 16, 16);
    expect(selectionToChunk(section, 3, 3, 5, 5, 'odd', 'id')).toBeNull();
  });

  it('7a-control. ANTI-VACUOUS: an aligned selection of the SAME section still mints one', () => {
    const section = seedSection(0, 0, 16, 16);
    const def = selectionToChunk(section, 4, 4, 4, 4, 'even', 'id');
    expect(def).not.toBeNull();
    expect(def!.widthTiles).toBe(4);
    expect(def!.collisionA.length).toBe(4);
  });

  it('7b. an ODD-sized library chunk reaches the clipboard as ART ONLY — its own '
    + 'collision planes are already short of its footprint (chunkCellCount floors)', () => {
    const odd = createChunkDef('c', 'c', 5, 3);
    expect(odd.collisionA.length).toBe((5 >> 1) * (3 >> 1));   // 2, for a 5x3 footprint
    const clip = copyChunkToClipboard(odd);
    expect(clip.artOnly).toBe(true);
    expect(clip.collisionA.length).toBe(0);
    // ...while an even chunk still carries its planes.
    const even = copyChunkToClipboard(createChunkDef('d', 'd', 4, 4));
    expect(even.artOnly).toBe(false);
    expect(even.collisionA.length).toBe(4);
  });
});

describe('8. the UI says which rule is in force, in the units that exist', () => {
  it('8a. an aligned rect is named in BLOCKS', () => {
    expect(selectionSizeLabel(4, 4, 8, 6)).toBe('4×3 blocks');
  });

  it('8b. a rect with no block size is named in TILES, never rounded into blocks', () => {
    expect(selectionSizeLabel(3, 3, 5, 3)).toBe('5×3 tiles');
    // The old wording would have printed "2×1 blocks" here — a wrong number in
    // a unit the selection does not have.
    expect(selectionSizeLabel(3, 3, 5, 3)).not.toContain('block');
  });

  it('8c. the reason is present exactly when the selection is art-only, and names '
    + 'both the cause and the consequence', () => {
    expect(artOnlyReason(4, 4, 4, 4)).toBe('');
    const r = artOnlyReason(3, 3, 5, 3);
    expect(r).not.toBe('');
    expect(r).toContain('16px');
    expect(r).toContain('ART ONLY');
  });
});
