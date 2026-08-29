// Chunk identity for aeon sections — owner ruling d-18c (docs/decisions.jsonl):
// a stamped chunk REMEMBERS its chunk by default, a checkbox DETACHES a
// placement into plain tiles, and the checkbox is usable both at stamp time and
// later on an already-placed stamp.
//
// This file holds the behaviour half (model + stamp + detach + propagation +
// undo). The wire format is test/formats/section-chunk-links.test.ts and the
// on-disk round trip is test/formats/aeon-chunk-links-roundtrip.test.ts.
//
// EVERY EXPECTATION IS DERIVED, NOT TYPED IN. Footprint sizes come from the
// ChunkDef the row builds, section strides from SECTION_TILES_WIDE, and tile
// counts from the section's own nametable — so a row cannot drift from the
// thing it guards by someone changing a constant.

import { describe, it, expect } from 'vitest';
import {
  createSection, createChunkDef, SECTION_TILES_WIDE,
} from '../../src/core/model/s4-types';
import type { ChunkDef, Section } from '../../src/core/model/s4-types';
import type { S4Level, SetChunkLinksCommand } from '../../src/core/editing/commands';
import { EditHistory } from '../../src/core/editing/history';
import { buildStampCommand } from '../../src/core/editing/map-stamp';
import { cellTileIndices } from '../../src/core/collision/collision-cell';
import { packCollisionCell } from '../../src/core/collision/collision-cell-word';
import {
  UNLINKED, MAX_PLACEMENT_ID,
  allocatePlacementId, buildChunkPropagationCommand, buildDetachAllCommand,
  buildActPropagationCommand, buildDetachCommand, chunkOriginAt,
  createSectionChunkLinks, danglingPlaneRefs,
  linkedTileIndices, placementsOfChunk, withLinkBreaks,
} from '../../src/core/editing/chunk-links';

const WORD_A = packCollisionCell({ shape: 5, xFlip: false, yFlip: false, solidity: 'all' });
const WORD_B = packCollisionCell({ shape: 9, xFlip: true, yFlip: false, solidity: 'top' });

function seededSection(): Section {
  const section = createSection(0, 'Test');
  const n = section.tileGrid.nametable.length;
  section.collisionEdit = new Uint16Array(n);
  section.collisionEditB = new Uint16Array(n);
  return section;
}

/** A chunk whose every tile word is distinct and non-zero, so "did this tile
 *  get the right word" is answerable per tile rather than up to a fill value. */
function distinctChunk(id: string, w: number, h: number, base = 0x100): ChunkDef {
  const chunk = createChunkDef(id, id, w, h);
  for (let i = 0; i < chunk.nametable.length; i++) chunk.nametable[i] = base + i;
  for (let i = 0; i < chunk.collisionA.length; i++) chunk.collisionA[i] = WORD_A;
  for (let i = 0; i < chunk.collisionB.length; i++) chunk.collisionB[i] = WORD_B;
  return chunk;
}

function idx(col: number, row: number): number {
  return row * SECTION_TILES_WIDE + col;
}

function run(section: Section, cmd: unknown): void {
  const level: S4Level = { sections: [section] };
  new EditHistory().execute(cmd as never, level);
}

// ── (1) the DEFAULT is remember ─────────────────────────────────────────────

describe('a stamp remembers its chunk BY DEFAULT (d-18c)', () => {
  it('records one placement covering exactly the chunk footprint, and nothing outside it', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 4, 4);
    const baseCol = 8, baseRow = 6;

    const cmd = buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol, baseRow, artOnly: false, description: 'stamp',
    });
    expect(cmd).not.toBeNull();
    run(section, cmd);

    const links = section.chunkLinks!;
    expect(links.placements).toHaveLength(1);
    const p = links.placements[0];
    expect(p).toMatchObject({ chunkId: 'c1', baseCol, baseRow, collision: true });
    expect(p.id).toBeGreaterThanOrEqual(1);

    // ANTI-VACUOUS: the plane is not simply "all p.id" and not simply empty.
    const linked = linkedTileIndices(links, p.id);
    expect(linked).toHaveLength(chunk.widthTiles * chunk.heightTiles);
    expect(linked.length).toBeLessThan(links.plane.length);

    // The linked set IS the footprint, checked by position both ways.
    const expected = new Set<number>();
    for (let r = 0; r < chunk.heightTiles; r++) {
      for (let c = 0; c < chunk.widthTiles; c++) expected.add(idx(baseCol + c, baseRow + r));
    }
    expect(new Set(linked)).toEqual(expected);

    // Immediately outside the footprint, on all four sides, is unlinked.
    expect(links.plane[idx(baseCol - 1, baseRow)]).toBe(UNLINKED);
    expect(links.plane[idx(baseCol + chunk.widthTiles, baseRow)]).toBe(UNLINKED);
    expect(links.plane[idx(baseCol, baseRow - 1)]).toBe(UNLINKED);
    expect(links.plane[idx(baseCol, baseRow + chunk.heightTiles)]).toBe(UNLINKED);

    expect(danglingPlaneRefs(links)).toEqual([]);
  });

  it('answers "what is this tile made of" and "find every copy of this chunk"', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 2, 2);

    // Two placements of the SAME chunk, plus one of another chunk.
    for (const [col, row] of [[0, 0], [20, 20]] as const) {
      run(section, buildStampCommand({
        chunk, section, sectionIndex: 0, baseCol: col, baseRow: row, artOnly: false, description: 's',
      }));
    }
    const other = distinctChunk('c2', 2, 2, 0x300);
    run(section, buildStampCommand({
      chunk: other, section, sectionIndex: 0, baseCol: 40, baseRow: 40, artOnly: false, description: 's',
    }));

    const links = section.chunkLinks!;
    const copies = placementsOfChunk(links, 'c1');
    expect(copies).toHaveLength(2);
    // Two copies of one chunk are DISTINCT placements — the property a bare
    // per-tile chunk id could not express, and the reason detach has a referent.
    expect(new Set(copies.map(p => p.id)).size).toBe(2);
    expect(copies.map(p => [p.baseCol, p.baseRow])).toEqual([[0, 0], [20, 20]]);

    expect(chunkOriginAt(section, idx(0, 0))!.chunkId).toBe('c1');
    expect(chunkOriginAt(section, idx(21, 21))!.chunkId).toBe('c1');
    expect(chunkOriginAt(section, idx(41, 41))!.chunkId).toBe('c2');
    // A tile no stamp touched remembers nothing — not "chunk 0".
    expect(chunkOriginAt(section, idx(100, 100))).toBeNull();
  });

  it('an art-only stamp records collision:false, so propagation never grows collision it did not write', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 2, 2);
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 4, baseRow: 4, artOnly: true, description: 'art only',
    }));
    expect(section.chunkLinks!.placements[0].collision).toBe(false);

    // The stamp really did leave collision alone, so the flag describes the
    // world and not just itself.
    for (const i of cellTileIndices(2, 2, SECTION_TILES_WIDE)) {
      expect(section.collisionEdit![i]).toBe(0);
    }
  });

  it('an ODD base records collision:false, because the write itself refuses collision there', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 2, 2);
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 5, baseRow: 4, artOnly: false, description: 'odd',
    }));
    const p = section.chunkLinks!.placements[0];
    // artOnly was FALSE — the request asked for collision. The placement records
    // what actually happened, which is the distinction that matters: recording
    // the request would let a later propagation write collision this stamp did
    // not, at cells buildRegionWriteCommand deliberately refused.
    expect(p.collision).toBe(false);
  });

  it('a later stamp STEALS the tiles it covers from an earlier one', () => {
    const section = seededSection();
    const a = distinctChunk('a', 4, 4);
    const b = distinctChunk('b', 2, 2, 0x500);
    run(section, buildStampCommand({
      chunk: a, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 'a',
    }));
    run(section, buildStampCommand({
      chunk: b, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 'b',
    }));

    const links = section.chunkLinks!;
    const [pa, pb] = links.placements;
    expect(pa.chunkId).toBe('a');
    expect(pb.chunkId).toBe('b');
    // b's 2x2 footprint is b's; a keeps the rest of its 4x4.
    expect(linkedTileIndices(links, pb.id)).toHaveLength(b.widthTiles * b.heightTiles);
    expect(linkedTileIndices(links, pa.id))
      .toHaveLength(a.widthTiles * a.heightTiles - b.widthTiles * b.heightTiles);
    expect(chunkOriginAt(section, idx(0, 0))!.chunkId).toBe('b');
    expect(chunkOriginAt(section, idx(3, 3))!.chunkId).toBe('a');
    expect(danglingPlaneRefs(links)).toEqual([]);
  });
});

// ── (2) the CHECKBOX — detach, at stamp time and later ──────────────────────

describe('detach: the checkbox, both at stamp time and afterwards (d-18c)', () => {
  it('AT STAMP TIME: detached:true writes the same art and records no placement', () => {
    const linkedSection = seededSection();
    const detachedSection = seededSection();
    const chunk = distinctChunk('c1', 4, 4);
    const at = { baseCol: 10, baseRow: 10, artOnly: false, description: 'stamp' };

    run(linkedSection, buildStampCommand({ chunk, section: linkedSection, sectionIndex: 0, ...at }));
    run(detachedSection, buildStampCommand({
      chunk, section: detachedSection, sectionIndex: 0, ...at, detached: true,
    }));

    // THE ART IS IDENTICAL — detaching is about identity only. Compared over the
    // whole nametable, so a difference anywhere would show.
    expect(Array.from(detachedSection.tileGrid.nametable))
      .toEqual(Array.from(linkedSection.tileGrid.nametable));
    // ...and the comparison is not vacuous: the stamp really wrote something.
    expect(linkedSection.tileGrid.nametable[idx(at.baseCol, at.baseRow)]).toBe(chunk.nametable[0]);

    expect(linkedSection.chunkLinks!.placements).toHaveLength(1);
    expect(detachedSection.chunkLinks?.placements ?? []).toHaveLength(0);
  });

  it('AT STAMP TIME over an EXISTING link: detached clears the old link rather than leaving it', () => {
    const section = seededSection();
    const a = distinctChunk('a', 4, 4);
    const b = distinctChunk('b', 4, 4, 0x600);
    run(section, buildStampCommand({
      chunk: a, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 'a',
    }));
    expect(section.chunkLinks!.placements).toHaveLength(1);

    run(section, buildStampCommand({
      chunk: b, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false,
      description: 'b detached', detached: true,
    }));

    // The tiles are b's art and remember NOTHING — not a's. Leaving a's link
    // would have the next propagation of `a` overwrite this stamp.
    expect(section.tileGrid.nametable[idx(0, 0)]).toBe(b.nametable[0]);
    expect(chunkOriginAt(section, idx(0, 0))).toBeNull();
    expect(section.chunkLinks!.placements).toHaveLength(0);
  });

  it('LATER, on an already-placed stamp: the link goes, the TILES DO NOT MOVE', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 4, 4);
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 8, baseRow: 8, artOnly: false, description: 'stamp',
    }));
    const before = Array.from(section.tileGrid.nametable);
    const collBefore = Array.from(section.collisionEdit!);
    const id = section.chunkLinks!.placements[0].id;

    const detach = buildDetachCommand({ section, sectionIndex: 0, placementId: id, description: 'detach' });
    expect(detach).not.toBeNull();
    run(section, detach);

    expect(Array.from(section.tileGrid.nametable)).toEqual(before);
    expect(Array.from(section.collisionEdit!)).toEqual(collBefore);
    expect(section.chunkLinks!.placements).toHaveLength(0);
    expect(section.chunkLinks!.plane.every(v => v === UNLINKED)).toBe(true);
  });

  it('LATER, on a stamp ALREADY PAINTED OVER BY HAND — the case d-18b called the open cost', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 4, 4);
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 'stamp',
    }));

    // Hand-paint one tile inside the footprint, through the same wrapper the UI
    // seam will use.
    const painted = idx(1, 1);
    run(section, withLinkBreaks(section, {
      type: 'set-tiles', description: 'brush', sectionIndex: 0,
      entries: [{ index: painted, oldNt: section.tileGrid.nametable[painted], newNt: 0xABC }],
    }));
    const id = section.chunkLinks!.placements[0].id;
    expect(chunkOriginAt(section, painted)).toBeNull();
    expect(linkedTileIndices(section.chunkLinks!, id))
      .toHaveLength(chunk.widthTiles * chunk.heightTiles - 1);

    const detach = buildDetachCommand({ section, sectionIndex: 0, placementId: id, description: 'detach' });
    expect(detach).not.toBeNull();
    run(section, detach);
    expect(section.chunkLinks!.placements).toHaveLength(0);
    // The hand-painted word survives the detach untouched.
    expect(section.tileGrid.nametable[painted]).toBe(0xABC);
  });

  it('detaching one of two placements of the same chunk leaves the other linked', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 2, 2);
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 's',
    }));
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 30, baseRow: 30, artOnly: false, description: 's',
    }));
    const first = section.chunkLinks!.placements[0];

    run(section, buildDetachCommand({
      section, sectionIndex: 0, placementId: first.id, description: 'detach one',
    }));

    expect(placementsOfChunk(section.chunkLinks!, 'c1')).toHaveLength(1);
    expect(chunkOriginAt(section, idx(0, 0))).toBeNull();
    expect(chunkOriginAt(section, idx(30, 30))!.chunkId).toBe('c1');
  });

  it('detaching a placement that is not there is a no-op, not an error', () => {
    const section = seededSection();
    expect(buildDetachCommand({ section, sectionIndex: 0, placementId: 1, description: 'd' })).toBeNull();
    run(section, buildStampCommand({
      chunk: distinctChunk('c1', 2, 2), section, sectionIndex: 0,
      baseCol: 0, baseRow: 0, artOnly: false, description: 's',
    }));
    const live = section.chunkLinks!.placements[0].id;
    expect(buildDetachCommand({ section, sectionIndex: 0, placementId: live + 1, description: 'd' })).toBeNull();
  });

  it('detach-all clears every placement in one step', () => {
    const section = seededSection();
    for (const col of [0, 10, 20]) {
      run(section, buildStampCommand({
        chunk: distinctChunk(`c${col}`, 2, 2), section, sectionIndex: 0,
        baseCol: col, baseRow: 0, artOnly: false, description: 's',
      }));
    }
    expect(section.chunkLinks!.placements).toHaveLength(3);
    run(section, buildDetachAllCommand({ section, sectionIndex: 0, description: 'detach all' }));
    expect(section.chunkLinks!.placements).toHaveLength(0);
    expect(section.chunkLinks!.plane.every(v => v === UNLINKED)).toBe(true);
  });
});

// ── (3) propagation ─────────────────────────────────────────────────────────

describe('propagation: editing a library chunk updates the cells that still remember it', () => {
  it('rewrites every still-linked tile of every placement, and touches nothing else', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 4, 4);
    const other = distinctChunk('c2', 2, 2, 0x700);
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 's',
    }));
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 20, baseRow: 20, artOnly: false, description: 's',
    }));
    run(section, buildStampCommand({
      chunk: other, section, sectionIndex: 0, baseCol: 60, baseRow: 60, artOnly: false, description: 's',
    }));
    const otherWordBefore = section.tileGrid.nametable[idx(60, 60)];

    // The author edits the chunk in the library.
    for (let i = 0; i < chunk.nametable.length; i++) chunk.nametable[i] = 0x200 + i;

    const cmd = buildChunkPropagationCommand({ chunk, section, sectionIndex: 0, description: 'chunk edit' });
    expect(cmd).not.toBeNull();
    run(section, cmd);

    // BOTH placements moved, per tile, to the chunk's NEW words.
    for (const [bc, br] of [[0, 0], [20, 20]] as const) {
      for (let r = 0; r < chunk.heightTiles; r++) {
        for (let c = 0; c < chunk.widthTiles; c++) {
          expect(section.tileGrid.nametable[idx(bc + c, br + r)])
            .toBe(chunk.nametable[r * chunk.widthTiles + c]);
        }
      }
    }
    // A different chunk's placement is untouched.
    expect(section.tileGrid.nametable[idx(60, 60)]).toBe(otherWordBefore);
    // And so is empty space.
    expect(section.tileGrid.nametable[idx(120, 120)]).toBe(0);
  });

  it('SKIPS a tile that was hand-painted — the whole reason the plane exists', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 4, 4);
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 's',
    }));

    const painted = idx(2, 1);
    const handWord = 0xABC;
    run(section, withLinkBreaks(section, {
      type: 'set-tiles', description: 'brush', sectionIndex: 0,
      entries: [{ index: painted, oldNt: section.tileGrid.nametable[painted], newNt: handWord }],
    }));

    for (let i = 0; i < chunk.nametable.length; i++) chunk.nametable[i] = 0x200 + i;
    run(section, buildChunkPropagationCommand({ chunk, section, sectionIndex: 0, description: 'chunk edit' }));

    // The hand-painted tile kept the author's word...
    expect(section.tileGrid.nametable[painted]).toBe(handWord);
    // ...while its NEIGHBOURS in the same placement took the chunk's new word,
    // so the row is measuring "skipped this one", not "propagation did nothing".
    expect(section.tileGrid.nametable[idx(1, 1)]).toBe(chunk.nametable[1 * chunk.widthTiles + 1]);
    expect(section.tileGrid.nametable[idx(3, 1)]).toBe(chunk.nametable[1 * chunk.widthTiles + 3]);
  });

  it('replays collision only for placements whose stamp wrote it, and only for WHOLE cells', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 4, 4);
    // One stamp with collision, one art-only.
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 'with',
    }));
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 20, baseRow: 20, artOnly: true, description: 'art only',
    }));
    // Break ONE sub-tile of the first placement's cell (1,1) — that cell is no
    // longer wholly the placement's, so its collision must not be replayed.
    const brokenCell = cellTileIndices(1, 1, SECTION_TILES_WIDE);
    run(section, withLinkBreaks(section, {
      type: 'set-tiles', description: 'brush', sectionIndex: 0,
      entries: [{ index: brokenCell[0], oldNt: section.tileGrid.nametable[brokenCell[0]], newNt: 0xABC }],
    }));

    const NEW_A = packCollisionCell({ shape: 12, xFlip: false, yFlip: true, solidity: 'sides-bottom' });
    for (let i = 0; i < chunk.collisionA.length; i++) chunk.collisionA[i] = NEW_A;
    run(section, buildChunkPropagationCommand({ chunk, section, sectionIndex: 0, description: 'chunk edit' }));

    // Cell (0,0) of the collision-carrying placement: whole, so it moved.
    for (const i of cellTileIndices(0, 0, SECTION_TILES_WIDE)) {
      expect(section.collisionEdit![i]).toBe(NEW_A);
    }
    // Cell (1,1): a sub-tile was repainted, so it keeps the ORIGINAL word — and
    // 2x2 uniformity is preserved rather than three-quarters updated.
    for (const i of brokenCell) expect(section.collisionEdit![i]).toBe(WORD_A);
    // The art-only placement's cells never had collision and still do not.
    for (const i of cellTileIndices(10, 10, SECTION_TILES_WIDE)) {
      expect(section.collisionEdit![i]).toBe(0);
    }
  });

  it('a DETACHED placement is not propagated to — the checkbox actually works', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 4, 4);
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 'linked',
    }));
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 20, baseRow: 20, artOnly: false,
      description: 'detached', detached: true,
    }));
    const detachedBefore = section.tileGrid.nametable[idx(20, 20)];

    for (let i = 0; i < chunk.nametable.length; i++) chunk.nametable[i] = 0x200 + i;
    run(section, buildChunkPropagationCommand({ chunk, section, sectionIndex: 0, description: 'chunk edit' }));

    expect(section.tileGrid.nametable[idx(0, 0)]).toBe(chunk.nametable[0]);
    expect(section.tileGrid.nametable[idx(20, 20)]).toBe(detachedBefore);
    // ...and the two really did start equal, so the row is a comparison and not
    // an accident of two different fills.
    expect(detachedBefore).not.toBe(chunk.nametable[0]);
  });

  it('a chunk that SHRANK leaves its old fringe alone instead of reading past its end', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 4, 4);
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 's',
    }));
    const fringeBefore = section.tileGrid.nametable[idx(3, 3)];

    const smaller = distinctChunk('c1', 2, 2, 0x900);
    run(section, buildChunkPropagationCommand({
      chunk: smaller, section, sectionIndex: 0, description: 'chunk shrank',
    }));

    // Inside the new size: updated.
    expect(section.tileGrid.nametable[idx(1, 1)])
      .toBe(smaller.nametable[1 * smaller.widthTiles + 1]);
    // Outside it: untouched, and no NaN/undefined leaked in from past the end.
    expect(section.tileGrid.nametable[idx(3, 3)]).toBe(fringeBefore);
    expect(Number.isInteger(section.tileGrid.nametable[idx(3, 3)])).toBe(true);
  });

  it('propagates across a WHOLE ACT in one undo step, indexed by FLAT act slot', () => {
    // Three slots, the middle one EMPTY, so a helper that filtered nulls and
    // then used the filtered position would aim section 2's writes at section 1.
    const s0 = seededSection();
    const s2 = seededSection();
    s2.index = 2;
    const sections: (Section | null)[] = [s0, null, s2];
    const chunk = distinctChunk('c1', 4, 4);

    for (const [sec, i] of [[s0, 0], [s2, 2]] as const) {
      const level: S4Level = { sections };
      new EditHistory().execute(buildStampCommand({
        chunk, section: sec, sectionIndex: i, baseCol: 0, baseRow: 0, artOnly: false, description: 's',
      })!, level);
    }

    for (let i = 0; i < chunk.nametable.length; i++) chunk.nametable[i] = 0x200 + i;
    const cmd = buildActPropagationCommand({ chunk, sections, description: 'chunk edit' });
    expect(cmd).not.toBeNull();
    // One child per POPULATED section that had a placement, and every child's
    // index is the flat act slot.
    expect(cmd!.commands.map(c => c.sectionIndex)).toEqual([0, 2]);

    const level: S4Level = { sections };
    const history = new EditHistory();
    history.execute(cmd!, level);
    expect(s0.tileGrid.nametable[idx(0, 0)]).toBe(chunk.nametable[0]);
    expect(s2.tileGrid.nametable[idx(0, 0)]).toBe(chunk.nametable[0]);

    // ONE undo, both sections back.
    history.undo(level);
    expect(s0.tileGrid.nametable[idx(0, 0)]).toBe(0x100);
    expect(s2.tileGrid.nametable[idx(0, 0)]).toBe(0x100);
    expect(history.canUndo).toBe(false);
  });

  it('act propagation with nothing to do returns null', () => {
    expect(buildActPropagationCommand({
      chunk: distinctChunk('c1', 2, 2), sections: [null, createSection(1, 'fresh')], description: 'p',
    })).toBeNull();
  });

  it('propagating a chunk with no placements here returns null', () => {
    const section = seededSection();
    run(section, buildStampCommand({
      chunk: distinctChunk('c1', 2, 2), section, sectionIndex: 0,
      baseCol: 0, baseRow: 0, artOnly: false, description: 's',
    }));
    expect(buildChunkPropagationCommand({
      chunk: distinctChunk('elsewhere', 2, 2), section, sectionIndex: 0, description: 'p',
    })).toBeNull();
    // ...and a section with no links at all.
    expect(buildChunkPropagationCommand({
      chunk: distinctChunk('c1', 2, 2), section: createSection(1, 'fresh'), sectionIndex: 1, description: 'p',
    })).toBeNull();
  });
});

// ── (4) undo/redo ───────────────────────────────────────────────────────────

describe('chunk identity is undoable in one step with the art it rode in on', () => {
  it('undoing a stamp removes the placement AND the art; redo restores both', () => {
    const section = seededSection();
    const level: S4Level = { sections: [section] };
    const history = new EditHistory();
    const chunk = distinctChunk('c1', 4, 4);

    history.execute(buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 4, baseRow: 4, artOnly: false, description: 'stamp',
    })!, level);
    const id = section.chunkLinks!.placements[0].id;

    history.undo(level);
    expect(section.chunkLinks!.placements).toHaveLength(0);
    expect(section.chunkLinks!.plane.every(v => v === UNLINKED)).toBe(true);
    expect(section.tileGrid.nametable[idx(4, 4)]).toBe(0);

    history.redo(level);
    expect(section.chunkLinks!.placements).toHaveLength(1);
    expect(section.chunkLinks!.placements[0].id).toBe(id);
    expect(section.tileGrid.nametable[idx(4, 4)]).toBe(chunk.nametable[0]);
    expect(danglingPlaneRefs(section.chunkLinks!)).toEqual([]);
  });

  it('undoing a DETACH restores the placement under its original id, with its tiles', () => {
    const section = seededSection();
    const level: S4Level = { sections: [section] };
    const history = new EditHistory();
    const chunk = distinctChunk('c1', 4, 4);

    history.execute(buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 4, baseRow: 4, artOnly: false, description: 'stamp',
    })!, level);
    const before = section.chunkLinks!.placements[0];
    const linkedBefore = linkedTileIndices(section.chunkLinks!, before.id);

    history.execute(buildDetachCommand({
      section, sectionIndex: 0, placementId: before.id, description: 'detach',
    })!, level);
    expect(section.chunkLinks!.placements).toHaveLength(0);

    history.undo(level);
    expect(section.chunkLinks!.placements).toHaveLength(1);
    // The SAME id, not a fresh one: the plane's restored oldRefs name it, so a
    // renumbering here would be a section full of dangling references.
    expect(section.chunkLinks!.placements[0]).toEqual(before);
    expect(linkedTileIndices(section.chunkLinks!, before.id)).toEqual(linkedBefore);
    expect(danglingPlaneRefs(section.chunkLinks!)).toEqual([]);
  });

  it('undoing a propagation restores the pre-edit words and leaves identity intact', () => {
    const section = seededSection();
    const level: S4Level = { sections: [section] };
    const history = new EditHistory();
    const chunk = distinctChunk('c1', 4, 4);

    history.execute(buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 'stamp',
    })!, level);
    const before = Array.from(section.tileGrid.nametable);

    for (let i = 0; i < chunk.nametable.length; i++) chunk.nametable[i] = 0x200 + i;
    history.execute(buildChunkPropagationCommand({
      chunk, section, sectionIndex: 0, description: 'chunk edit',
    })!, level);
    expect(Array.from(section.tileGrid.nametable)).not.toEqual(before);

    history.undo(level);
    expect(Array.from(section.tileGrid.nametable)).toEqual(before);
    // Undoing the ART does not undo the LINK: the placement still remembers the
    // chunk, so re-propagating would move it again.
    expect(section.chunkLinks!.placements).toHaveLength(1);
  });
});

// ── (5) withLinkBreaks — the wrapper the UI seam uses ───────────────────────

describe('withLinkBreaks: art written by anything but its own stamp breaks the link', () => {
  it('returns the command UNCHANGED when there is nothing to clear', () => {
    const section = seededSection();
    const cmd = {
      type: 'set-tiles' as const, description: 'brush', sectionIndex: 0,
      entries: [{ index: idx(5, 5), oldNt: 0, newNt: 1 }],
    };
    // No links at all.
    expect(withLinkBreaks(section, cmd)).toBe(cmd);

    // Links exist, but not at the tile being written.
    run(section, buildStampCommand({
      chunk: distinctChunk('c1', 2, 2), section, sectionIndex: 0,
      baseCol: 60, baseRow: 60, artOnly: false, description: 's',
    }));
    expect(withLinkBreaks(section, cmd)).toBe(cmd);
  });

  it('is a NO-OP over a stamp batch, which already decides its own footprint', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 4, 4);
    const stamp = buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 'stamp',
    })!;
    // ANTI-VACUOUS: the batch really does write art AND decide identity, which
    // is the composition being tested. Without both, "unchanged" proves nothing.
    expect(stamp.commands.map(c => c.type)).toContain('set-tiles');
    expect(stamp.commands.map(c => c.type)).toContain('set-chunk-links');
    expect(withLinkBreaks(section, stamp)).toBe(stamp);
  });

  it('drops a placement whose LAST tile was painted over, so no empty copy survives', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 2, 2);
    run(section, buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 's',
    }));
    const id = section.chunkLinks!.placements[0].id;

    const entries = [];
    for (let r = 0; r < chunk.heightTiles; r++) {
      for (let c = 0; c < chunk.widthTiles; c++) {
        const i = idx(c, r);
        entries.push({ index: i, oldNt: section.tileGrid.nametable[i], newNt: 0xABC });
      }
    }
    run(section, withLinkBreaks(section, {
      type: 'set-tiles', description: 'paint over all of it', sectionIndex: 0, entries,
    }));

    expect(section.chunkLinks!.placements).toHaveLength(0);
    expect(placementsOfChunk(section.chunkLinks!, 'c1')).toEqual([]);
    expect(linkedTileIndices(section.chunkLinks!, id)).toEqual([]);
    expect(danglingPlaneRefs(section.chunkLinks!)).toEqual([]);
  });

  it('a COLLISION-only command is left alone — a chunk link is about art', () => {
    const section = seededSection();
    run(section, buildStampCommand({
      chunk: distinctChunk('c1', 2, 2), section, sectionIndex: 0,
      baseCol: 0, baseRow: 0, artOnly: false, description: 's',
    }));
    const cmd = {
      type: 'set-collision-edit' as const, plane: 'a' as const, description: 'paint coll', sectionIndex: 0,
      entries: cellTileIndices(0, 0, SECTION_TILES_WIDE)
        .map(i => ({ index: i, oldColl: WORD_A, newColl: 0 })),
    };
    expect(withLinkBreaks(section, cmd)).toBe(cmd);
  });
});

// ── (6) id allocation ───────────────────────────────────────────────────────

describe('placement ids are stable and never reused', () => {
  it('a fresh section starts at 1 and ids climb past a detached high water mark', () => {
    const links = createSectionChunkLinks(16);
    expect(allocatePlacementId(links)).toBe(1);
    expect(allocatePlacementId(null)).toBe(1);

    links.placements.push({ id: 7, chunkId: 'c', baseCol: 0, baseRow: 0, collision: false });
    expect(allocatePlacementId(links)).toBe(8);
    // Detaching the highest does NOT free its id: reuse would silently join a
    // new stamp to whatever plane entries an undo later restores.
    links.placements.length = 0;
    links.placements.push({ id: 3, chunkId: 'c', baseCol: 0, baseRow: 0, collision: false });
    expect(allocatePlacementId(links)).toBe(4);
  });

  it('throws at the ceiling rather than wrapping to an id already in use', () => {
    const links = createSectionChunkLinks(16);
    links.placements.push({
      id: MAX_PLACEMENT_ID, chunkId: 'c', baseCol: 0, baseRow: 0, collision: false,
    });
    expect(() => allocatePlacementId(links)).toThrow(/exhausted/);
  });
});

// ── (7) the invariant checker itself ────────────────────────────────────────

describe('danglingPlaneRefs is not vacuous', () => {
  it('names a plane value with no matching placement', () => {
    const links = createSectionChunkLinks(16);
    links.placements.push({ id: 1, chunkId: 'c', baseCol: 0, baseRow: 0, collision: false });
    links.plane[0] = 1;
    expect(danglingPlaneRefs(links)).toEqual([]);
    links.plane[1] = 9;
    links.plane[2] = 4;
    expect(danglingPlaneRefs(links)).toEqual([4, 9]);
  });
});

// ── (8) the command carries copies, not live records ────────────────────────

describe('a set-chunk-links command never aliases the section it edited', () => {
  it('mutating the section afterwards does not rewrite the command s undo data', () => {
    const section = seededSection();
    const chunk = distinctChunk('c1', 2, 2);
    const stamp = buildStampCommand({
      chunk, section, sectionIndex: 0, baseCol: 0, baseRow: 0, artOnly: false, description: 'stamp',
    })!;
    const linkChild = stamp.commands.find(c => c.type === 'set-chunk-links') as SetChunkLinksCommand;
    run(section, stamp);

    section.chunkLinks!.placements[0].chunkId = 'MUTATED';
    expect(linkChild.addedPlacements![0].chunkId).toBe('c1');
  });
});
