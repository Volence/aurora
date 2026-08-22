import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import {
  parseBgOverride,
  serializeBgOverride,
  validateBgOverride,
  cloneBgOverride,
  bandTileCount,
  bandColumnBytes,
  animatedSlotCount,
  BGANIM_MAX_BANDS,
  BGANIM_PHASE_BANKS,
  BGANIM_DRIVER_NAMES,
  BG_TILE_CAPACITY,
  BG_LAYOUT_WORDS,
  OWNED_KEYS,
  TILE_PIXELS,
  TILE_WIDTH_PX,
  type BgOverrideDocument,
} from '../../src/core/formats/bg-override/bg-override';

/**
 * The with-bands golden for `editor_bg_override.json` — REAL data, not a
 * synthetic one.
 *
 * PROVENANCE, pinned three ways so the fixture cannot quietly become something
 * else:
 *   • aeon commit  b0e5a6617527f0593c8647bd3224ab334204344a  (`b0e5a661`),
 *     path `games/sonic4/data/editor_bg_override.json`
 *   • aeon git blob 33892d82c95d61a9214cb449fa7c67f683247ad3 — the same blob
 *     aeon's own gate (tools/test_bg_emit.py::TestBgAnimBandCoherence) reads
 *   • sha256 of the vendored bytes, asserted below
 *
 * WHY THIS REVISION. It is the last one that carried bands. At aeon `dd93a840`
 * (2026-07-21) `tools/png_to_bg_override.py` was introduced and run, and the two
 * bands here were destroyed by a whole-file overwrite that never read the file;
 * `bg_anim.emp` has read `BgAnim_Table: u16 = 0 (disabled)` ever since (aeon
 * docs/BUGS.md TOOL-01). So this is not merely "a document with bands" — it is
 * the only real one that has ever existed, and it is the exact data the
 * ownership ruling was decided on.
 *
 * IT IS VENDORED, not read out of the sibling repo. A fixture that lives only
 * in aeon is not a fixture here: it is absent from a lone clone and from a
 * packaged build, and a missing-file skip renders "could not measure" as green.
 *
 * The file is 407 KB and minified. That is the format, not a compression of it:
 * `tiles` alone is 340 arrays of 64 numbers and the two bands add
 * 8 x (128 + 64) x 64 more.
 */

const GOLDEN_PATH = resolve(__dirname, '../fixtures/bg-override/editor_bg_override.b0e5a661.json');
const GOLDEN = readFileSync(GOLDEN_PATH, 'utf8');
const GOLDEN_SHA256 = '4ae7bbb1b772bac968575b9aa8c7612555e478eadf5cdf1b4e6dd5638df9f03a';

/** The parsed fixture, fresh each time — every poison below mutates its copy. */
function golden(): BgOverrideDocument {
  return parseBgOverride(GOLDEN).doc;
}

describe('the b0e5a661 fixture is what it claims to be', () => {
  it('matches the vendored content hash', () => {
    expect(createHash('sha256').update(GOLDEN).digest('hex')).toBe(GOLDEN_SHA256);
  });

  /**
   * Anti-vacuity, first, because every assertion below is meaningless against a
   * fixture that lost its bands — which is precisely the accident this whole
   * parcel exists because of.
   */
  it('really carries two bands and a static blob bigger than they are', () => {
    const doc = JSON.parse(GOLDEN) as BgOverrideDocument;
    expect(doc.anims).toHaveLength(2);
    expect(doc.anims!.map(bandTileCount)).toEqual([128, 64]);
    expect(doc.tiles).toHaveLength(340);
    expect(doc.layout).toHaveLength(BG_LAYOUT_WORDS);
    // Both drivers that a real act used: one camera-driven, one time-driven.
    expect(doc.anims!.map(b => b.driver)).toEqual(['camera_x', 'timer']);
  });
});

describe('the golden validates under the codec', () => {
  it('parses with no issues and no notices', () => {
    const { doc, notices } = parseBgOverride(GOLDEN);
    expect(validateBgOverride(doc)).toEqual([]);
    // No legacy `anim` upgrade: this revision already used the plural key.
    expect(notices).toEqual([]);
  });

  /**
   * THE PREFIX IDENTITY, measured here on the real data rather than quoted from
   * the ruling. `phases[0] == tiles[slot_base : slot_base + cols*rows]` is the
   * fact that makes `anims`/`tiles`/`layout` one unit instead of three
   * separable keys, and everything downstream — the sole-writer ruling, the
   * single-undo band command, the refusal in aeon's importers — rests on it.
   */
  it('MEASURES phases[0] == tiles[slot_base : slot_base+n] for every band', () => {
    const doc = JSON.parse(GOLDEN) as BgOverrideDocument;
    let cursor = 0;
    const measured = doc.anims!.map((b, i) => {
      const n = bandTileCount(b);
      const base = b.slot_base ?? cursor;
      expect(base).toBe(cursor); // contiguity, on the real data
      const identity = JSON.stringify(b.phases[0]) === JSON.stringify(doc.tiles.slice(base, base + n));
      cursor += n;
      return { i, base, n, identity };
    });
    expect(measured).toEqual([
      { i: 0, base: 0, n: 128, identity: true },
      { i: 1, base: 128, n: 64, identity: true },
    ]);
  });

  it('shows animated slots are a PREFIX of tiles, not an addition to them', () => {
    // empyrean §5.1's corrected budget rule, on real numbers: 192 animated
    // slots sit INSIDE a 340-entry array, and the only capacity relation is
    // len(tiles) <= 448. The superseded `tiles + animated <= 448` rule would
    // have scored this document at 532 and called it over budget.
    const doc = JSON.parse(GOLDEN) as BgOverrideDocument;
    const animated = animatedSlotCount(doc.anims!);
    expect(animated).toBe(192);
    expect(animated).toBeLessThanOrEqual(doc.tiles.length);
    expect(doc.tiles.length).toBeLessThanOrEqual(BG_TILE_CAPACITY);
    expect(animated + doc.tiles.length).toBeGreaterThan(BG_TILE_CAPACITY);
  });

  it('satisfies every band-shape invariant, each derived rather than pinned', () => {
    const doc = JSON.parse(GOLDEN) as BgOverrideDocument;
    expect(doc.anims!.length).toBeLessThanOrEqual(BGANIM_MAX_BANDS);
    for (const b of doc.anims!) {
      expect(b.pattern_px).toBe(b.cols * TILE_WIDTH_PX);
      const colBytes = bandColumnBytes(b);
      expect(colBytes & (colBytes - 1)).toBe(0);
      expect(b.phases).toHaveLength(BGANIM_PHASE_BANKS);
      for (const bank of b.phases) {
        expect(bank).toHaveLength(bandTileCount(b));
        expect(bank[0]).toHaveLength(TILE_PIXELS);
      }
      expect(BGANIM_DRIVER_NAMES).toContain(b.driver);
    }
  });
});

describe('the golden round-trips', () => {
  /**
   * Semantic round-trip on real data. Byte identity with the fixture is NOT the
   * claim and is not achievable: the fixture was written by Python's
   * `json.dump`, whose default separators are `", "` / `": "`, where
   * `JSON.stringify` emits neither. What is pinned is that no VALUE and no KEY
   * changed.
   */
  it('parse -> serialize -> parse preserves the whole document', () => {
    const original = JSON.parse(GOLDEN);
    const out = JSON.parse(serializeBgOverride(golden()));
    expect(out).toEqual(original);
  });

  it('returns every key it does not own, unchanged, derived from the input', () => {
    // The b0e5a661 file has no unowned keys of its own, so the claim is made
    // testable by ADDING them — including one nothing in this repo models — and
    // computing the expectation from the input object rather than a literal.
    const doc = golden();
    doc.palette = Array.from({ length: 16 }, (_, i) => 0x0e00 + i);
    doc.palette_line = 2;
    doc.some_future_key = { nested: [1, { deep: true }] };
    const before = cloneBgOverride(doc);

    const out = JSON.parse(serializeBgOverride(doc)) as Record<string, unknown>;
    const notOwned = Object.keys(before).filter(k => !OWNED_KEYS.includes(k));
    expect(notOwned.sort()).toEqual(['palette', 'palette_line', 'some_future_key']);
    for (const k of notOwned) {
      expect(out[k]).toEqual((before as Record<string, unknown>)[k]);
    }
    expect(Object.keys(out).sort()).toEqual(Object.keys(before).sort());
  });

  /**
   * §5 DETERMINISM, on the real 407 KB document rather than a synthetic one.
   *
   * The fixture is reshuffled key-by-key at every depth — top level, each band,
   * and every nested object — so what is compared is two assemblies of one
   * content, never a document to itself. Nothing here is a pinned string: the
   * claim is that two writers agree, which is exactly what §5 buys and what
   * insertion-order canonicalization could not promise.
   */
  it('DETERMINISM: the same content assembled in reverse key order gives identical bytes', () => {
    /** Rebuild every object with its keys inserted in the OPPOSITE order. */
    function reversedKeys(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(reversedKeys);
      if (typeof value !== 'object' || value === null) return value;
      const src = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(src).reverse()) out[k] = reversedKeys(src[k]);
      return out;
    }

    /**
     * The fixture is DECORATED with unknown keys first, and that is the whole
     * discriminating power of this gate. b0e5a661 carries only declared keys,
     * so a contract-order writer already renders it deterministically and this
     * gate passes against the code it is meant to refute — measured: it did.
     * The keys nobody declared are the ones whose position insertion order
     * decides, so they are the ones that have to be here.
     */
    function decorated(): BgOverrideDocument {
      const doc = golden();
      doc.palette = Array.from({ length: 16 }, (_, i) => 0x0e00 + i);
      doc.palette_line = 2;
      doc.some_future_key = { zz: 1, aa: { yy: 1, bb: 2 } };
      (doc.anims![0] as unknown as Record<string, unknown>).authored_by = 'aurora';
      return doc;
    }
    const shuffled = reversedKeys(decorated()) as BgOverrideDocument;

    // Anti-vacuity, three ways: the reshuffle really changed the insertion
    // order, it changed it INSIDE a band, and the document really carries keys
    // the contract does not declare.
    expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(decorated()));
    expect(Object.keys(shuffled.anims![0])).not.toEqual(Object.keys(decorated().anims![0]));
    expect(Object.keys(shuffled)).toContain('some_future_key');
    expect(shuffled).toEqual(decorated());

    expect(serializeBgOverride(shuffled)).toBe(serializeBgOverride(decorated()));
  });

  it('is idempotent — a second write of the same document is byte-identical', () => {
    const once = serializeBgOverride(golden());
    const twice = serializeBgOverride(parseBgOverride(once).doc);
    expect(twice).toBe(once);
    // Subject check, derived from the fixture rather than pinned: the thing
    // being round-tripped really is the whole 407 KB document. Aurora's
    // rendering is SMALLER than the Python-written original (`json.dumps`
    // defaults to `", "` / `": "` separators; `JSON.stringify` emits neither)
    // but the same order of magnitude — 282,867 vs 407,055 bytes here.
    expect(once.length).toBeLessThan(GOLDEN.length);
    expect(once.length).toBeGreaterThan(GOLDEN.length / 2);
  });
});

/**
 * Poisons on the real data, one paired with each acceptance above. Without
 * these the section proves only that the codec accepts a file — which a codec
 * that validates nothing also does. These mirror aeon's own
 * TestBgAnimBandCoherence poisons, on the same fixture.
 */
describe('poisons — the corruptions this codec exists to stop, on real data', () => {
  it('rejects a regenerate-the-art-only edit (the merge that would bake cleanly)', () => {
    const doc = golden();
    doc.tiles[0] = doc.tiles[0].map(v => (v + 1) % 16);
    const issues = validateBgOverride(doc);
    expect(issues.join('\n')).toMatch(/anims\[0\]: phases\[0\] != tiles\[0:128\]/);
    // Exactly one issue: every other check on this document still passes, which
    // is the whole reason the identity has to be checked at all.
    expect(issues).toHaveLength(1);
    expect(() => serializeBgOverride(doc)).toThrow(/refusing to write/);
  });

  it('rejects a band nudged off the contiguous cursor', () => {
    const doc = golden();
    doc.anims![1].slot_base = doc.anims![1].slot_base! + 1;
    expect(validateBgOverride(doc).join('\n')).toMatch(/anims\[1\]\.slot_base is 129/);
  });

  it('rejects a blob truncated under the bands that index into it', () => {
    const doc = golden();
    doc.tiles = doc.tiles.slice(0, 100);
    expect(validateBgOverride(doc).join('\n'))
      .toMatch(/anims\[0\] covers slots 0\.\.128 but the static tile blob has only 100 tiles/);
  });

  it('rejects the blob GROWTH that actually happened, when bands are retained', () => {
    // The real shape of the loss at dd93a840: the tile count moved 340 -> 448,
    // so a merge preserving `anims` would not have produced subtly-stale art —
    // the prefix the bands index is not the same object at all. Simulated by
    // re-importing a different leading blob under the same bands.
    const doc = golden();
    const grown = doc.tiles.map(t => t.map(v => (v + 3) % 16));
    doc.tiles = [...grown, ...Array.from({ length: 108 }, () => Array.from({ length: TILE_PIXELS }, () => 1))];
    expect(doc.tiles).toHaveLength(448);
    const issues = validateBgOverride(doc).join('\n');
    expect(issues).toMatch(/anims\[0\]: phases\[0\] != tiles\[0:128\]/);
    expect(issues).toMatch(/anims\[1\]: phases\[0\] != tiles\[128:192\]/);
  });
});
