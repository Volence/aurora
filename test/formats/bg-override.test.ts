import { describe, it, expect } from 'vitest';
import {
  parseBgOverride,
  serializeBgOverride,
  validateBgOverride,
  cloneBgOverride,
  bgOverridePath,
  bandTileCount,
  bandColumnBytes,
  animatedSlotCount,
  at,
  BgOverrideError,
  BG_OVERRIDE_CONSUMER_PATH,
  BGANIM_MAX_BANDS,
  BGANIM_PHASE_BANKS,
  BGANIM_DRIVERS,
  BGANIM_DRIVER_NAMES,
  BAND_DEFAULTS,
  BAND_KEYS,
  TOP_LEVEL_KEYS,
  OWNED_KEYS,
  ROUND_TRIPPED_KEYS,
  LEGACY_ANIM_KEY,
  BG_TILE_CAPACITY,
  BG_LAYOUT_WORDS,
  BG_LAYOUT_WORDS_LEGACY,
  TILE_PIXELS,
  TILE_PIXEL_MAX,
  TILE_BYTES,
  TILE_WIDTH_PX,
  LAYOUT_WORD_MAX,
  type BgOverrideDocument,
  type BgOverrideBand,
} from '../../src/core/formats/bg-override/bg-override';

/**
 * `editor_bg_override.json` codec — wave-1 surface 4.
 *
 * Contract: aeon tools/EFFECTS_CONSUMER_CONTRACT.md §1.1/§1.2 and the CONSUMER
 * itself (tools/inject_editor_bg.py) at aeon
 * 1ee8f8e68d826b18023639ab32a8f7c82f238e62; empyrean
 * docs/AURORA_EFFECTS_SCHEMA.md §5/§5.1/§5.2 at empyrean 8f3fbf1; the ownership
 * ruling at docs/reviews/2026-08-22-bg-override-ownership-ruling.md.
 *
 * Every expectation below is DERIVED from the exported constants (which are
 * themselves read out of the vendored contract) rather than typed as a literal,
 * so a contract amendment moves the tests with it instead of leaving them
 * asserting last month's numbers.
 */

// ── Fixture builders ────────────────────────────────────────────────────────
// Everything is built from the constants, so raising a ceiling or changing a
// bank count re-shapes the fixtures rather than breaking them.

function tile(fill: number): number[] {
  return Array.from({ length: TILE_PIXELS }, () => fill % (TILE_PIXEL_MAX + 1));
}

/** `count` distinguishable tiles — distinguishable so a wrong slice is visible. */
function tiles(count: number): number[][] {
  return Array.from({ length: count }, (_, i) => tile(i + 1));
}

/**
 * A band whose phase-0 bank IS `blob[slotBase : slotBase+cols*rows]`, i.e. one
 * that satisfies the prefix identity by construction. `rows` is a power of two
 * so `rows*TILE_BYTES` is too.
 */
function band(blob: number[][], slotBase: number, cols: number, rows: number,
              extra: Partial<BgOverrideBand> = {}): BgOverrideBand {
  const n = cols * rows;
  const rest = blob.slice(slotBase, slotBase + n);
  return {
    cols,
    rows,
    pattern_px: cols * TILE_WIDTH_PX,
    phases: Array.from({ length: BGANIM_PHASE_BANKS }, (_, p) =>
      p === 0 ? rest.map(t => [...t]) : rest.map(t => t.map(v => (v + p) % (TILE_PIXEL_MAX + 1)))),
    ...extra,
  } as BgOverrideBand;
}

/** The smallest legal document: the two required keys and nothing else. */
function minimal(): BgOverrideDocument {
  return { layout: Array.from({ length: BG_LAYOUT_WORDS }, () => 0), tiles: tiles(10) };
}

/** A document with one 2x4 band packed at slot 0. */
function withOneBand(): BgOverrideDocument {
  const doc = minimal();
  doc.anims = [band(doc.tiles, 0, 2, 4)];
  return doc;
}

function issuesOf(doc: unknown): string {
  return validateBgOverride(doc).join('\n');
}

// ── Contract-derived constants ──────────────────────────────────────────────

describe('bg-override constants come out of the vendored contract', () => {
  it('exposes the three-authority band ceiling and the exact bank count', () => {
    // Not asserted as literals: asserted to BE the contract's values, and to be
    // the kind of number they claim to be. A contract that lost `value` throws
    // at import (see the `at()` test below) rather than yielding NaN here.
    expect(BGANIM_MAX_BANDS).toBe(at(['constants', 'BGANIM_MAX_BANDS', 'value']));
    expect(BGANIM_PHASE_BANKS).toBe(at(['constants', 'BGANIM_PHASE_BANKS', 'value']));
    expect(Number.isInteger(BGANIM_MAX_BANDS)).toBe(true);
    expect(BGANIM_MAX_BANDS).toBeGreaterThan(0);
    // The contract must name all THREE aeon authorities for the ceiling — the
    // whole reason it is not a literal here is that three files hold it.
    expect(at(['constants', 'BGANIM_MAX_BANDS', 'authorities'])).toHaveLength(3);
  });

  it('derives the column-stride and pattern-width relations rather than restating them', () => {
    // rows*TILE_BYTES power-of-two  <=>  rows power-of-two, TILE_BYTES being 2^5.
    expect(TILE_BYTES & (TILE_BYTES - 1)).toBe(0);
    expect(bandColumnBytes({ rows: 4 })).toBe(4 * TILE_BYTES);
    expect(bandTileCount({ cols: 3, rows: 4 })).toBe(12);
    expect(TILE_PIXELS).toBe(TILE_WIDTH_PX * TILE_WIDTH_PX);
  });

  it('reads the driver table, not an axis list', () => {
    expect(Object.keys(BGANIM_DRIVERS)).toEqual([...BGANIM_DRIVER_NAMES]);
    expect(BGANIM_DRIVER_NAMES.length).toBeGreaterThan(1);
    // The default driver must be one of the legal ones — a contract whose
    // default fell out of its own enum would make every default-carrying band
    // unwritable.
    expect(BGANIM_DRIVER_NAMES).toContain(BAND_DEFAULTS.driver);
    // Driver values are the consumer's DRIVERS dict codes, contiguous from 0.
    expect(Object.values(BGANIM_DRIVERS).slice().sort((a, b) => a - b))
      .toEqual(BGANIM_DRIVER_NAMES.map((_, i) => i));
  });

  it('at() throws naming the path instead of returning undefined', () => {
    // A quiet undefined here becomes NaN ceilings and a validator that accepts
    // everything, which looks exactly like a codec that is simply permissive.
    expect(() => at(['constants', 'NO_SUCH_CONSTANT']))
      .toThrow(/missing constants\.NO_SUCH_CONSTANT$/);
    expect(() => at(['constants', 'NO_SUCH_CONSTANT', 'value']))
      .toThrow(/constants\.NO_SUCH_CONSTANT is not an object/);
    expect(() => at(['path', 'deeper'])).toThrow(/path is not an object/);
  });

  it('composes the path the consumer hardcodes', () => {
    // The consumer's path is fixed (inject_editor_bg.py's OVERRIDE constant);
    // this ties Aurora's dataRoot composition to that literal so the two cannot
    // drift into pointing at different files.
    expect(bgOverridePath('games/sonic4/data/')).toBe(BG_OVERRIDE_CONSUMER_PATH);
  });
});

// ── The ownership boundary ──────────────────────────────────────────────────

describe('the ownership boundary (sole writer of record)', () => {
  it('partitions the declared keys into own / round-trip / legacy with nothing left over', () => {
    const partitioned = [...OWNED_KEYS, ...ROUND_TRIPPED_KEYS, LEGACY_ANIM_KEY];
    expect(partitioned.slice().sort()).toEqual([...TOP_LEVEL_KEYS].sort());
    // Subject check: the partition is non-trivial in every part.
    expect(OWNED_KEYS.length).toBeGreaterThanOrEqual(3);
    expect(ROUND_TRIPPED_KEYS.length).toBeGreaterThanOrEqual(2);
  });

  it('owns layout, tiles and anims as one unit', () => {
    expect([...OWNED_KEYS].sort()).toEqual(['anims', 'layout', 'tiles']);
  });

  it('round-trips palette and palette_line WITHOUT judging them', () => {
    const doc = minimal();
    // Deliberately illegal under the consumer's own asserts: 3 words, not 16,
    // and a palette_line the consumer's `>= 0` check would reject. Aurora does
    // not own these keys, so it must neither fix nor refuse them — refusing
    // would stop an author opening a file whose owner considers it fine, over a
    // constraint the drift rule lets aeon change without telling us.
    doc.palette = [1, 2, 3];
    doc.palette_line = 0;
    expect(issuesOf(doc)).toBe('');
    const out = JSON.parse(serializeBgOverride(doc));
    expect(out.palette).toEqual([1, 2, 3]);
    expect(out.palette_line).toBe(0);
  });

  it('carries every key it does not own back unchanged, derived from the input', () => {
    // The general claim, in the sharper form: not "remember to keep palette",
    // but "every key the writer does not own comes back identical", with the
    // expectation computed FROM the input object rather than copied.
    const doc = minimal();
    doc.palette = [1, 2, 3];
    doc.palette_line = 2;
    doc.some_future_key = { nested: [1, { deep: true }] };
    doc.another = 'opaque';

    const before = cloneBgOverride(doc);
    const out = JSON.parse(serializeBgOverride(doc)) as Record<string, unknown>;

    const notOwned = Object.keys(before).filter(k => !OWNED_KEYS.includes(k));
    // Subject check: the comparison covers a real key set including a key
    // nothing in this repo models. An empty `notOwned` would pass vacuously.
    expect(notOwned).toContain('some_future_key');
    expect(notOwned.length).toBeGreaterThanOrEqual(4);
    for (const k of notOwned) {
      expect(out[k]).toEqual((before as Record<string, unknown>)[k]);
    }
    // ...and nothing was dropped at all.
    expect(Object.keys(out).sort()).toEqual(Object.keys(before).sort());
  });

  it('round-trips an unknown key through parse as well as serialize', () => {
    const text = JSON.stringify({ ...minimal(), future_thing: { a: 1 } });
    const { doc } = parseBgOverride(text);
    expect(doc.future_thing).toEqual({ a: 1 });
    expect(JSON.parse(serializeBgOverride(doc)).future_thing).toEqual({ a: 1 });
  });

  it('round-trips an unknown key INSIDE a band', () => {
    // A band is a body Aurora owns and rewrites, which is exactly the shape
    // where a hand-enumerating writer silently drops a field. The band
    // canonicalizer is a loop over Object.keys for the same reason the
    // top-level one is.
    const doc = withOneBand();
    (doc.anims![0] as Record<string, unknown>).authored_by = 'aurora';
    const out = JSON.parse(serializeBgOverride(doc));
    expect(out.anims[0].authored_by).toBe('aurora');
  });

  /**
   * §5, at aeon 768eb2d8: keys sorted ALPHABETICALLY, not in contract order.
   * The ruling's reason is the one that bites exactly here — contract order has
   * no answer at all for the unknown keys this codec round-trips untouched,
   * because insertion order is not reproducible across writers. Alphabetical is
   * derivable from the data alone, so a key nobody has declared still has a
   * defined position.
   */
  it('writes every top-level key in alphabetical order, declared or not', () => {
    const doc: BgOverrideDocument = { z_last: 1, palette: [], tiles: tiles(4), a_first: 2,
      layout: Array.from({ length: BG_LAYOUT_WORDS }, () => 0) };
    const keys = Object.keys(JSON.parse(serializeBgOverride(doc)));
    // Derived from the document, not typed: whatever keys it has, sorted.
    expect(keys).toEqual(Object.keys(doc).slice().sort());
    // Subject check: the sorted order is NOT the contract order, so a
    // contract-ordered writer fails this rather than passing by coincidence.
    const declared = TOP_LEVEL_KEYS.filter(k => k in doc);
    expect(keys.slice(0, declared.length)).not.toEqual(declared);
    // ...and an unknown key really did sort INTO the declared ones rather than
    // being appended after them, which is the visible half of the change.
    expect(keys.indexOf('a_first')).toBeLessThan(keys.indexOf('layout'));
  });

  it('sorts RECURSIVELY — inside a band, and inside a key it does not understand', () => {
    // Python's sort_keys is recursive, so "the equivalent on the Aurora side"
    // is too. A band is the in-contract nested object; the unknown key is the
    // one nothing in this repo models, and it must sort just the same.
    const doc = withOneBand();
    const b = doc.anims![0] as Record<string, unknown>;
    b.zeta_extra = 1;
    b.alpha_extra = 2;
    doc.some_future_key = { zz: 1, aa: { yy: 1, bb: 2 } };

    const out = JSON.parse(serializeBgOverride(doc)) as Record<string, unknown>;
    const band0 = (out.anims as Record<string, unknown>[])[0];
    expect(Object.keys(band0)).toEqual(Object.keys(band0).slice().sort());
    expect(Object.keys(band0)[0]).toBe('alpha_extra');
    const future = out.some_future_key as Record<string, Record<string, unknown>>;
    expect(Object.keys(future)).toEqual(['aa', 'zz']);
    expect(Object.keys(future.aa)).toEqual(['bb', 'yy']);
  });

  /**
   * The property §5 buys, and the one this codec did not have: not "the bytes
   * are these bytes" but "two writers of the same content agree". Nothing here
   * is compared to a literal.
   */
  it('DETERMINISM: different insertion orders, identical content -> identical bytes', () => {
    const first = withOneBand();
    first.palette = [1, 2, 3];
    first.some_future_key = { zz: 1, aa: 2 };
    (first.anims![0] as Record<string, unknown>).zeta_extra = 7;

    // The same content, assembled by a writer that inserted differently — at
    // top level, inside the band, and inside the unknown key.
    // Built key-by-key in a DIFFERENT insertion order, so `layout`/`tiles` are
    // assigned below rather than in the literal — the double cast carries the
    // partially-built document across those lines and is what makes the
    // ordering, not the shape, the thing under test.
    const second: BgOverrideDocument = { some_future_key: { aa: 2, zz: 1 } } as unknown as BgOverrideDocument;
    second.tiles = first.tiles;
    second.palette = [1, 2, 3];
    second.anims = [{ zeta_extra: 7 } as unknown as BgOverrideBand];
    for (const k of Object.keys(first.anims![0] as Record<string, unknown>).reverse()) {
      (second.anims[0] as Record<string, unknown>)[k] =
        (first.anims![0] as Record<string, unknown>)[k];
    }
    second.layout = first.layout;

    // Anti-vacuity: they really are two different orderings of one content.
    expect(JSON.stringify(second)).not.toBe(JSON.stringify(first));
    expect(second).toEqual(first);

    expect(serializeBgOverride(second)).toBe(serializeBgOverride(first));
  });
});

// ── Reader ──────────────────────────────────────────────────────────────────

describe('bg-override reader', () => {
  it('accepts the minimal document and injects no defaults', () => {
    const { doc, notices } = parseBgOverride(JSON.stringify(minimal()));
    expect(notices).toEqual([]);
    expect('anims' in doc).toBe(false);
    expect('palette' in doc).toBe(false);
  });

  it('accepts a legacy 64x32 layout without re-lengthening it', () => {
    // The consumer zero-pads it. Aurora must not: silently rewriting someone's
    // layout to 4096 words is an unrequested edit that shows up as a diff.
    const doc = minimal();
    doc.layout = Array.from({ length: BG_LAYOUT_WORDS_LEGACY }, () => 0);
    const { doc: back } = parseBgOverride(JSON.stringify(doc));
    expect(back.layout).toHaveLength(BG_LAYOUT_WORDS_LEGACY);
    expect(JSON.parse(serializeBgOverride(back)).layout).toHaveLength(BG_LAYOUT_WORDS_LEGACY);
  });

  it('refuses malformed JSON and a non-object loudly', () => {
    expect(() => parseBgOverride('{"layout": [')).toThrow(/is not valid JSON/);
    expect(() => parseBgOverride('null')).toThrow(/must contain a JSON object/);
    expect(() => parseBgOverride('[]')).toThrow(/must contain a JSON object/);
  });

  it('refuses a document missing a required key', () => {
    const e = (() => { try { parseBgOverride('{"layout": []}'); } catch (x) { return x as BgOverrideError; } })()!;
    expect(e).toBeInstanceOf(BgOverrideError);
    expect(e.issues.join('\n')).toMatch(/missing the required key "tiles"/);
  });
});

// ── The legacy `anim` key ───────────────────────────────────────────────────

describe('the legacy singular `anim` key', () => {
  it('is upgraded to `anims` on read, with a notice, and never re-emitted', () => {
    // Neither alternative is open to a sole writer: re-emitting it violates
    // "writers must not emit it", dropping it destroys the band. The upgrade is
    // the only behaviour that does neither, and it is what the consumer already
    // does with the key.
    const doc = minimal();
    const b = band(doc.tiles, 0, 2, 4);
    const text = JSON.stringify({ ...doc, [LEGACY_ANIM_KEY]: b });

    const { doc: parsed, notices } = parseBgOverride(text);
    expect(LEGACY_ANIM_KEY in parsed).toBe(false);
    expect(parsed.anims).toHaveLength(1);
    expect(parsed.anims![0].cols).toBe(2);
    expect(notices.map((n) => n.message).join('\n')).toMatch(/legacy single-band/);
    expect(notices.map((n) => n.message).join('\n')).toMatch(/saving this document will rewrite the key/);
    // A WARNING, not a success: the band survived and nothing failed, but the
    // file on disk is not what it looks like and the next save rewrites it.
    // Not an error either — that would say the read failed, and it did not.
    expect(notices.map((n) => n.severity)).toEqual(['warning']);

    const out = JSON.parse(serializeBgOverride(parsed));
    expect(LEGACY_ANIM_KEY in out).toBe(false);
    expect(out.anims).toHaveLength(1);
  });

  it('refuses a document carrying BOTH anim and anims rather than picking one', () => {
    const doc = withOneBand();
    const text = JSON.stringify({ ...doc, [LEGACY_ANIM_KEY]: band(doc.tiles, 0, 2, 4) });
    expect(() => parseBgOverride(text)).toThrow(/carries BOTH "anims" and the legacy/);
    expect(() => parseBgOverride(text)).toThrow(/would silently ignore one of them/);
  });

  /**
   * The `anims: []` + legacy `anim` carve-out. The consumer's fallback is
   * `if anims is None and data.get('anim')` — keyed on ABSENCE — so an empty
   * array suppresses it and the band is silently dropped. Emptiness is
   * load-bearing here, which is exactly why the benign normalization must not
   * reach it: dropping the empty key would silently promote the legacy band,
   * and keeping it would silently discard it. Both are guesses.
   */
  it('refuses an EMPTY anims beside a legacy anim, in its own words', () => {
    const doc = minimal();
    const text = JSON.stringify({ ...doc, anims: [], [LEGACY_ANIM_KEY]: band(doc.tiles, 0, 2, 4) });
    expect(() => parseBgOverride(text)).toThrow(/carries an EMPTY "anims" alongside the legacy/);
    expect(() => parseBgOverride(text)).toThrow(/would be SILENTLY DROPPED/);
    // ...and it does NOT read as the other accident: the two messages are
    // distinct because the two accidents are.
    expect(() => parseBgOverride(text)).not.toThrow(/would silently ignore one of them/);
  });

  it('CONTROL: a NON-empty anims beside a legacy anim gets the other message', () => {
    const doc = withOneBand();
    const text = JSON.stringify({ ...doc, [LEGACY_ANIM_KEY]: band(doc.tiles, 0, 2, 4) });
    expect(() => parseBgOverride(text)).toThrow(/would silently ignore one of them/);
    expect(() => parseBgOverride(text)).not.toThrow(/EMPTY "anims"/);
  });

  it('CONTROL: an empty anims with NO legacy anim is benign and normalizes', () => {
    // The attribution check for the pair above: the refusal is caused by the
    // COMBINATION, not by the empty array on its own.
    const text = JSON.stringify({ ...minimal(), anims: [] });
    expect(() => parseBgOverride(text)).not.toThrow();
  });

  it('refuses a falsy legacy key instead of reading it as no-bands', () => {
    const text = JSON.stringify({ ...minimal(), [LEGACY_ANIM_KEY]: null });
    expect(() => parseBgOverride(text)).toThrow(/holds ONE band object/);
  });

  it('refuses to serialize a document still carrying the legacy key', () => {
    const doc = minimal();
    (doc as Record<string, unknown>)[LEGACY_ANIM_KEY] = band(doc.tiles, 0, 2, 4);
    expect(() => serializeBgOverride(doc)).toThrow(/refusing to write the legacy "anim" key/);
  });
});

// ── The empty-`anims` normalization (read) vs refusal (write) ───────────────

describe('an empty `anims` key is unauthored, not invalid', () => {
  /**
   * The ruling: refusing this on READ would make Aurora unable to open a
   * document `inject_editor_bg.py` bakes perfectly well (`if anims:` is false,
   * so it emits the disabled stub), leaving an author no recourse but to
   * hand-edit JSON — the outcome sole ownership exists to prevent. It is the
   * same SHAPE as the legacy `anim` upgrade: a fact about the document that
   * changes on the next save. So the reader normalizes and reports; the writer
   * refuses, which is the boundary that can actually enforce it.
   */
  it('parses as the no-bands document, dropping the key', () => {
    const { doc } = parseBgOverride(JSON.stringify({ ...minimal(), anims: [] }));
    expect('anims' in doc).toBe(false);
  });

  it('says so in a notice rather than doing it silently', () => {
    const { notices } = parseBgOverride(JSON.stringify({ ...minimal(), anims: [] }));
    expect(notices).toHaveLength(1);
    expect(notices[0].message).toMatch(/carried an empty "anims" key/);
    expect(notices[0].message).toMatch(/neither absent nor authored/);
    expect(notices[0].message).toMatch(/saving will drop the key/);
    // Not alarming about a loss that did not happen.
    expect(notices[0].message).toMatch(/No band was lost: there was none/);
    // ...and NOT on the success channel, where it would arrive green on a 2.2s
    // dwell. Nothing failed, but the document changes shape on the next save,
    // which is the warning channel's whole reason to exist (toastStore.dwellMs).
    expect(notices[0].severity).toBe('warning');
  });

  it('CONTROL: a document with no `anims` key at all is silent', () => {
    // Without this, "a notice was emitted" is equally true of a reader that
    // notices every document.
    const { doc, notices } = parseBgOverride(JSON.stringify(minimal()));
    expect('anims' in doc).toBe(false);
    expect(notices).toEqual([]);
  });

  it('CONTROL: a document with real bands keeps them and stays silent', () => {
    const { doc, notices } = parseBgOverride(JSON.stringify(withOneBand()));
    expect(doc.anims).toHaveLength(1);
    expect(notices).toEqual([]);
  });

  it('round-trips: the normalized document saves, where the raw one would not', () => {
    // The whole point of normalizing rather than refusing — a file that opens
    // must also be saveable, or the trap has only moved.
    const raw = { ...minimal(), anims: [] } as BgOverrideDocument;
    expect(() => serializeBgOverride(raw)).toThrow(/neither absent nor authored/);
    const { doc } = parseBgOverride(JSON.stringify(raw));
    const out = JSON.parse(serializeBgOverride(doc));
    expect('anims' in out).toBe(false);
  });

  it('leaves every other key alone while normalizing', () => {
    const src = { ...minimal(), anims: [], palette: [1, 2], future_thing: { a: 1 } };
    const { doc } = parseBgOverride(JSON.stringify(src));
    const out = JSON.parse(serializeBgOverride(doc)) as Record<string, unknown>;
    const expected = Object.keys(src).filter(k => k !== 'anims').sort();
    expect(Object.keys(out).sort()).toEqual(expected);
    expect(out.future_thing).toEqual({ a: 1 });
    expect(out.palette).toEqual([1, 2]);
  });

  it('the write-side refusal points at the reader rather than blaming the author', () => {
    const doc = minimal();
    doc.anims = [];
    expect(issuesOf(doc)).toMatch(/did not come through the reader/);
  });
});

// ── The invariants ──────────────────────────────────────────────────────────

describe('band invariants — each one is a document that would bake CLEANLY', () => {
  it('accepts a well-formed band (the control every refusal below is measured against)', () => {
    expect(issuesOf(withOneBand())).toBe('');
  });

  it('refuses more bands than the engine sizes BgAnim_LastStep for', () => {
    // Derived: one more than the ceiling, each 1x1 so the blob can hold them.
    const doc = minimal();
    doc.tiles = tiles(BGANIM_MAX_BANDS + 1);
    doc.anims = Array.from({ length: BGANIM_MAX_BANDS + 1 }, (_, i) => band(doc.tiles, i, 1, 1));
    expect(issuesOf(doc)).toMatch(
      new RegExp(`${BGANIM_MAX_BANDS + 1} bands authored; the engine sizes BgAnim_LastStep for at most ${BGANIM_MAX_BANDS}`),
    );
    // ...and exactly the ceiling is accepted, so the bound is the bound.
    doc.anims = Array.from({ length: BGANIM_MAX_BANDS }, (_, i) => band(doc.tiles, i, 1, 1));
    expect(issuesOf(doc)).toBe('');
  });

  it('refuses a rows count whose column stride is not a power of two', () => {
    const doc = minimal();
    doc.tiles = tiles(12);
    doc.anims = [band(doc.tiles, 0, 2, 3)]; // 3*32 = 96, not a power of two
    expect(issuesOf(doc)).toMatch(/column bytes rows\*32 = 3\*32 = 96 is not a power of two/);
    // The neighbouring power of two is fine — the refusal is about the value,
    // not about odd rows or about this fixture.
    doc.anims = [band(doc.tiles, 0, 2, 4)];
    expect(issuesOf(doc)).toBe('');
  });

  it('refuses pattern_px that is not cols*8', () => {
    const doc = withOneBand();
    doc.anims![0].pattern_px = doc.anims![0].cols * TILE_WIDTH_PX + 1;
    expect(issuesOf(doc)).toMatch(/pattern_px is 17 but must equal cols\*8 = 16/);
  });

  it('refuses a slot_base that does not equal the running cursor', () => {
    const doc = minimal();
    doc.tiles = tiles(24);
    doc.anims = [band(doc.tiles, 0, 2, 4, { slot_base: 0 }), band(doc.tiles, 8, 2, 4, { slot_base: 8 })];
    expect(issuesOf(doc)).toBe('');
    // Move the SECOND band one slot along: still inside the blob, still 8 tiles,
    // but no longer contiguous.
    doc.anims[1] = band(doc.tiles, 9, 2, 4, { slot_base: 9 });
    expect(issuesOf(doc)).toMatch(/anims\[1\]\.slot_base is 9 but the running cursor is 8/);
    expect(issuesOf(doc)).toMatch(/pack contiguously from slot 0/);
  });

  it('accepts an omitted slot_base and derives the cursor for it', () => {
    const doc = minimal();
    doc.tiles = tiles(24);
    doc.anims = [band(doc.tiles, 0, 2, 4), band(doc.tiles, 8, 2, 4)];
    expect(issuesOf(doc)).toBe('');
    // The derivation is real: a second band whose phase-0 art is the WRONG
    // slice fails the identity even with no slot_base spelled anywhere.
    doc.anims[1] = band(doc.tiles, 0, 2, 4);
    expect(issuesOf(doc)).toMatch(/anims\[1\]: phases\[0\] != tiles\[8:16\]/);
  });

  it('refuses a band that reaches past the end of the static blob', () => {
    const doc = minimal();
    doc.tiles = tiles(4);
    doc.anims = [band(tiles(8), 0, 2, 4)];
    expect(issuesOf(doc)).toMatch(/covers slots 0\.\.8 but the static tile blob has only 4 tiles/);
  });

  it('refuses phases[0] that is not the tiles it covers — the identity that bakes cleanly', () => {
    const doc = withOneBand();
    // The exact corruption a "merge that preserves anims" would ship:
    // regenerate the art only, keep the bands.
    doc.tiles[0] = doc.tiles[0].map(v => (v + 1) % (TILE_PIXEL_MAX + 1));
    const msg = issuesOf(doc);
    expect(msg).toMatch(/phases\[0\] != tiles\[0:8\]/);
    expect(msg).toMatch(/bake cleanly, and ship a ROM whose bands DMA stale phase art/);
    // Every OTHER check still passes — which is why this one has to exist.
    expect(validateBgOverride(doc)).toHaveLength(1);
  });

  it('refuses the wrong number of phase banks in either direction', () => {
    const doc = withOneBand();
    doc.anims![0].phases = doc.anims![0].phases.slice(0, BGANIM_PHASE_BANKS - 1);
    expect(issuesOf(doc)).toMatch(
      new RegExp(`phases has ${BGANIM_PHASE_BANKS - 1} banks; a band needs EXACTLY ${BGANIM_PHASE_BANKS}`),
    );
    const doc2 = withOneBand();
    doc2.anims![0].phases = [...doc2.anims![0].phases, doc2.anims![0].phases[0]];
    expect(issuesOf(doc2)).toMatch(new RegExp(`phases has ${BGANIM_PHASE_BANKS + 1} banks`));
  });

  it('refuses a bank that is not cols*rows tiles', () => {
    const doc = withOneBand();
    doc.anims![0].phases[3] = doc.anims![0].phases[3].slice(0, 7);
    expect(issuesOf(doc)).toMatch(/phases\[3\] must hold cols\*rows = 8 tiles, got 7/);
  });

  it('refuses an unlisted driver, naming the legal ones', () => {
    const doc = withOneBand();
    doc.anims![0].driver = 'camera_z';
    const msg = issuesOf(doc);
    expect(msg).toMatch(/driver is "camera_z"/);
    for (const name of BGANIM_DRIVER_NAMES) expect(msg).toContain(name);
    // ...and every legal driver really is legal.
    for (const name of BGANIM_DRIVER_NAMES) {
      doc.anims![0].driver = name;
      expect(issuesOf(doc)).toBe('');
    }
  });

  it('refuses a negative rate_shift but accepts 0', () => {
    const doc = withOneBand();
    doc.anims![0].rate_shift = -1;
    expect(issuesOf(doc)).toMatch(/rate_shift must be an integer >= 0/);
    doc.anims![0].rate_shift = 0;
    expect(issuesOf(doc)).toBe('');
  });

  it('refuses an `anims` key that is present but empty — on the WRITE path', () => {
    // aeon's own gate asserts the no-bands document has NO `anims` key: "an
    // empty `anims` key is neither absent nor authored". That binds the writer.
    // The reader's half of this is the normalization suite below.
    const doc = minimal();
    doc.anims = [];
    expect(issuesOf(doc)).toMatch(/neither absent nor authored/);
    expect(() => serializeBgOverride(doc)).toThrow(/neither absent nor authored/);
  });
});

describe('document invariants', () => {
  it('refuses a layout that is neither 64x64 nor the legacy 64x32', () => {
    const doc = minimal();
    doc.layout = Array.from({ length: BG_LAYOUT_WORDS - 1 }, () => 0);
    expect(issuesOf(doc)).toMatch(
      new RegExp(`layout has ${BG_LAYOUT_WORDS - 1} words; it must be ${BG_LAYOUT_WORDS}`),
    );
  });

  it('refuses a layout word outside the >H pack range', () => {
    const doc = minimal();
    doc.layout[7] = LAYOUT_WORD_MAX + 1;
    expect(issuesOf(doc)).toMatch(new RegExp(`layout\\[7\\] is ${LAYOUT_WORD_MAX + 1}`));
    doc.layout[7] = LAYOUT_WORD_MAX;
    expect(issuesOf(doc)).toBe('');
  });

  it('refuses more tiles than the BG capacity, and accepts exactly the capacity', () => {
    const doc = minimal();
    doc.tiles = tiles(BG_TILE_CAPACITY + 1);
    expect(issuesOf(doc)).toMatch(
      new RegExp(`tiles has ${BG_TILE_CAPACITY + 1} entries, over the BG tile capacity of ${BG_TILE_CAPACITY}`),
    );
    doc.tiles = tiles(BG_TILE_CAPACITY);
    expect(issuesOf(doc)).toBe('');
  });

  it('does NOT add animated slots to the capacity — they are a prefix of tiles', () => {
    // empyrean §5.1's correction, as a behaviour: a full 448-tile blob with a
    // band over its front is legal. Under the old `tiles + animated <= 448`
    // rule this document would have been refused, which is what would have told
    // Aurora the flagship act cannot carry any band at all.
    const doc = minimal();
    doc.tiles = tiles(BG_TILE_CAPACITY);
    doc.anims = [band(doc.tiles, 0, 8, 4)];
    expect(animatedSlotCount(doc.anims)).toBe(32);
    expect(issuesOf(doc)).toBe('');
  });

  it('refuses a pixel value the consumer would silently mask to something else', () => {
    const doc = minimal();
    doc.tiles[2][10] = TILE_PIXEL_MAX + 1;
    const msg = issuesOf(doc);
    expect(msg).toMatch(new RegExp(`tiles\\[2\\]\\[10\\] is ${TILE_PIXEL_MAX + 1}`));
    expect(msg).toMatch(/would bake silently as a 0/);
  });

  it('refuses a tile that is not 64 pixel values', () => {
    const doc = minimal();
    doc.tiles[1] = doc.tiles[1].slice(0, TILE_PIXELS - 1);
    expect(issuesOf(doc)).toMatch(
      new RegExp(`tiles\\[1\\] must be ${TILE_PIXELS} pixel values \\(row-major 8x8\\), got ${TILE_PIXELS - 1}`),
    );
  });
});

// ── Writer ──────────────────────────────────────────────────────────────────

describe('bg-override writer', () => {
  it('refuses to write an invalid document', () => {
    const doc = withOneBand();
    doc.tiles[0] = doc.tiles[0].map(v => (v + 1) % (TILE_PIXEL_MAX + 1));
    expect(() => serializeBgOverride(doc)).toThrow(/refusing to write/);
    expect(() => serializeBgOverride(doc)).toThrow(/phases\[0\] != tiles/);
  });

  it('emits minified JSON (the file is ~400 KB with no bands at all)', () => {
    // §5's COMPACTNESS half: this is the tile-array document class, so
    // separators are (",", ":") — the scalar class (scene files) is the one
    // that pretty-prints.
    const doc = minimal();
    const text = serializeBgOverride(doc);
    // One line — plus the canonical trailing newline (§8, 2026-08-26), which
    // is the only `\n` in the file.
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.slice(0, -1)).not.toContain('\n');
    expect(text).not.toContain(', ');
    expect(text).not.toContain(': ');
    // Derived: whatever the first key sorts to, that is what the file opens on.
    expect(text.startsWith(`{"${Object.keys(doc).slice().sort()[0]}":`)).toBe(true);
  });

  it('is idempotent — the writer has one canonical rendering', () => {
    const doc = withOneBand();
    doc.palette = [7];
    const once = serializeBgOverride(doc);
    const twice = serializeBgOverride(parseBgOverride(once).doc);
    expect(twice).toBe(once);
  });

  it('cloneBgOverride is a deep copy, not a field-enumerating one', () => {
    const doc = withOneBand();
    doc.some_future_key = { deep: [1, 2] };
    const copy = cloneBgOverride(doc);
    expect(copy).toEqual(doc);
    expect(copy.some_future_key).not.toBe(doc.some_future_key);
    (copy.anims as BgOverrideBand[])[0].cols = 99;
    expect(doc.anims![0].cols).toBe(2);
  });
});

// ── Coverage: every key the contract declares is exercised ──────────────────

describe('coverage, derived from the vendored contract', () => {
  /**
   * A poison per declared band key. The table is looked up by walking the
   * CONTRACT's key list, so adding a key to the contract fails this test with
   * "no poison defined" until someone decides how the codec treats it —
   * rather than the new key quietly going unvalidated.
   */
  const BAND_POISONS: Record<string, { poison: (b: BgOverrideBand) => void; match: RegExp }> = {
    cols: { poison: b => { b.cols = 0; }, match: /cols must be an integer >= 1/ },
    rows: { poison: b => { b.rows = 0; }, match: /rows must be an integer >= 1/ },
    pattern_px: { poison: b => { b.pattern_px = 1; }, match: /pattern_px is 1 but must equal/ },
    driver: { poison: b => { b.driver = 'nope'; }, match: /driver is "nope"/ },
    rate_shift: { poison: b => { b.rate_shift = -1; }, match: /rate_shift must be an integer >= 0/ },
    slot_base: { poison: b => { b.slot_base = 5; }, match: /slot_base is 5 but the running cursor is 0/ },
    phases: { poison: b => { b.phases = []; }, match: /phases has 0 banks/ },
  };

  it('has a poison for every band key the contract declares', () => {
    expect(BAND_KEYS.length).toBeGreaterThan(4);
    expect(BAND_KEYS.filter(k => !(k in BAND_POISONS))).toEqual([]);
  });

  for (const key of BAND_KEYS) {
    it(`refuses a poisoned "${key}"`, () => {
      const entry = BAND_POISONS[key];
      const doc = withOneBand();
      entry.poison(doc.anims![0]);
      expect(issuesOf(doc)).toMatch(entry.match);
    });
  }

  it('every required key, dropped, is reported by name', () => {
    for (const key of TOP_LEVEL_KEYS.filter(k => at(['topLevelKeys', k, 'required']) === true)) {
      const doc = withOneBand() as Record<string, unknown>;
      delete doc[key];
      expect(issuesOf(doc)).toMatch(new RegExp(`missing the required key "${key}"`));
    }
  });

  it('every required BAND key, dropped, is reported by name', () => {
    for (const key of BAND_KEYS.filter(k => at(['bandKeys', k, 'required']) === true)) {
      const doc = withOneBand();
      delete (doc.anims![0] as Record<string, unknown>)[key];
      expect(issuesOf(doc)).toMatch(new RegExp(`anims\\[0\\] is missing the required key "${key}"`));
    }
  });
});
