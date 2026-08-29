// The `section_N.chunklinks.json` wire format — chunk identity on disk
// (owner ruling d-18c).
//
// The codec's job is narrow and its refusals are the interesting half: a
// partly-understood identity layer is not a weaker layer, it is a layer that
// will propagate a chunk into tiles it does not own. So this file spends most
// of its rows on documents that must be REFUSED, each with the failure it
// exists for, and every refusal is checked against wording only that rule uses
// (a matcher loose enough to catch a neighbouring error reports coverage it
// does not have — OVERSEER bar 2c).

import { describe, it, expect } from 'vitest';
import {
  clearedChunkLinksText, parseSectionChunkLinks, serializeSectionChunkLinks,
} from '../../src/core/formats/section-chunk-links';
import { createSectionChunkLinks } from '../../src/core/editing/chunk-links';
import type { SectionChunkLinks } from '../../src/core/model/s4-types';

/** A small layer whose tile count is stated once and derived everywhere else. */
const TILES = 64;

function layer(): SectionChunkLinks {
  const links = createSectionChunkLinks(TILES);
  links.placements.push(
    { id: 1, chunkId: 'canopy', baseCol: 0, baseRow: 0, collision: true },
    { id: 4, chunkId: 'vine', baseCol: 4, baseRow: 0, collision: false },
  );
  links.plane[0] = 1; links.plane[1] = 1;
  links.plane[8] = 4;
  links.plane[TILES - 1] = 4;
  return links;
}

describe('serializeSectionChunkLinks', () => {
  it('returns null when there is nothing to say', () => {
    expect(serializeSectionChunkLinks(null)).toBeNull();
    expect(serializeSectionChunkLinks(undefined)).toBeNull();
    expect(serializeSectionChunkLinks(createSectionChunkLinks(TILES))).toBeNull();
  });

  it('writes canonical (sorted-key, minified) JSON ending in exactly one newline', () => {
    const text = serializeSectionChunkLinks(layer())!;
    // §5 canonicalisation: keys sorted, array-heavy document minified. Asserted
    // as a byte string rather than by re-sorting, so a writer that emitted
    // contract order instead would fail here.
    expect(text.startsWith('{"placements":[{"baseCol":0,"baseRow":0,"chunkId":"canopy",')).toBe(true);
    expect(text.includes(' ')).toBe(false);
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('run-length encodes the plane, and the counts sum to the tile count', () => {
    const text = serializeSectionChunkLinks(layer())!;
    const doc = JSON.parse(text) as { runs: number[] };
    expect(doc.runs.length % 2).toBe(0);
    let total = 0;
    for (let i = 1; i < doc.runs.length; i += 2) total += doc.runs[i];
    // Derived from the fixture's own plane length, not typed in twice.
    expect(total).toBe(layer().plane.length);
    // ANTI-VACUOUS: the encoding really compressed something rather than
    // emitting one pair per tile.
    expect(doc.runs.length / 2).toBeLessThan(TILES);
    expect(doc.runs.length / 2).toBeGreaterThan(1);
  });
});

describe('round trip', () => {
  it('is the identity on placements AND plane, ids unrenumbered', () => {
    const original = layer();
    const back = parseSectionChunkLinks(serializeSectionChunkLinks(original)!, TILES);
    expect(back.placements).toEqual(original.placements);
    expect(Array.from(back.plane)).toEqual(Array.from(original.plane));
    // The ids were 1 and 4 — a gap. If the writer renumbered to 1,2 the
    // restored plane's refs would name placements that no longer exist.
    expect(back.placements.map(p => p.id)).toEqual([1, 4]);
  });

  it('is byte-stable: serialize(parse(serialize(x))) === serialize(x)', () => {
    const once = serializeSectionChunkLinks(layer())!;
    const twice = serializeSectionChunkLinks(parseSectionChunkLinks(once, TILES))!;
    expect(twice).toBe(once);
  });

  it('an ALL-LINKED plane survives, so the encoding is not only tested on sparse data', () => {
    const links = createSectionChunkLinks(TILES);
    links.placements.push({ id: 2, chunkId: 'full', baseCol: 0, baseRow: 0, collision: true });
    links.plane.fill(2);
    const back = parseSectionChunkLinks(serializeSectionChunkLinks(links)!, TILES);
    expect(Array.from(back.plane).every(v => v === 2)).toBe(true);
  });
});

describe('the cleared document', () => {
  it('parses to an empty layer of the right length, so a detach-everything sticks', () => {
    const back = parseSectionChunkLinks(clearedChunkLinksText(), TILES);
    expect(back.placements).toEqual([]);
    expect(back.plane).toHaveLength(TILES);
    expect(Array.from(back.plane).every(v => v === 0)).toBe(true);
  });
});

describe('refusals — each names the document this codec must not half-load', () => {
  const good = () => JSON.parse(serializeSectionChunkLinks(layer())!) as Record<string, unknown>;
  const parse = (doc: unknown, tiles = TILES) => () => parseSectionChunkLinks(JSON.stringify(doc), tiles);

  it('a plane that is SHORT for this section — the .collattr.bin lesson', () => {
    // Same document, a section one tile bigger. Nothing about the JSON is
    // malformed; it simply is not this section's plane.
    expect(parse(good(), TILES + 1)).toThrow(new RegExp(`runs cover ${TILES} tiles; this section has ${TILES + 1}`));
  });

  it('a plane that is LONG for this section', () => {
    expect(parse(good(), TILES - 1)).toThrow(/covers? more than this section's/);
  });

  it('a run naming a placement the document does not declare (a DANGLING reference)', () => {
    const doc = good();
    (doc.runs as number[])[0] = 99;
    expect(parse(doc)).toThrow(/names placement 99, which this document does not declare/);
  });

  it('a placement no run names (an EMPTY copy — the dangling reference mirrored)', () => {
    const doc = good();
    (doc.placements as unknown[]).push({ id: 77, chunkId: 'ghost', baseCol: 0, baseRow: 0, collision: false });
    expect(parse(doc)).toThrow(/placement 77 is declared but no run names it/);
  });

  it('two placements sharing an id', () => {
    const doc = good();
    (doc.placements as Array<{ id: number }>)[1].id = 1;
    expect(parse(doc)).toThrow(/duplicate placement id 1/);
  });

  it('an odd number of run values', () => {
    const doc = good();
    (doc.runs as number[]).push(3);
    expect(parse(doc)).toThrow(/runs must be \[value, count\] pairs/);
  });

  it('a zero or negative run count, which would make the plane silently short', () => {
    const doc = good();
    (doc.runs as number[])[1] = 0;
    expect(parse(doc)).toThrow(/has a bad count/);
  });

  it('a placement missing each required field, one at a time', () => {
    for (const key of ['id', 'chunkId', 'baseCol', 'baseRow', 'collision']) {
      const doc = good();
      delete (doc.placements as Array<Record<string, unknown>>)[0][key];
      expect(parse(doc), `missing ${key} must be refused`).toThrow();
    }
  });

  it('a chunkId that is not a string — the sceneRef trap, refused instead of read as null', () => {
    const doc = good();
    (doc.placements as Array<Record<string, unknown>>)[0].chunkId = 12;
    // parseSectionMeta reads a wrong-typed value as null and erases it on the
    // next save. This codec cannot do that: a placement with no chunk id is a
    // placement that propagates from nothing.
    expect(parse(doc)).toThrow(/has no chunkId/);
  });

  it('a document that is not an object, or is missing either array', () => {
    expect(() => parseSectionChunkLinks('[]', TILES)).toThrow(/no placements array/);
    expect(() => parseSectionChunkLinks('null', TILES)).toThrow(/not an object/);
    expect(parse({ placements: [] })).toThrow(/no runs array/);
    expect(parse({ runs: [] })).toThrow(/no placements array/);
  });

  it('placements with no runs at all — every copy would be nowhere', () => {
    const doc = good();
    doc.runs = [];
    expect(parse(doc)).toThrow(/declares 2 placement\(s\) but no runs naming them/);
  });

  it('malformed JSON', () => {
    expect(() => parseSectionChunkLinks('{', TILES)).toThrow();
  });
});
