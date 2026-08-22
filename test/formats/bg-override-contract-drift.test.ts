import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { resolve } from 'path';
import {
  at,
  BGANIM_MAX_BANDS,
  BGANIM_PHASE_BANKS,
  BG_TILE_CAPACITY,
  BG_LAYOUT_WORDS,
  BG_LAYOUT_WORDS_LEGACY,
  LAYOUT_WORD_MAX,
  LAYOUT_TILE_INDEX_MASK,
  TILE_BYTES,
  TILE_PIXELS,
  TILE_PIXEL_MAX,
  TILE_WIDTH_PX,
  BGANIM_DRIVERS,
  TOP_LEVEL_KEYS,
  BAND_KEYS,
  OWNED_KEYS,
  ROUND_TRIPPED_KEYS,
  LEGACY_ANIM_KEY,
  BG_OVERRIDE_CONSUMER_PATH,
} from '../../src/core/formats/bg-override/bg-override';

/**
 * Drift gate for the vendored aeon consumer contract.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT — stated in full, because the honest
 * scope is narrower than "the contract is in sync":
 *
 *   PROVES  our vendored copy is the blob we pinned, so nobody can edit a
 *           constant in this repo (raise the band ceiling, change a default)
 *           without the pin failing; and every constant the codec exports is
 *           READ from that copy rather than typed beside it.
 *
 *   DOES NOT PROVE anything about aeon. Nothing inside this repo can observe
 *           aeon changing, and that is deliberate: a sibling-repo path probe is
 *           wrong from a worktree, wrong from a lone clone, and absent from a
 *           packaged build, and it would degrade to "not found -> skip", which
 *           renders "could not measure" as green. Re-reconciling by hand when a
 *           wave parcel is cut is the same overseer ritual the effects schema
 *           pin established (aurora ROADMAP item 12).
 *
 * Last reconciled 2026-08-22 against aeon
 * 1ee8f8e68d826b18023639ab32a8f7c82f238e62 (origin/master), reading
 * tools/EFFECTS_CONSUMER_CONTRACT.md, tools/inject_editor_bg.py,
 * tools/bg_override_io.py, tools/test_bg_emit.py, tools/vram_map.py,
 * engine/level/bg_anim.emp and engine/system/constants.emp.
 */

const CONTRACT_PATH = resolve(
  __dirname, '../../src/core/formats/bg-override/bganim-consumer-contract.json',
);
const CONTRACT_TEXT = readFileSync(CONTRACT_PATH, 'utf8');
const CONTRACT_SHA256 = '09729a7bd91b0fac9efc11cd31ca86e9066b3b9582c0035c69b7c4f502523a48';

describe('the vendored contract is the one we pinned', () => {
  it('matches the pinned content hash', () => {
    expect(createHash('sha256').update(CONTRACT_TEXT).digest('hex')).toBe(CONTRACT_SHA256);
  });

  it('records the aeon revision it was read at, and the documents it was read from', () => {
    expect(at(['source', 'commit'])).toMatch(/^[0-9a-f]{40}$/);
    // Every aeon authority the constants below cite must be named in `source`,
    // so a reader can re-derive rather than trust.
    const docs = (at(['source', 'documents']) as string[]).join('\n');
    for (const f of ['tools/EFFECTS_CONSUMER_CONTRACT.md', 'tools/inject_editor_bg.py',
                     'tools/bg_override_io.py', 'tools/test_bg_emit.py', 'tools/vram_map.py',
                     'engine/level/bg_anim.emp', 'engine/system/constants.emp']) {
      expect(docs).toContain(f);
    }
  });
});

describe('every exported constant is READ from the contract, not typed beside it', () => {
  /**
   * The pairing is written as data so the test cannot fall behind the module:
   * the second assertion below walks the CONTRACT's own constant list and fails
   * on any entry this table does not cover. A constant added to the vendored
   * file and never exported is the exact shape of "we vendored it and then
   * hardcoded it anyway".
   */
  const EXPORTED: Record<string, number> = {
    BGANIM_MAX_BANDS, BGANIM_PHASE_BANKS, BG_TILE_CAPACITY, TILE_BYTES, TILE_PIXELS,
    TILE_PIXEL_MAX, TILE_WIDTH_PX, BG_LAYOUT_WORDS, BG_LAYOUT_WORDS_LEGACY, LAYOUT_WORD_MAX,
    LAYOUT_TILE_INDEX_MASK,
  };

  it('every exported constant equals its contract value', () => {
    for (const [name, value] of Object.entries(EXPORTED)) {
      expect(value).toBe(at(['constants', name, 'value']));
    }
  });

  it('covers every constant the contract declares (BG_TILE_BASE_SLOT excepted, with a reason)', () => {
    const declared = Object.keys(at(['constants']) as Record<string, unknown>)
      .filter(k => !k.startsWith('$'));
    expect(declared.length).toBeGreaterThan(8);
    const uncovered = declared.filter(k => !(k in EXPORTED));
    // BG_TILE_BASE_SLOT is recorded but deliberately not enforced by this
    // codec: it is what makes the prefix relation an IDENTITY
    // (1024 * 32 = $8000 = the tile blob's own VRAM base), not a rule the JSON
    // document can violate. Its `why` says so, and this assertion holds the
    // exception to exactly one name.
    expect(uncovered).toEqual(['BG_TILE_BASE_SLOT']);
    expect(at(['constants', 'BG_TILE_BASE_SLOT', 'why'])).toMatch(/Not enforced by this codec/);
  });

  it('every constant carries at least one aeon authority', () => {
    for (const name of Object.keys(at(['constants']) as Record<string, unknown>)) {
      const auth = at(['constants', name, 'authorities']) as string[];
      expect(Array.isArray(auth)).toBe(true);
      expect(auth.length).toBeGreaterThan(0);
      for (const a of auth) expect(a).toMatch(/^aeon |^empyrean /);
    }
  });

  it('the band ceiling names all three aeon authorities and the gate that binds them', () => {
    // The one number this parcel was told not to pin. Three files hold it in
    // aeon and they are NOT collapsible (bg_anim.emp is lowered standalone
    // against an empty symbol table; the emitter's copy is Python), so the
    // aeon-side answer is "keep the mirrors, gate the drift". This asserts our
    // vendored extract records all three plus the gate, so a future reader can
    // re-derive instead of trusting a fourth copy.
    const auth = (at(['constants', 'BGANIM_MAX_BANDS', 'authorities']) as string[]).join('\n');
    expect(auth).toContain('engine/system/constants.emp');
    expect(auth).toContain('engine/level/bg_anim.emp');
    expect(auth).toContain('tools/inject_editor_bg.py');
    expect(at(['constants', 'BGANIM_MAX_BANDS', 'aeonGate']))
      .toContain('tools/test_bg_emit.py::TestBgAnimBandCeiling');
  });
});

describe('the contract declares a complete, well-formed key model', () => {
  it('gives every top-level key an ownership and a citation', () => {
    for (const key of TOP_LEVEL_KEYS) {
      const ownership = at(['topLevelKeys', key, 'ownership']);
      expect(['own', 'round-trip', 'legacy-read-only']).toContain(ownership);
      expect(at(['topLevelKeys', key, 'cite'])).toMatch(/inject_editor_bg\.py/);
    }
  });

  it('partitions the top-level keys with nothing uncategorised and nothing double-counted', () => {
    const partition = [...OWNED_KEYS, ...ROUND_TRIPPED_KEYS, LEGACY_ANIM_KEY];
    expect(partition).toHaveLength(TOP_LEVEL_KEYS.length);
    expect(partition.slice().sort()).toEqual([...TOP_LEVEL_KEYS].sort());
  });

  it('gives every band key a citation, and marks the required ones', () => {
    for (const key of BAND_KEYS) {
      expect(at(['bandKeys', key, 'cite'])).toMatch(/inject_editor_bg\.py/);
      expect(typeof at(['bandKeys', key, 'required'])).toBe('boolean');
    }
    const required = BAND_KEYS.filter(k => at(['bandKeys', k, 'required']) === true);
    // Derived from the consumer: cols/rows/pattern_px/phases are read with `[]`
    // (a KeyError at bake if absent); driver/rate_shift/slot_base use `.get()`.
    expect(required.slice().sort()).toEqual(['cols', 'pattern_px', 'phases', 'rows']);
  });

  it('names every invariant the codec and the band command enforce, prefix identity included', () => {
    const invariants = at(['invariants']) as Record<string, string>;
    expect(Object.keys(invariants).sort()).toEqual([
      'bandCeiling', 'capacity', 'columnBytesPowerOfTwo', 'contiguousPacking',
      'insideTheBlob', 'layoutTileIndex', 'patternWidth', 'prefixIdentity',
    ]);
    expect(invariants.prefixIdentity).toContain('phases[0] == tiles[slot_base');
    expect(invariants.capacity).toContain('PREFIX');
    // The layout-word rule the band command renumbers through. Both halves are
    // load-bearing and the second is the one a reader forgets: the index mask,
    // and the `word == 0` blank escape that is NOT a reference to tiles[0].
    expect(invariants.layoutTileIndex).toContain('attributes the consumer preserves');
    expect(invariants.layoutTileIndex).toContain('exactly 0');
  });

  it('records the driver table as a scalar-source map, not an axis list', () => {
    expect(BGANIM_DRIVERS).toEqual({ camera_x: 0, camera_y: 1, timer: 2 });
    expect(at(['drivers', '$comment'])).toMatch(/does NOT mean vertical motion/);
  });

  it('records the consumer-hardcoded path', () => {
    expect(BG_OVERRIDE_CONSUMER_PATH).toBe('games/sonic4/data/editor_bg_override.json');
  });
});
