// Priority-mask unit proof for the viewport's priority lens (audit §3, docs/
// reviews/2026-08-21-s1-viewport-lenses-audit.md).
//
// Two layers of evidence:
//
// 1. REAL DATA — SBZ (the zone with 68 of the 73 mixed-priority blocks) is
//    decoded with Aurora's own enigma decoder and two audit spot-check blocks
//    are pinned against their HAND-DERIVED raw words (bit 15 of each pattern
//    word is the priority bit, model.ts layout):
//      block $11: 0x4016 0x4017 0xC005 0xC006 → pri [TL,TR,BL,BR] = [0,0,1,1]
//      block $5A: 0xC0AE 0x4087 0x4015 0x4015 → pri [TL,TR,BL,BR] = [1,0,0,0]
//    ($5A is the flip fixture on purpose: a single high tile makes all four
//    flip states DISTINCT. $11 is top/bottom symmetric under x-flip, so it
//    alone could never catch an ignored xf.)
//
// 2. THE FLIP TRAP — a chunk cell's xf/yf flips the whole block (arrangement
//    AND pixels, render.ts blitRgba). The mask must mirror the quad on the
//    same axes; the expected quads below are hand-derived mirrors:
//      $5A [1,0,0,0]:  xf → [0,1,0,0]   yf → [0,0,1,0]   xf+yf → [0,0,0,1]
//      $11 [0,0,1,1]:  xf → [0,0,1,1]   yf → [1,1,0,0]   xf+yf → [1,1,0,0]
//    And the BLOCK cell's own xf/yf must NOT move the bit (it flips pixels in
//    place, never the tile position) — pinned with real block $B6, whose high
//    TL cell (0xD91A) carries both block-cell flips.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { enigmaDecompress } from '../../formats/classic/enigma';
import { unpackBlockCell, unpackChunkCell, type BlockDef, type ChunkCell, type LevelDoc } from '../model';
import { blockPriorityQuad, chunkPriorityMask, CHUNK_TILES } from '../priority-mask';
import { referencePath } from '../../../../test/support/fixture-tree';
import { whenS1Files, missingS1Files } from '../../../../test/support/s1-checkout';

const S1DIR = referencePath('s1disasm');

/**
 * THE ONE FILE THIS SUITE READS, and why the guard names it rather than the tree.
 *
 * The gate here used to be `referenceCheckout('s1disasm')` — top-level markers
 * only. On a checkout with the markers and no `map16/`, that gate said PRESENT,
 * `loadSbzBlocks()` ran in the describe BODY, and the ENOENT it threw was a
 * COLLECTION failure: vitest reported `1 failed | no tests`, and all ten rows of
 * this file vanished from the totals — INCLUDING the four in the two synthetic
 * describes below, which read nothing at all. Measured 2026-08-30
 * (`docs/reviews/2026-08-30-incomplete-checkout-rows.md`). A guard on the actual
 * file keeps those four running and turns the other six into one named skip.
 */
const SBZ_MAP16 = 'map16/SBZ.eni';
const SBZ_PRESENT = missingS1Files([SBZ_MAP16]).length === 0;

/** Decode SBZ's real map16 into BlockDefs via the same unpacker s1-io uses. */
function loadSbzBlocks(): BlockDef[] {
  const raw = new Uint8Array(fs.readFileSync(path.join(S1DIR, 'map16/SBZ.eni')));
  const dec = enigmaDecompress(raw);
  const blocks: BlockDef[] = [];
  for (let b = 0; b < dec.length / 8; b++) {
    const cells = [];
    for (let i = 0; i < 4; i++) {
      cells.push(unpackBlockCell((dec[b * 8 + i * 2] << 8) | dec[b * 8 + i * 2 + 1]));
    }
    blocks.push({ cells });
  }
  return blocks;
}

/** Synthetic block from 4 pattern words (TL,TR,BL,BR) — for the no-disasm path. */
function blockFromWords(words: number[]): BlockDef {
  return { cells: words.map(unpackBlockCell) };
}

// The measured SBZ words (scratchpad/probe-sbz-pri.mts / probe-sbz-pri-asym.mts
// over the real map16/SBZ.eni). The real-data suite below asserts the file
// still decodes to exactly these, so the synthetic fixtures cannot drift.
const SBZ_11_WORDS = [0x4016, 0x4017, 0xc005, 0xc006];
const SBZ_5A_WORDS = [0xc0ae, 0x4087, 0x4015, 0x4015];
const SBZ_B6_WORDS = [0xd91a, 0x4915, 0xc8f6, 0xc917];

const quad = (tl: number, tr: number, bl: number, br: number) => [!!tl, !!tr, !!bl, !!br];

describe('priority bits of real SBZ blocks (hand-derived)', whenS1Files('the real SBZ block table', [SBZ_MAP16]), () => {
  const blocks = SBZ_PRESENT ? loadSbzBlocks() : [];

  it('block $11 decodes to the hand-derived words and pri [0,0,1,1]', () => {
    // 0x4016: bit 15 clear → low. 0xC005: bit 15 set → high.
    const cells = blocks[0x11].cells;
    expect(cells.map((c) => c.pri)).toEqual(quad(0, 0, 1, 1));
    expect(cells.map((c) => c.tile)).toEqual([0x16, 0x17, 0x05, 0x06]);
  });

  it('block $5A decodes to the hand-derived words and pri [1,0,0,0]', () => {
    // 0xC0AE: bit 15 set → high TL. 0x4087/0x4015: bit 15 clear → low.
    const cells = blocks[0x5a].cells;
    expect(cells.map((c) => c.pri)).toEqual(quad(1, 0, 0, 0));
    expect(cells.map((c) => c.tile)).toEqual([0xae, 0x87, 0x15, 0x15]);
  });

  it('the real file matches the synthetic fixture words used below', () => {
    // Guards the synthetic suite against fixture drift: if SBZ.eni ever
    // changes, this names the divergence instead of both suites silently
    // testing different data.
    const dec = enigmaDecompress(new Uint8Array(fs.readFileSync(path.join(S1DIR, 'map16/SBZ.eni'))));
    const words = (id: number) =>
      Array.from({ length: 4 }, (_, i) => (dec[id * 8 + i * 2] << 8) | dec[id * 8 + i * 2 + 1]);
    expect(words(0x11)).toEqual(SBZ_11_WORDS);
    expect(words(0x5a)).toEqual(SBZ_5A_WORDS);
    expect(words(0xb6)).toEqual(SBZ_B6_WORDS);
  });

  it('blockPriorityQuad on real $5A mirrors correctly under every chunk-cell flip', () => {
    const b = blocks[0x5a];
    expect(blockPriorityQuad(b, false, false)).toEqual(quad(1, 0, 0, 0));
    expect(blockPriorityQuad(b, true, false)).toEqual(quad(0, 1, 0, 0)); // high TL → TR
    expect(blockPriorityQuad(b, false, true)).toEqual(quad(0, 0, 1, 0)); // high TL → BL
    expect(blockPriorityQuad(b, true, true)).toEqual(quad(0, 0, 0, 1)); // high TL → BR
  });

  it('blockPriorityQuad on real $11 (x-symmetric): xf is a no-op, yf mirrors', () => {
    const b = blocks[0x11];
    expect(blockPriorityQuad(b, false, false)).toEqual(quad(0, 0, 1, 1));
    expect(blockPriorityQuad(b, true, false)).toEqual(quad(0, 0, 1, 1));
    expect(blockPriorityQuad(b, false, true)).toEqual(quad(1, 1, 0, 0));
    expect(blockPriorityQuad(b, true, true)).toEqual(quad(1, 1, 0, 0));
  });

  it('BLOCK-cell flips never move the bit: real $B6 whose high TL (0xD91A) is itself double-flipped', () => {
    const b = blocks[0xb6];
    // 0xD91A: bit 15 set (pri), bits 11+12 set (block-cell xf+yf) — the tile's
    // PIXELS are mirrored but the tile stays TL, so the quad is by position only.
    expect(b.cells[0].xf && b.cells[0].yf && b.cells[0].pri).toBe(true);
    expect(blockPriorityQuad(b, false, false)).toEqual(quad(1, 0, 1, 1));
    expect(blockPriorityQuad(b, true, false)).toEqual(quad(0, 1, 1, 1));
  });
});

describe('blockPriorityQuad (synthetic, no disasm needed)', () => {
  const b5a = blockFromWords(SBZ_5A_WORDS);

  it('mirrors the $5A pattern under all four flip states', () => {
    expect(blockPriorityQuad(b5a, false, false)).toEqual(quad(1, 0, 0, 0));
    expect(blockPriorityQuad(b5a, true, false)).toEqual(quad(0, 1, 0, 0));
    expect(blockPriorityQuad(b5a, false, true)).toEqual(quad(0, 0, 1, 0));
    expect(blockPriorityQuad(b5a, true, true)).toEqual(quad(0, 0, 0, 1));
  });

  it('a missing block is all-low, never a throw', () => {
    expect(blockPriorityQuad(undefined, true, true)).toEqual(quad(0, 0, 0, 0));
  });
});

describe('chunkPriorityMask', () => {
  // One chunk placing the $5A-pattern block at four cells, one per flip state —
  // the placements the viewport actually draws. Cell layout (16 cells/row):
  //   cell (0,0) unflipped   cell (1,0) xf   cell (0,1) yf   cell (1,1) xf+yf
  function makeDoc(): LevelDoc {
    const cells: ChunkCell[] = Array.from({ length: 256 }, () => unpackChunkCell(0x3ff)); // out-of-range ref → all-low
    const place = (cx: number, cy: number, xf: boolean, yf: boolean): void => {
      cells[cy * 16 + cx] = { block: 1, xf, yf, solidity: 0 };
    };
    place(0, 0, false, false);
    place(1, 0, true, false);
    place(0, 1, false, true);
    place(1, 1, true, true);
    return {
      game: 's1',
      tiles: new Uint8Array(0),
      blocks: [blockFromWords([0, 0, 0, 0]), blockFromWords(SBZ_5A_WORDS)],
      chunks: [{ cells }],
      fg: { width: 1, height: 1, cells: new Uint8Array(1) },
      bg: { width: 1, height: 1, cells: new Uint8Array(1) },
      collision: { colind: new Uint8Array(2), shapes: { heights: [], angles: new Uint8Array() } },
      palettes: [],
      paletteSources: [] as unknown as LevelDoc['paletteSources'],
      objects: [],
      start: { x: 0, y: 0 },
      sourceRefs: {},
    } as unknown as LevelDoc;
  }

  const at = (mask: Uint8Array, tx: number, ty: number) => mask[ty * CHUNK_TILES + tx];

  it('places the high tile in the correct QUADRANT for each flip state (the trap test)', () => {
    const mask = chunkPriorityMask(makeDoc(), 1); // engine id 1 = chunks[0]
    expect(mask).not.toBeNull();
    // Hand-derived tile coordinates. Cell (0,0) spans tiles (0..1, 0..1);
    // unflipped $5A puts its single high tile at TL = tile (0,0).
    expect(at(mask!, 0, 0)).toBe(1);
    expect(at(mask!, 1, 0)).toBe(0);
    expect(at(mask!, 0, 1)).toBe(0);
    expect(at(mask!, 1, 1)).toBe(0);
    // Cell (1,0) spans tiles (2..3, 0..1); xf mirrors TL → TR = tile (3,0).
    expect(at(mask!, 3, 0)).toBe(1);
    expect(at(mask!, 2, 0)).toBe(0);
    expect(at(mask!, 2, 1)).toBe(0);
    expect(at(mask!, 3, 1)).toBe(0);
    // Cell (0,1) spans tiles (0..1, 2..3); yf mirrors TL → BL = tile (0,3).
    expect(at(mask!, 0, 3)).toBe(1);
    expect(at(mask!, 0, 2)).toBe(0);
    expect(at(mask!, 1, 2)).toBe(0);
    expect(at(mask!, 1, 3)).toBe(0);
    // Cell (1,1) spans tiles (2..3, 2..3); xf+yf mirrors TL → BR = tile (3,3).
    expect(at(mask!, 3, 3)).toBe(1);
    expect(at(mask!, 2, 2)).toBe(0);
    expect(at(mask!, 3, 2)).toBe(0);
    expect(at(mask!, 2, 3)).toBe(0);
    // Exactly 4 high tiles in the whole chunk — nothing leaked elsewhere.
    expect(mask!.reduce((a, v) => a + v, 0)).toBe(4);
  });

  it('air ($00) and out-of-range chunk ids yield null, matching renderChunk', () => {
    const doc = makeDoc();
    expect(chunkPriorityMask(doc, 0)).toBeNull();
    expect(chunkPriorityMask(doc, 2)).toBeNull();
  });
});
