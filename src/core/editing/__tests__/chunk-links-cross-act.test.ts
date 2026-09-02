// CROSS-ACT CHUNK COPIES — the promise the panel makes vs the scope the
// mechanism has.
//
// THE DEFECT THIS FILE EXISTS FOR. The chunk library is PROJECT-WIDE (one
// `chunkLibrary` on the project, one `chunkLibrary` path in project.json), but
// `buildActPropagationCommand` walks ONE act's slot array. So a stamp of the
// same library chunk in a second act keeps its link, is never re-stamped, and
// diverges from the chunk it claims to remember — while ChunkLinkOptions told
// the author "editing the chunk later updates every copy".
//
// WHY A ONE-ACT FIXTURE CANNOT SEE IT. Every row below needs at least TWO acts
// holding the same chunk, and has to assert on what happens to the SECOND one.
// A project with one act, or with no links at all, passes every "nothing was
// wrongly written" claim for free. So each row also asserts the instrument saw
// its subject: the out-of-act copies really existed, and the in-act ones really
// were reached.
//
// NO PINNED LITERALS. Expected counts are re-derived from the fixture by an
// independent traversal (`countPlacements`) rather than written down, so
// changing the fixture cannot leave a stale number passing.

import { describe, it, expect } from 'vitest';
import {
  buildActPropagationCommand,
  buildStampLinkChild,
  ensureChunkLinks,
  findOutOfActChunkCopies,
  describeOutOfActChunkCopies,
  placementsOfChunk,
  CHUNK_LINK_LINKED_BLURB,
  CHUNK_LINK_DETACHED_BLURB,
} from '../chunk-links';
import {
  createSection, createChunkDef, packNametableWord, SECTION_TILES_WIDE,
} from '../../model/s4-types';
import type { Act, ChunkDef, Color, Section, Tile, Zone } from '../../model/s4-types';
import { EditHistory } from '../history';
import type { S4Level } from '../commands';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { unknownWiring } from '../../formats/effects/section-wiring';

const black = (): Color => ({ r: 0, g: 0, b: 0, a: 255 });
const line = () => ({ colors: Array.from({ length: 16 }, black) });
const tile = (): Tile => ({ pixels: new Uint8Array(64) });

/** A 4x4 chunk carrying REAL art in every cell — an all-air chunk would make
 *  "the stamp wrote something" unfalsifiable. */
function fixtureChunk(id: string, seed: number): ChunkDef {
  const c = createChunkDef(id, id.toUpperCase(), 4, 4);
  for (let i = 0; i < c.nametable.length; i++) {
    c.nametable[i] = packNametableWord(1 + ((i + seed) % 6), 0, false, false, false);
  }
  return c;
}

/** Stamp `chunk` into `section` at (col,row), recording the link. Mirrors what
 *  the map's stamp tool does: write the art words AND claim the plane. */
function stamp(section: Section, chunk: ChunkDef, col: number, row: number, id: number): void {
  const links = ensureChunkLinks(section);
  section.chunkLinks = links;
  for (let r = 0; r < chunk.heightTiles; r++) {
    for (let c = 0; c < chunk.widthTiles; c++) {
      section.tileGrid.nametable[(row + r) * SECTION_TILES_WIDE + (col + c)]
        = chunk.nametable[r * chunk.widthTiles + c];
    }
  }
  const child = buildStampLinkChild({
    section, sectionIndex: 0, baseCol: col, baseRow: row,
    widthTiles: chunk.widthTiles, heightTiles: chunk.heightTiles,
    placement: { id, chunkId: chunk.id, baseCol: col, baseRow: row, collision: false },
    description: 'stamp',
  });
  if (!child) throw new Error('fixture stamp recorded no link — the fixture is broken');
  // Apply the link child by hand; the fixture has no history to run it through.
  for (const e of child.entries) links.plane[e.index] = e.newRef;
  for (const p of child.addedPlacements ?? []) links.placements.push({ ...p });
}

function act(id: string, sectionCount: number): Act {
  return {
    id, gridWidth: sectionCount, gridHeight: 1,
    sections: Array.from({ length: sectionCount }, (_, i) => createSection(i, `${id}-s${i}`)),
    startPosition: { secX: 0, secY: 0, localX: 0, localY: 0 },
    bgLayout: null, bgTiles: null, rasterWiring: unknownWiring('(fixture)', '(fixture)', 'a hand-built act reads no aeon files'), sceneRef: null, stripPath: null,
  };
}

function zone(id: string, name: string, acts: Act[]): Zone {
  return {
    id, name, acts,
    tileset: { tiles: Array.from({ length: 16 }, tile) },
    palette: { lines: [line(), line(), line(), line()] },
  };
}

/**
 * THE FIXTURE. Two zones, three acts, ONE project-wide chunk stamped in all
 * three — which is the only shape in which this bug is visible at all.
 *
 *   ojz / act1  ← the act being edited      chunk-a x1 in s0, x1 in s1
 *   ojz / act2                              chunk-a x2 in s0
 *   ghz / act1  (same act id, other zone)   chunk-a x1 in s0
 *
 * `chunk-b` is stamped in ojz/act2 as a DISCRIMINATOR: a report that counted
 * every placement rather than this chunk's would over-count and be caught.
 */
function fixture() {
  const chunkA = fixtureChunk('chunk-a', 0);
  const chunkB = fixtureChunk('chunk-b', 3);

  const ojzAct1 = act('act1', 2);
  const ojzAct2 = act('act2', 1);
  const ghzAct1 = act('act1', 1);

  let next = 1;
  stamp(ojzAct1.sections[0]!, chunkA, 0, 0, next++);
  stamp(ojzAct1.sections[1]!, chunkA, 8, 0, next++);
  stamp(ojzAct2.sections[0]!, chunkA, 0, 0, next++);
  stamp(ojzAct2.sections[0]!, chunkA, 8, 4, next++);
  stamp(ojzAct2.sections[0]!, chunkB, 16, 0, next++);
  stamp(ghzAct1.sections[0]!, chunkA, 4, 4, next++);

  const zones = [
    zone('ojz', 'Oracle Jungle', [ojzAct1, ojzAct2]),
    zone('ghz', 'Green Hill', [ghzAct1]),
  ];
  return { zones, chunkA, chunkB, ojzAct1, ojzAct2, ghzAct1 };
}

/** Independent traversal — the source of every expected count below. */
function countPlacements(a: Act, chunkId: string): number {
  let n = 0;
  for (const s of a.sections) if (s) n += placementsOfChunk(s.chunkLinks, chunkId).length;
  return n;
}

/** A chunk with the SAME id and shape but different art, standing for "the
 *  author just edited it". Every word differs from the original's. */
function editedCopy(c: ChunkDef): ChunkDef {
  const out: ChunkDef = { ...c, nametable: new Uint16Array(c.nametable) };
  for (let i = 0; i < out.nametable.length; i++) {
    out.nametable[i] = packNametableWord(9 + (i % 5), 1, true, false, false);
  }
  expect([...out.nametable]).not.toEqual([...c.nametable]);
  return out;
}

describe('cross-act chunk copies', () => {
  it('the fixture really has the same chunk in three acts (anti-vacuous)', () => {
    const f = fixture();
    // Without this the whole file is a coin landing heads.
    expect(countPlacements(f.ojzAct1, 'chunk-a')).toBeGreaterThan(0);
    expect(countPlacements(f.ojzAct2, 'chunk-a')).toBeGreaterThan(0);
    expect(countPlacements(f.ghzAct1, 'chunk-a')).toBeGreaterThan(0);
    // ...and the acts are distinct objects sharing an id across zones, which is
    // exactly the case an id-based exclusion would get wrong.
    expect(f.ghzAct1.id).toBe(f.ojzAct1.id);
    expect(f.ghzAct1).not.toBe(f.ojzAct1);
  });

  it('act-scoped propagation leaves the OTHER acts stale — the defect, stated', () => {
    const f = fixture();
    const edited = editedCopy(f.chunkA);

    const beforeOther = new Uint16Array(f.ojzAct2.sections[0]!.tileGrid.nametable);
    const beforeOwn = new Uint16Array(f.ojzAct1.sections[0]!.tileGrid.nametable);

    const cmd = buildActPropagationCommand({
      chunk: edited, sections: f.ojzAct1.sections, description: 'edit chunk',
    });
    expect(cmd).not.toBeNull();

    const level: S4Level = {
      sections: f.ojzAct1.sections,
      tileset: f.zones[0].tileset,
      palette: f.zones[0].palette,
      act: f.ojzAct1,
    } as S4Level;
    const history = new EditHistory();
    history.execute(cmd!, level);

    // The instrument saw its subject: the edited act really changed.
    expect([...f.ojzAct1.sections[0]!.tileGrid.nametable]).not.toEqual([...beforeOwn]);
    expect([...f.ojzAct1.sections[1]!.tileGrid.nametable])
      .not.toEqual([...f.ojzAct2.sections[0]!.tileGrid.nametable]);
    // And the other act did not — this is the behaviour the panel used to deny.
    expect([...f.ojzAct2.sections[0]!.tileGrid.nametable]).toEqual([...beforeOther]);
    // ...while still CLAIMING the chunk, which is what makes it a divergence
    // rather than a detach.
    expect(countPlacements(f.ojzAct2, 'chunk-a')).toBeGreaterThan(0);

    // ONE undo step, and it reaches only the act it was built for. This is the
    // structural reason the report exists instead of a cross-act write: the
    // command addresses sections by flat index into THIS level.
    history.undo(level);
    expect([...f.ojzAct1.sections[0]!.tileGrid.nametable]).toEqual([...beforeOwn]);
    expect(history.canUndo).toBe(false);
  });

  it('reports every out-of-act copy, excluding the edited act, by identity', () => {
    const f = fixture();
    const copies = findOutOfActChunkCopies({
      chunkId: 'chunk-a', zones: f.zones, currentAct: f.ojzAct1,
    });

    const expectedOut = countPlacements(f.ojzAct2, 'chunk-a') + countPlacements(f.ghzAct1, 'chunk-a');
    const expectedIn = countPlacements(f.ojzAct1, 'chunk-a');
    expect(expectedOut).toBeGreaterThan(0);
    expect(expectedIn).toBeGreaterThan(0);

    expect(copies.placements).toBe(expectedOut);
    expect(copies.inActPlacements).toBe(expectedIn);
    expect(copies.locations.map((l) => `${l.zoneId}/${l.actId}`)).toEqual(['ojz/act2', 'ghz/act1']);
    expect(copies.locations.map((l) => l.placements))
      .toEqual([countPlacements(f.ojzAct2, 'chunk-a'), countPlacements(f.ghzAct1, 'chunk-a')]);
    // The other-zone act is flagged as such; the same-zone one is not.
    expect(copies.locations.map((l) => l.sameZone)).toEqual([true, false]);
    // The edited act is absent from the list, not merely zero-counted.
    expect(copies.locations.some((l) => l.zoneId === 'ojz' && l.actId === 'act1')).toBe(false);
  });

  it('counts only the named chunk (the chunk-b discriminator)', () => {
    const f = fixture();
    const a = findOutOfActChunkCopies({ chunkId: 'chunk-a', zones: f.zones, currentAct: f.ojzAct1 });
    const b = findOutOfActChunkCopies({ chunkId: 'chunk-b', zones: f.zones, currentAct: f.ojzAct1 });
    expect(b.placements).toBe(countPlacements(f.ojzAct2, 'chunk-b'));
    expect(b.placements).toBeGreaterThan(0);
    expect(b.placements).toBeLessThan(a.placements);
    expect(b.locations.map((l) => l.actId)).toEqual(['act2']);
  });

  it('a chunk stamped only in the edited act reports nothing — and says so', () => {
    const f = fixture();
    // chunk-b lives only in ojz/act2, so edit FROM there: no out-of-act copies.
    const copies = findOutOfActChunkCopies({ chunkId: 'chunk-b', zones: f.zones, currentAct: f.ojzAct2 });
    expect(copies.locations).toEqual([]);
    expect(copies.placements).toBe(0);
    // Anti-vacuous: distinguishable from "no copies anywhere".
    expect(copies.inActPlacements).toBe(countPlacements(f.ojzAct2, 'chunk-b'));
    expect(copies.inActPlacements).toBeGreaterThan(0);
    expect(describeOutOfActChunkCopies(copies)).toBeNull();
  });

  it('a chunk stamped nowhere reports nothing AND no in-act reach', () => {
    const f = fixture();
    const copies = findOutOfActChunkCopies({ chunkId: 'no-such-chunk', zones: f.zones, currentAct: f.ojzAct1 });
    expect(copies.placements).toBe(0);
    expect(copies.inActPlacements).toBe(0);
    expect(describeOutOfActChunkCopies(copies)).toBeNull();
  });

  it('the report names the places, the counts, and the cross-zone caveat', () => {
    const f = fixture();
    const copies = findOutOfActChunkCopies({ chunkId: 'chunk-a', zones: f.zones, currentAct: f.ojzAct1 });
    const msg = describeOutOfActChunkCopies(copies);
    expect(msg).not.toBeNull();
    expect(msg).toContain(String(copies.placements));
    expect(msg).toContain('NOT updated');
    for (const l of copies.locations) {
      expect(msg).toContain(l.zoneName);
      expect(msg).toContain(l.actId);
    }
    // The fixture HAS a cross-zone copy, so the caveat must be present here...
    expect(copies.locations.some((l) => !l.sameZone)).toBe(true);
    expect(msg).toContain('tileset');
    // ...and absent when every copy is in the same zone, or the caveat is noise
    // that would appear unconditionally and prove nothing.
    const sameZoneOnly = findOutOfActChunkCopies({
      chunkId: 'chunk-a', zones: [f.zones[0]], currentAct: f.ojzAct1,
    });
    expect(sameZoneOnly.locations.length).toBeGreaterThan(0);
    expect(sameZoneOnly.locations.every((l) => l.sameZone)).toBe(true);
    expect(describeOutOfActChunkCopies(sameZoneOnly)).not.toContain('tileset');
  });
});

describe('the panel sentence agrees with the scope', () => {
  it('the linked blurb names the ACT scope and does not promise every copy', () => {
    expect(CHUNK_LINK_LINKED_BLURB).toMatch(/IN THIS ACT/);
    expect(CHUNK_LINK_LINKED_BLURB).toMatch(/other acts/i);
    // The exact wording that was wrong: "updates every copy" with no scope
    // between "copy" and the qualifier. Assert the promise is qualified.
    expect(CHUNK_LINK_LINKED_BLURB).not.toMatch(/updates every copy (that )?you have not/i);
    expect(CHUNK_LINK_DETACHED_BLURB).toMatch(/NOT change them/);
  });

  /**
   * SOURCE-GREP GUARDS, and their limits are stated rather than implied — the
   * suite is node-only (no jsdom/RTL) and .tsx is not collected, so a rendering
   * test would silently never run. This is the house pattern
   * (workspace/__tests__/undo-keys.test.ts, classic-surface.test.ts), including
   * `code()`: comments are stripped first, so PROSE ABOUT a binding cannot
   * satisfy an assertion about one — this very file's headers name every symbol
   * below.
   *
   * WHAT THEY DO NOT PROVE. Nothing here shows what the panel PAINTS or what
   * the toast SAYS on screen. What they catch is the regression that actually
   * threatens this change: someone rewrites the save path or the panel and
   * quietly leaves behind a sentence — or drops the report — that no test is
   * looking at. The WORDS themselves are asserted for real, in node, on
   * `CHUNK_LINK_LINKED_BLURB` and `describeOutOfActChunkCopies` above; these two
   * rows are only the wire from those constants to the surfaces.
   */
  const code = (p: string) =>
    readFileSync(resolve(__dirname, p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('ChunkLinkOptions reads the blurbs from chunk-links, not a fresh literal', () => {
    const src = code('../../../renderer/components/ChunkLinkOptions.tsx');
    expect(src).toContain('CHUNK_LINK_LINKED_BLURB');
    expect(src).toContain('CHUNK_LINK_DETACHED_BLURB');
    expect(src).toMatch(/from '\.\.\/\.\.\/core\/editing\/chunk-links'/);
    // No inline re-statement of the promise anywhere in the executable source.
    expect(src).not.toMatch(/Stamps remember their chunk/);
  });

  it('the chunk-save path asks for the out-of-act copies and reports them', () => {
    const src = code('../../../renderer/workspace/facets/art-facet.tsx');
    // Asked for, over the whole PROJECT's zones — an act-local argument here
    // would make the report as blind as the propagation it is compensating for.
    expect(src).toContain('findOutOfActChunkCopies({');
    expect(src).toMatch(/zones:\s*pstate\.project\.zones/);
    expect(src).toMatch(/currentAct:\s*level\.act/);
    // ...and the answer actually reaches the toast rather than being computed
    // and dropped, on the warning tier so it gets read (toastStore.dwellMs).
    expect(src).toContain('describeOutOfActChunkCopies(outOfAct)');
    expect(src).toMatch(/outOfActNote \? 'warning' : 'success'/);
  });
});
